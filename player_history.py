"""
player_history.py
Fetches historical NFL game logs from Sleeper stats API + historical weather
from Open-Meteo archive. Uses parallel requests and in-memory caching.
"""

import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

SLEEPER_BASE = "https://api.sleeper.app/v1"

# Approximate first Sunday of each NFL regular season
_WEEK1_SUNDAY = {
    "2025": datetime(2025, 9, 7),
    "2024": datetime(2024, 9, 8),
    "2023": datetime(2023, 9, 10),
    "2022": datetime(2022, 9, 11),
}

# In-memory cache: (season, week) → full player-stats dict
# Historical stats never change, so cache indefinitely per process.
_week_stats_cache: dict = {}


# ── Date helpers ──────────────────────────────────────────────────────────────

def _week_date(season: str, week: int) -> str | None:
    base = _WEEK1_SUNDAY.get(str(season))
    if not base:
        return None
    sunday = base + timedelta(weeks=week - 1)
    return sunday.strftime("%Y-%m-%d")


# ── Data fetchers ─────────────────────────────────────────────────────────────

def _fetch_week_stats(season: str, week: int) -> dict:
    key = (season, week)
    if key in _week_stats_cache:
        return _week_stats_cache[key]
    try:
        url = f"{SLEEPER_BASE}/stats/nfl/regular/{season}/{week}"
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            data = r.json() or {}
            _week_stats_cache[key] = data
            return data
    except Exception:
        pass
    return {}


def _fetch_hist_weather(lat: float, lon: float, date_str: str) -> dict | None:
    """Historical daily weather from Open-Meteo archive API (free, no key)."""
    try:
        r = requests.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude":           lat,
                "longitude":          lon,
                "start_date":         date_str,
                "end_date":           date_str,
                "daily":              "temperature_2m_max,precipitation_sum,"
                                      "windspeed_10m_max,weathercode",
                "temperature_unit":   "fahrenheit",
                "wind_speed_unit":    "mph",
                "precipitation_unit": "inch",
                "timezone":           "auto",
            },
            timeout=10,
        )
        r.raise_for_status()
        d = r.json().get("daily", {})
        temp   = d.get("temperature_2m_max", [None])[0]
        wind   = d.get("windspeed_10m_max",  [None])[0]
        precip = d.get("precipitation_sum",  [None])[0]
        code   = d.get("weathercode",        [None])[0]
        return {
            "indoor":    False,
            "temp_f":    round(temp)      if temp   is not None else None,
            "wind_mph":  round(wind)      if wind   is not None else 0,
            "precip_in": round(precip, 2) if precip is not None else 0.0,
            "condition": _wmo_label(code),
        }
    except Exception:
        return None


def _wmo_label(code) -> str:
    if code is None: return "Unknown"
    c = int(code)
    if c == 0:   return "Clear"
    if c <= 3:   return "Cloudy"
    if c <= 49:  return "Fog"
    if c <= 59:  return "Drizzle"
    if c <= 69:  return "Rain"
    if c <= 79:  return "Snow"
    if c <= 82:  return "Showers"
    if c <= 94:  return "Snow Showers"
    return "Thunderstorm"


# ── Stat helpers ──────────────────────────────────────────────────────────────

def _played(stats: dict, position: str) -> bool:
    if position == "QB":
        return bool(stats.get("pass_att") or stats.get("rush_att"))
    if position == "RB":
        return bool(stats.get("rush_att") or stats.get("rec_tgt"))
    if position in ("WR", "TE"):
        return bool(stats.get("rec_tgt") or stats.get("rush_att"))
    if position == "K":
        return bool(stats.get("fga") or stats.get("fgm"))
    return bool(stats.get("pts_ppr") or stats.get("pts_std"))


def _extract_stats(raw: dict, position: str) -> dict:
    def i(k):
        return int(float(raw.get(k) or 0))

    if position == "QB":
        return {
            "cmp":      i("pass_cmp"),
            "att":      i("pass_att"),
            "pass_yd":  i("pass_yd"),
            "pass_td":  i("pass_td"),
            "int":      i("pass_int"),
            "sack":     i("sack"),
            "rush_att": i("rush_att"),
            "rush_yd":  i("rush_yd"),
            "rush_td":  i("rush_td"),
        }
    elif position == "RB":
        return {
            "rush_att": i("rush_att"),
            "rush_yd":  i("rush_yd"),
            "rush_td":  i("rush_td"),
            "tgt":      i("rec_tgt"),
            "rec":      i("rec"),
            "rec_yd":   i("rec_yd"),
            "rec_td":   i("rec_td"),
        }
    elif position in ("WR", "TE"):
        return {
            "tgt":      i("rec_tgt"),
            "rec":      i("rec"),
            "rec_yd":   i("rec_yd"),
            "rec_td":   i("rec_td"),
            "yac":      i("rec_yac"),
            "rush_att": i("rush_att"),
            "rush_yd":  i("rush_yd"),
        }
    elif position == "K":
        return {
            "fgm":      i("fgm"),
            "fga":      i("fga"),
            "fg_lng":   i("fg_lng"),
            "xpm":      i("xpm"),
            "xpa":      i("xpa"),
            "fg_0_19":  f"{i('fgm_0_19')}/{i('fg_att_0_19')}",
            "fg_20_29": f"{i('fgm_20_29')}/{i('fg_att_20_29')}",
            "fg_30_39": f"{i('fgm_30_39')}/{i('fg_att_30_39')}",
            "fg_40_49": f"{i('fgm_40_49')}/{i('fg_att_40_49')}",
            "fg_50p":   f"{i('fgm_50p')}/{i('fg_att_50p')}",
        }
    return {}


# ── Public API ────────────────────────────────────────────────────────────────

def fetch_game_log(player_id: str, position: str, seasons=None) -> list:
    """
    Returns game-by-game log for a player, newest first.
    Each entry: { season, week, date, opponent, home, stats, pts_ppr, weather }
    """
    from stadium_info import get_stadium
    from sleeper_api import get_all_players, get_matchup_map

    if seasons is None:
        seasons = ["2025"]
    seasons = [str(s) for s in seasons]

    all_weeks = [(s, w) for s in seasons for w in range(1, 19)]

    # ── Step 1: fetch all week stats in parallel ──────────────────────────
    with ThreadPoolExecutor(max_workers=10) as ex:
        stat_futs = {ex.submit(_fetch_week_stats, s, w): (s, w) for s, w in all_weeks}
        stats_by_week = {}
        for fut in as_completed(stat_futs):
            key = stat_futs[fut]
            stats_by_week[key] = fut.result()

    # ── Step 2: identify weeks the player actually played ─────────────────
    all_players  = get_all_players()
    player_info  = all_players.get(player_id, {})
    team         = player_info.get("team", "")

    played_weeks = []
    for season, week in all_weeks:
        raw = stats_by_week.get((season, week), {}).get(player_id)
        if raw and _played(raw, position):
            played_weeks.append((season, week, raw))

    if not played_weeks:
        return []

    # ── Step 3: fetch schedules for those weeks in parallel ───────────────
    unique_week_keys = {(s, w) for s, w, _ in played_weeks}
    with ThreadPoolExecutor(max_workers=8) as ex:
        sched_futs = {
            ex.submit(get_matchup_map, s, w, "regular"): (s, w)
            for s, w in unique_week_keys
        }
        matchup_maps = {}
        for fut in as_completed(sched_futs):
            key = sched_futs[fut]
            matchup_maps[key] = fut.result()

    # ── Step 4: build game list + collect outdoor weather requests ─────────
    games = []
    weather_needed = []

    for season, week, raw in played_weeks:
        mm      = matchup_maps.get((season, week), {})
        matchup = mm.get(team, {})

        # Primary: ESPN/Sleeper schedule (most accurate for home/away)
        if isinstance(matchup, dict) and matchup.get("opp"):
            opponent = matchup["opp"]
            home_tm  = matchup.get("home", team)
            is_home  = (home_tm == team)
        else:
            # Fallback: extract opp directly from Sleeper stats payload
            opp_raw  = raw.get("opp") or raw.get("opp_team") or ""
            opponent = opp_raw.upper() if opp_raw else "TBD"
            home_raw = raw.get("home")
            is_home  = bool(int(home_raw)) if home_raw is not None else None

        date_str = _week_date(season, week)
        stadium  = get_stadium(home_tm) if home_tm else None
        weather  = None

        if stadium:
            if stadium.get("indoor"):
                weather = {
                    "indoor": True, "temp_f": None,
                    "wind_mph": 0,  "precip_in": 0, "condition": "Dome",
                }
            elif date_str:
                weather_needed.append((len(games), stadium["lat"], stadium["lon"], date_str))

        pts = float(raw.get("pts_ppr") or raw.get("pts_std") or 0)

        games.append({
            "season":   season,
            "week":     week,
            "date":     date_str,
            "opponent": opponent,
            "home":     is_home,   # True=home, False=away, None=unknown
            "stats":    _extract_stats(raw, position),
            "pts_ppr":  round(pts, 2),
            "weather":  weather,
        })

    # ── Step 5: fetch historical weather in parallel ───────────────────────
    if weather_needed:
        with ThreadPoolExecutor(max_workers=8) as ex:
            wfuts = {
                ex.submit(_fetch_hist_weather, lat, lon, dt): idx
                for idx, lat, lon, dt in weather_needed
            }
            for fut in as_completed(wfuts):
                idx = wfuts[fut]
                w   = fut.result()
                if w:
                    games[idx]["weather"] = w

    games.sort(key=lambda g: (g["season"], g["week"]), reverse=True)
    return games
