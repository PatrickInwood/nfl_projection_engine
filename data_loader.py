import csv
import os


def load_players():
    """
    Loads live player projections from the Sleeper API, then merges in any
    positions missing from the API result (e.g. kickers with 0 projections
    in off-season / late-season meaningless games) from players.csv.

    Falls back entirely to players.csv if Sleeper is unavailable.
    """
    csv_players = _load_from_csv()

    try:
        from sleeper_api import fetch_week_players
        players, week, season = fetch_week_players()
        print(f"  Loaded {len(players)} players from Sleeper  |  Week {week}  |  {season} season")

        # Merge in any CSV players whose position is absent from the Sleeper result.
        # This guarantees kickers (and any other sparse position) always appear.
        positions_found = {p["position"] for p in players.values()}
        merged = 0
        for name, data in csv_players.items():
            if data["position"] not in positions_found and name not in players:
                players[name] = data
                merged += 1

        if merged:
            print(f"  Merged {merged} fallback player(s) from CSV (positions: "
                  f"{set(d['position'] for d in csv_players.values()) - positions_found})")

        return players

    except Exception as e:
        print(f"  Sleeper API unavailable ({e}) — using players.csv")
        return csv_players


def _load_from_csv():
    """Loads player data from the local players.csv file."""
    players = {}
    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "players.csv")

    if not os.path.exists(csv_path):
        return players

    with open(csv_path, "r") as file:
        reader = csv.DictReader(file)
        for row in reader:
            players[row["name"]] = {
                "name":          row["name"],
                "position":      row["position"],
                "team":          row["team"],
                "opponent":      row.get("opponent", "TBD"),
                "ppg":           float(row["ppg"]),
                "injury_status": row.get("injury_status", "Active"),
                "home_team":     row.get("home_team"),
                "player_id":     row.get("player_id"),
            }

    print(f"  Loaded {len(players)} players from players.csv")
    return players
