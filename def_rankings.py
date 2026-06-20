"""
Dynamic defensive rankings calculated from Sleeper's historical stats API.

For each team, calculates average PPR fantasy points allowed per game
to each position (QB, RB, WR, TE) over the last N weeks.

Rankings are converted to additive projection modifiers:
  - Top 4 defense at a position:   -2.0 pts modifier
  - Top 8:                         -1.0
  - Middle 8 (9–24):                0.0
  - Bottom 8:                      +1.0
  - Bottom 4:                      +2.0

Cached for the duration of the server run (updates on restart).
"""

import requests
from collections import defaultdict

SLEEPER_BASE = "https://api.sleeper.app/v1"

_rankings_cache = None  # { "ARI": {"QB": -1.0, "RB": 0.5, "WR": 1.0, "TE": 0.0}, ... }

RELEVANT_POSITIONS = {"QB", "RB", "WR", "TE"}

# Modifier tiers by rank (1=toughest, 32=easiest)
def _rank_to_modifier(rank, total=32):
    if rank <= 4:
        return -2.0
    elif rank <= 8:
        return -1.0
    elif rank <= 24:
        return 0.0
    elif rank <= 28:
        return 1.0
    else:
        return 2.0


def calculate_def_rankings(season, current_week, season_type="regular", num_weeks=6):
    """
    Fetches the last num_weeks of Sleeper stats and calculates
    defensive rankings by position.

    Returns: { team: { "QB": float, "RB": float, "WR": float, "TE": float } }
    """
    global _rankings_cache
    if _rankings_cache is not None:
        return _rankings_cache

    # Points allowed: { defending_team: { position: [pts, pts, ...] } }
    pts_allowed = defaultdict(lambda: defaultdict(list))

    try:
        from sleeper_api import get_all_players, get_matchup_map

        all_players = get_all_players()

        # Build player_id → {position, team}
        player_info = {
            pid: {"position": info.get("position"), "team": info.get("team")}
            for pid, info in all_players.items()
            if info.get("position") in RELEVANT_POSITIONS and info.get("team")
        }

        # Fetch past weeks
        weeks_fetched = 0
        for week in range(max(1, current_week - num_weeks), current_week):
            try:
                # Get schedule to know home/away for each game this week
                matchup_raw = _fetch_schedule_raw(season, week, season_type)
                # Build team → opponent map for this week
                opp_map = {}  # team → opponent_team_abbr
                for game in matchup_raw:
                    home = game.get("home")
                    away = game.get("away")
                    if home and away:
                        opp_map[home] = away
                        opp_map[away] = home

                # Get player stats for this week
                stats_url = f"{SLEEPER_BASE}/stats/nfl/{season_type}/{season}/{week}"
                resp = requests.get(stats_url, timeout=15)
                if resp.status_code != 200:
                    continue
                week_stats = resp.json()

                for pid, stats in week_stats.items():
                    if pid not in player_info:
                        continue
                    info     = player_info[pid]
                    position = info["position"]
                    team     = info["team"]
                    opponent = opp_map.get(team)
                    if not opponent:
                        continue

                    pts = stats.get("pts_ppr")
                    if pts is not None and float(pts) >= 1.0:
                        pts_allowed[opponent][position].append(float(pts))

                weeks_fetched += 1
            except Exception:
                continue

        if weeks_fetched == 0:
            _rankings_cache = {}
            return {}

        # Calculate average points allowed per game per position
        avg_allowed = {}
        for team in pts_allowed:
            avg_allowed[team] = {}
            for pos in RELEVANT_POSITIONS:
                games = pts_allowed[team].get(pos, [])
                avg_allowed[team][pos] = sum(games) / len(games) if games else 0.0

        # Fill in any teams with no data (bye weeks, etc.)
        all_teams = set(player_info[p]["team"] for p in player_info)
        for team in all_teams:
            if team not in avg_allowed:
                avg_allowed[team] = {pos: 0.0 for pos in RELEVANT_POSITIONS}

        # Rank teams for each position and convert to modifiers
        result = {team: {} for team in avg_allowed}
        for pos in RELEVANT_POSITIONS:
            # Sort: highest pts allowed = easiest defense = highest rank number
            sorted_teams = sorted(avg_allowed.keys(), key=lambda t: avg_allowed[t].get(pos, 0))
            for rank, team in enumerate(sorted_teams, start=1):
                result[team][pos] = _rank_to_modifier(rank)

        _rankings_cache = result
        return result

    except Exception:
        _rankings_cache = {}
        return {}


def _fetch_schedule_raw(season, week, season_type="regular"):
    """Returns raw list of game dicts from Sleeper schedule endpoint."""
    try:
        url  = f"{SLEEPER_BASE}/schedule/nfl/{season_type}/{season}/{week}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200 and resp.text.strip():
            return resp.json() or []
    except Exception:
        pass
    return []


def get_def_modifier(team, position, season, current_week, season_type="regular"):
    """
    Returns the defensive modifier for a player's opponent.
    Positive = easier matchup, Negative = tougher matchup.
    """
    rankings = calculate_def_rankings(season, current_week, season_type)
    if not rankings or team not in rankings:
        return 0.0
    return rankings[team].get(position, 0.0)


def clear_cache():
    """Call this at the start of a new week to force recalculation."""
    global _rankings_cache
    _rankings_cache = None
