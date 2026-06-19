import requests
import json
import os
from datetime import datetime, timedelta

SLEEPER_BASE = "https://api.sleeper.app/v1"

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "players_cache.json")
CACHE_MAX_AGE_HOURS = 24

# Scoring format -> Sleeper projection field
SCORING_FIELDS = {
    "ppr":      "pts_ppr",
    "half_ppr": "pts_half_ppr",
    "std":      "pts_std",
}


def _cache_is_fresh():
    if not os.path.exists(CACHE_FILE):
        return False
    age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(CACHE_FILE))
    return age < timedelta(hours=CACHE_MAX_AGE_HOURS)


def get_nfl_state():
    resp = requests.get(f"{SLEEPER_BASE}/state/nfl", timeout=10)
    resp.raise_for_status()
    return resp.json()


def get_all_players(use_cache=True):
    if use_cache and _cache_is_fresh():
        with open(CACHE_FILE, "r") as f:
            return json.load(f)

    print("  Downloading player roster from Sleeper (one-time, ~10MB)...")
    resp = requests.get(f"{SLEEPER_BASE}/players/nfl", timeout=30)
    resp.raise_for_status()
    data = resp.json()

    with open(CACHE_FILE, "w") as f:
        json.dump(data, f)

    return data


def get_projections(season, week, season_type="regular"):
    url = f"{SLEEPER_BASE}/projections/nfl/{season_type}/{season}/{week}"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _resolve_week_season():
    """Returns (week, season, season_type) for the current NFL period."""
    state = get_nfl_state()
    week        = state.get("week", 1)
    season      = state.get("season", "2025")
    season_type = state.get("season_type", "regular")

    if season_type not in ("regular", "post"):
        season_type = "regular"
        week = 18

    return week, season, season_type


def fetch_week_players(scoring="ppr"):
    """
    Returns skill-position players (QB/RB/WR/TE/K) with projected fantasy points.

    Args:
        scoring (str): 'ppr', 'half_ppr', or 'std'

    Returns:
        players (dict): {name: {name, position, team, opponent, ppg, injury_status, bye_week}}
        week (int)
        season (str)
    """
    pts_field = SCORING_FIELDS.get(scoring, "pts_ppr")
    week, season, season_type = _resolve_week_season()

    print(f"  Fetching Week {week} projections ({season} {season_type}, {scoring.upper()})...")

    all_players  = get_all_players()
    projections  = get_projections(season, week, season_type)

    players = {}
    relevant_positions = {"QB", "RB", "WR", "TE", "K"}
    MIN_PROJECTION = 1.0

    for player_id, proj in projections.items():
        if player_id not in all_players:
            continue

        info     = all_players[player_id]
        position = info.get("position")

        if position not in relevant_positions:
            continue

        pts = proj.get(pts_field) or proj.get("pts_ppr")
        if pts is None or float(pts) < MIN_PROJECTION:
            continue

        name = info.get("full_name")
        team = info.get("team")

        if not name or not team:
            continue

        players[name] = {
            "name":          name,
            "position":      position,
            "team":          team,
            "opponent":      "TBD",
            "ppg":           round(float(pts), 2),
            "injury_status": info.get("injury_status") or "Active",
            "bye_week":      info.get("bye_week"),
        }

    return players, week, season


def fetch_dst_players():
    """
    Returns all D/ST units with their raw projected stats for custom scoring.

    Returns:
        dst_list (list): [{name, team, stats}]
        week (int)
        season (str)
    """
    week, season, season_type = _resolve_week_season()

    all_players = get_all_players()
    projections = get_projections(season, week, season_type)

    dst_list = []

    for player_id, proj in projections.items():
        if player_id not in all_players:
            continue

        info = all_players[player_id]
        if info.get("position") != "DEF":
            continue

        team = info.get("team")
        if not team:
            continue

        name = info.get("full_name") or f"{team} Defense"

        # Grab the raw stats Sleeper projects for this defense
        stats = {
            "pts_allow": proj.get("pts_allow"),
            "yds_allow": proj.get("yds_allow"),
            "sack":      proj.get("sack"),
            "int":       proj.get("int"),
            "fum_rec":   proj.get("fum_rec"),
            "safe":      proj.get("safe"),
            "blk_kick":  proj.get("blk_kick"),
            "td":        proj.get("td"),
        }

        dst_list.append({
            "name":  name,
            "team":  team,
            "stats": stats,
        })

    return dst_list, week, season
