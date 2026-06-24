"""
NFL Projection Engine — Flask Web App
Run with: python3 app.py
Then open: http://localhost:5000
"""

from flask import Flask, render_template, jsonify, request
from projections import get_adjusted_projection
from dst_scoring import calculate_dst_points, TRIPLE_FLEX_DST_SETTINGS
import threading

app = Flask(__name__)

# ── In-memory cache so we only hit Sleeper once per server run ─────────────
_cache = {
    "players":  None,
    "dst":      None,
    "week":     None,
    "season":   None,
}
_lock = threading.Lock()


def _load_players(scoring="ppr"):
    """Load players from Sleeper (or CSV fallback). Cached in memory."""
    global _cache
    with _lock:
        if _cache["players"] is None:
            from data_loader import load_players
            _cache["players"] = load_players()
    return _cache["players"]


def _get_state():
    from data_loader import load_players
    _load_players()
    return _cache.get("week"), _cache.get("season")


def _build_player_list(scoring="ppr"):
    """Build a sorted list of player dicts with projected points."""
    from sleeper_api import SCORING_FIELDS, get_all_players, get_projections, _resolve_week_season

    players_raw = _load_players()
    pts_field = SCORING_FIELDS.get(scoring, "pts_ppr")

    # If we already have players loaded we re-score them using the right field.
    # For simplicity we re-fetch projections only when scoring changes.
    try:
        from sleeper_api import get_projections, _resolve_week_season, get_all_players
        from stadium_info import get_stadium, STADIUMS
        from weather import fetch_weather, get_weather_modifiers, DOME_WEATHER
        from def_rankings import get_def_modifier, calculate_def_rankings

        week, season, season_type = _resolve_week_season()
        projections  = get_projections(season, week, season_type)
        all_sleeper  = get_all_players()

        # Pre-fetch defensive rankings once for this request
        def_rankings = calculate_def_rankings(season, week, season_type)

        # Pre-fetch weather per home stadium (cache by home_team)
        _weather_by_home = {}

        # Build id->name reverse map from cache
        name_to_id = {
            info.get("full_name"): pid
            for pid, info in all_sleeper.items()
            if info.get("full_name")
        }

        result = []
        for name, data in players_raw.items():
            pid = name_to_id.get(name)
            pts = None
            if pid and pid in projections:
                pts = projections[pid].get(pts_field) or projections[pid].get("pts_ppr")
            if pts is None:
                pts = data.get("ppg", 0)

            position  = data["position"]
            team      = data.get("team", "")
            home_team = data.get("home_team")
            opponent  = data.get("opponent", "TBD")

            # ── Weather ────────────────────────────────────────────────
            weather = None
            if home_team and home_team not in _weather_by_home:
                stadium = get_stadium(home_team)
                if stadium:
                    if stadium["indoor"]:
                        _weather_by_home[home_team] = DOME_WEATHER
                    else:
                        _weather_by_home[home_team] = fetch_weather(
                            stadium["lat"], stadium["lon"]
                        )
                else:
                    _weather_by_home[home_team] = None

            if home_team:
                weather = _weather_by_home.get(home_team)

            weather_mods = get_weather_modifiers(weather)

            # ── Defensive modifier ──────────────────────────────────────
            # Extract opponent abbreviation from "vs. CHI" or "@ DAL"
            opp_abbr = ""
            if opponent not in ("TBD", ""):
                parts = opponent.strip().split(" ")
                opp_abbr = parts[-1] if parts else ""

            def_mod = def_rankings.get(opp_abbr, {}).get(position, 0.0) if opp_abbr else 0.0

            # ── Final adjusted projection ───────────────────────────────
            adjusted = get_adjusted_projection(
                position, float(pts), opp_abbr or "TBD",
                weather_modifiers=weather_mods,
                def_modifier=def_mod,
            )

            result.append({
                "name":          name,
                "position":      position,
                "team":          team,
                "opponent":      opponent,
                "projection":    adjusted,
                "injury_status": data.get("injury_status", "Active"),
                "bye_week":      data.get("bye_week"),
                "player_id":     data.get("player_id"),
                "weather":       weather,
            })

        result.sort(key=lambda p: p["projection"], reverse=True)
        for i, p in enumerate(result):
            p["rank"] = i + 1

        return result, week, season

    except Exception:
        # Fallback: use pre-loaded ppg values
        result = []
        for name, data in players_raw.items():
            adjusted = get_adjusted_projection(
                data["position"], data.get("ppg", 0), data.get("opponent", "TBD")
            )
            result.append({
                "name":          name,
                "position":      data["position"],
                "team":          data.get("team", ""),
                "opponent":      data.get("opponent", "TBD"),
                "projection":    adjusted,
                "injury_status": data.get("injury_status", "Active"),
                "bye_week":      data.get("bye_week"),
                "player_id":     data.get("player_id"),
                "weather":       None,
            })
        result.sort(key=lambda p: p["projection"], reverse=True)
        for i, p in enumerate(result):
            p["rank"] = i + 1
        return result, None, None


# ── Routes ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/players")
def api_players():
    """
    Returns ranked player list.
    Query params:
      scoring   = ppr | half_ppr | std  (default: ppr)
      position  = ALL | QB | RB | WR | TE | K | FLEX  (default: ALL)
      hide_bye  = true | false  (default: false)
      week      = current NFL week (for bye filtering)
      q         = search string (optional)
    """
    scoring  = request.args.get("scoring",  "ppr")
    position = request.args.get("position", "ALL").upper()
    hide_bye = request.args.get("hide_bye", "false").lower() == "true"
    query    = request.args.get("q", "").lower().strip()

    players, week, season = _build_player_list(scoring)

    flex_positions = {"RB", "WR", "TE"}

    filtered = []
    for p in players:
        # Position filter
        if position == "FLEX" and p["position"] not in flex_positions:
            continue
        if position not in ("ALL", "FLEX") and p["position"] != position:
            continue

        # Bye week filter
        if hide_bye and p.get("bye_week") and p["bye_week"] == week:
            continue

        # Search filter
        if query and query not in p["name"].lower():
            continue

        filtered.append(p)

    return jsonify({
        "players": filtered,
        "week":    week,
        "season":  season,
        "count":   len(filtered),
    })


@app.route("/api/dst")
def api_dst():
    """
    Returns D/ST rankings with custom scoring.
    Query param: settings (JSON string) — optional, defaults to Triple Flex settings.
    """
    import json as _json
    custom_settings_str = request.args.get("settings", None)
    settings = TRIPLE_FLEX_DST_SETTINGS

    if custom_settings_str:
        try:
            settings = _json.loads(custom_settings_str)
        except Exception:
            pass

    try:
        from sleeper_api import fetch_dst_players
        dst_list, week, season = fetch_dst_players()
    except Exception as e:
        return jsonify({"error": str(e), "dst": [], "week": None, "season": None})

    scored = []
    for dst in dst_list:
        pts = calculate_dst_points(dst["stats"], settings)
        scored.append({
            "name":       dst["name"],
            "team":       dst["team"],
            "projection": pts,
            "stats":      dst["stats"],
        })

    scored.sort(key=lambda d: d["projection"], reverse=True)
    for i, d in enumerate(scored):
        d["rank"] = i + 1

    return jsonify({"dst": scored, "week": week, "season": season})


@app.route("/api/lineup", methods=["POST"])
def api_lineup():
    """
    Optimizes a starting lineup from a user's roster.

    POST body (JSON):
    {
      "roster": ["Josh Allen", "Bijan Robinson", ...],
      "settings": {
        "scoring":         "ppr",
        "qb":  1, "rb": 2, "wr": 2, "te": 1,
        "flex": 1, "k": 1, "dst": 1,
        "flex_positions":  ["RB", "WR", "TE"]
      }
    }
    """
    data     = request.get_json()
    roster   = data.get("roster", [])
    settings = data.get("settings", {})
    scoring  = settings.get("scoring", "ppr")

    players_all, week, season = _build_player_list(scoring)

    # Also fetch D/ST players and add them to the lookup map
    try:
        from sleeper_api import fetch_dst_players
        dst_list, _, _ = fetch_dst_players()
        dst_scored = []
        for dst in dst_list:
            pts = calculate_dst_points(dst["stats"], TRIPLE_FLEX_DST_SETTINGS)
            dst_scored.append({
                "name":          dst["name"],
                "position":      "DEF",
                "team":          dst["team"],
                "projection":    round(pts, 2),
                "injury_status": "Active",
                "bye_week":      None,
                "player_id":     None,
                "weather":       None,
                "opponent":      "",
            })
        players_all = list(players_all) + dst_scored
    except Exception:
        pass

    # Look up each rostered player in the full list
    name_map = {p["name"].lower(): p for p in players_all}
    roster_players = []
    not_found = []

    for name in roster:
        match = name_map.get(name.lower())
        if match:
            roster_players.append(match)
        else:
            not_found.append(name)

    starters, bench = _optimize_lineup(roster_players, settings)

    return jsonify({
        "starters":  starters,
        "bench":     bench,
        "not_found": not_found,
        "week":      week,
        "season":    season,
    })


def _optimize_lineup(roster_players, settings):
    """Greedy lineup optimizer — fills mandatory slots first, then FLEX."""
    qb_slots   = int(settings.get("qb",   1))
    rb_slots   = int(settings.get("rb",   2))
    wr_slots   = int(settings.get("wr",   2))
    te_slots   = int(settings.get("te",   1))
    flex_slots = int(settings.get("flex", 1))
    k_slots    = int(settings.get("k",    1))
    dst_slots  = int(settings.get("dst",  1))
    flex_pos   = set(settings.get("flex_positions", ["RB", "WR", "TE"]))

    # Group by position, sorted by projection desc
    by_pos = {}
    for p in roster_players:
        by_pos.setdefault(p["position"], []).append(p)
    for pos in by_pos:
        by_pos[pos].sort(key=lambda x: x["projection"], reverse=True)

    starters = []
    used     = set()

    def fill_slot(slot_label, position, count):
        available = [p for p in by_pos.get(position, []) if p["name"] not in used]
        for p in available[:count]:
            starters.append({**p, "slot": slot_label})
            used.add(p["name"])

    # Fill fixed position slots
    fill_slot("QB",  "QB",  qb_slots)
    fill_slot("K",   "K",   k_slots)
    fill_slot("DST", "DEF", dst_slots)
    fill_slot("RB",  "RB",  rb_slots)
    fill_slot("WR",  "WR",  wr_slots)
    fill_slot("TE",  "TE",  te_slots)

    # Fill FLEX from eligible positions
    flex_pool = []
    for pos in flex_pos:
        flex_pool.extend([p for p in by_pos.get(pos, []) if p["name"] not in used])
    flex_pool.sort(key=lambda x: x["projection"], reverse=True)

    for p in flex_pool[:flex_slots]:
        starters.append({**p, "slot": "FLEX"})
        used.add(p["name"])

    # Everyone else is bench
    bench = [{**p, "slot": "BN"} for p in roster_players if p["name"] not in used]
    bench.sort(key=lambda x: x["projection"], reverse=True)

    return starters, bench


@app.route("/api/explain", methods=["POST"])
def api_explain():
    """
    Uses Claude API to generate a natural-language Start/Sit explanation.

    POST body (JSON):
    {
      "player1": { "name": "...", "position": "...", "team": "...", "projection": 0.0, "rank": 1 },
      "player2": { "name": "...", "position": "...", "team": "...", "projection": 0.0, "rank": 1 },
      "scoring": "ppr"
    }
    """
    import os
    import anthropic as _anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return jsonify({"error": "ANTHROPIC_API_KEY not set on server."}), 500

    data     = request.get_json()
    p1       = data.get("player1", {})
    p2       = data.get("player2", {})
    scoring  = data.get("scoring", "PPR")

    prompt = f"""You are an expert fantasy football analyst. A user is deciding who to START this week in a {scoring.upper()} league.

Player 1: {p1['name']} ({p1['position']}, {p1['team']})
  - Projected points: {p1['projection']:.2f}
  - Overall rank: #{p1['rank']}

Player 2: {p2['name']} ({p2['position']}, {p2['team']})
  - Projected points: {p2['projection']:.2f}
  - Overall rank: #{p2['rank']}

Give a concise 2-3 sentence Start/Sit recommendation. Lead with who to start and why, mention the projection edge, and note anything relevant about matchup, format, or risk. Be direct and confident."""

    try:
        client   = _anthropic.Anthropic(api_key=api_key)
        message  = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        analysis = message.content[0].text
        return jsonify({"analysis": analysis})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/trade", methods=["POST"])
def api_trade():
    """
    Uses Claude to evaluate a fantasy trade.

    POST body (JSON):
    {
      "giving":   [{ "name": "...", "position": "...", "team": "...", "projection": 0.0, "rank": 1 }, ...],
      "receiving": [...],
      "scoring":  "ppr"
    }
    """
    import os
    import anthropic as _anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return jsonify({"error": "ANTHROPIC_API_KEY not set on server."}), 500

    data      = request.get_json()
    giving    = data.get("giving", [])
    receiving = data.get("receiving", [])
    scoring   = data.get("scoring", "ppr").upper()

    if not giving or not receiving:
        return jsonify({"error": "Both sides of the trade must have at least one player."}), 400

    def fmt_players(players):
        lines = []
        for p in players:
            lines.append(f"  - {p['name']} ({p['position']}, {p['team']}) — Proj: {p['projection']:.2f} pts, Rank #{p['rank']}")
        return "\n".join(lines)

    prompt = f"""You are an expert fantasy football analyst evaluating a trade in a {scoring} league.

YOU ARE GIVING:
{fmt_players(giving)}

YOU ARE RECEIVING:
{fmt_players(receiving)}

Evaluate this trade from the perspective of the person giving away the first group and receiving the second group. Give a clear verdict (Win / Lose / Fair) and 2-3 sentences of reasoning. Consider total projected value, positional scarcity, and roster balance. Be direct and confident."""

    try:
        client  = _anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=250,
            messages=[{"role": "user", "content": prompt}],
        )
        analysis = message.content[0].text
        return jsonify({"analysis": analysis})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/waiver", methods=["POST"])
def api_waiver():
    """
    Uses Claude to recommend waiver wire pickups.

    POST body (JSON):
    {
      "roster":    [{ "name": "...", "position": "...", "team": "...", "projection": 0.0, "rank": 1 }, ...],
      "available": [...],
      "need":      "RB",   // optional positional need
      "scoring":   "ppr"
    }
    """
    import os
    import anthropic as _anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return jsonify({"error": "ANTHROPIC_API_KEY not set on server."}), 500

    data      = request.get_json()
    roster    = data.get("roster", [])
    available = data.get("available", [])
    need      = data.get("need", "")
    scoring   = data.get("scoring", "ppr").upper()

    if not available:
        return jsonify({"error": "Add at least one available player to analyze."}), 400

    def fmt(players):
        return "\n".join(
            f"  - {p['name']} ({p['position']}, {p['team']}) — Proj: {p['projection']:.2f} pts, Rank #{p['rank']}"
            for p in players
        )

    roster_section = f"MY CURRENT ROSTER:\n{fmt(roster)}\n\n" if roster else ""
    need_section   = f"POSITIONAL NEED: {need}\n\n" if need else ""

    prompt = f"""You are an expert fantasy football analyst helping with waiver wire pickups in a {scoring} league.

{roster_section}{need_section}AVAILABLE PLAYERS ON WAIVERS:
{fmt(available)}

Recommend the best 1-2 pickups from the available players. For each, give a one-sentence reason. If a roster was provided, factor in roster construction. Be concise and direct."""

    try:
        client  = _anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return jsonify({"analysis": message.content[0].text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/news")
def api_news():
    """Returns injured/questionable players + Sleeper trending adds."""
    try:
        players, week, season = _build_player_list("ppr")
        injured = [
            p for p in players
            if p.get("injury_status") and p["injury_status"].lower() not in ("active", "none", "")
        ]

        trending = []
        try:
            from sleeper_api import get_trending
            trending = get_trending()
        except Exception:
            pass

        return jsonify({"injured": injured, "trending": trending, "week": week, "season": season})
    except Exception as e:
        return jsonify({"error": str(e), "injured": [], "trending": []}), 500


@app.route("/api/player_history")
def api_player_history():
    """
    Returns game-by-game log for a player.
    Query params:
      player_id = Sleeper player ID  (required)
      position  = QB | RB | WR | TE | K  (required)
      seasons   = comma-separated seasons, e.g. "2025" or "2025,2024"
    """
    player_id   = request.args.get("player_id", "").strip()
    position    = request.args.get("position",  "QB").upper()
    seasons_str = request.args.get("seasons",   "2025")
    seasons     = [s.strip() for s in seasons_str.split(",") if s.strip()]

    if not player_id:
        return jsonify({"error": "player_id is required", "games": []}), 400

    try:
        from player_history import fetch_game_log
        games = fetch_game_log(player_id, position, seasons)
        return jsonify({"games": games})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "games": []}), 500


# In-memory cache for bye weeks (lasts the lifetime of the server process)
_bye_weeks_cache = {}

@app.route("/api/bye_weeks")
def api_bye_weeks():
    """
    Returns bye weeks for all NFL teams by scanning ESPN scoreboard for each week.
    Teams absent from a week's scoreboard are on bye that week.
    Response: { season: "2026", byes: { "BAL": 6, "BUF": 12, ... } }
    """
    global _bye_weeks_cache

    try:
        from sleeper_api import get_nfl_state
        import requests
        from concurrent.futures import ThreadPoolExecutor, as_completed

        state  = get_nfl_state()
        season = state.get("season", "2025")

        # Return cached result if already computed for this season
        if _bye_weeks_cache.get("season") == season and len(_bye_weeks_cache.get("byes", {})) >= 28:
            return jsonify(_bye_weeks_cache)

        ALL_NFL_TEAMS = {
            "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE",
            "DAL","DEN","DET","GB","HOU","IND","JAX","KC",
            "LAC","LAR","LV","MIA","MIN","NE","NO","NYG",
            "NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS",
        }
        ESPN_NORM = {"WSH": "WAS"}

        def _teams_playing(week):
            """Return set of team abbrs playing in this week (ESPN scoreboard)."""
            try:
                r = requests.get(
                    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
                    params={"seasontype": 2, "week": week, "dates": season},
                    timeout=10,
                )
                if r.status_code != 200:
                    return week, set()
                playing = set()
                for event in r.json().get("events", []):
                    for comp in event.get("competitions", [{}])[0].get("competitors", []):
                        abbr = comp.get("team", {}).get("abbreviation", "").upper()
                        abbr = ESPN_NORM.get(abbr, abbr)
                        playing.add(abbr)
                return week, playing
            except Exception:
                return week, set()

        # Fetch all 18 weeks in parallel
        playing_by_week = {}
        with ThreadPoolExecutor(max_workers=9) as ex:
            futs = {ex.submit(_teams_playing, w): w for w in range(1, 19)}
            for fut in as_completed(futs):
                week, teams = fut.result()
                playing_by_week[week] = teams

        # A team is on bye the week it doesn't appear in the scoreboard
        # (only count weeks where at least 12 games were played = full slate)
        byes = {}
        for week in range(1, 19):
            playing = playing_by_week.get(week, set())
            if len(playing) < 24:   # incomplete week data — skip
                continue
            for team in ALL_NFL_TEAMS:
                if team not in playing and team not in byes:
                    byes[team] = week

        if len(byes) >= 28:
            _bye_weeks_cache = {"season": season, "byes": byes}
            return jsonify(_bye_weeks_cache)

        # ESPN didn't return enough data — return empty so JS uses hardcoded fallback
        return jsonify({"season": season, "byes": {}})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"season": "2025", "byes": {}, "error": str(e)})


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    host = "0.0.0.0"
    print(f"\nNFL Projection Engine starting on {host}:{port}...")
    if port == 5000:
        print("Open your browser to: http://127.0.0.1:5000\n")
    app.run(debug=False, host=host, port=port)
