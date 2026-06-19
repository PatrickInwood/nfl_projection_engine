import csv
import os


def load_players():
    """
    Tries to load live player projections from the Sleeper API.
    Falls back to players.csv if the API is unavailable (no internet, etc.).

    Returns a players dict in the format:
        {player_name: {position, team, opponent, ppg, injury_status}}
    """
    try:
        from sleeper_api import fetch_week_players
        players, week, season = fetch_week_players()
        print(f"  Loaded {len(players)} players  |  Week {week}  |  {season} season")
        return players

    except Exception as e:
        print(f"  Sleeper API unavailable ({e})")
        print("  Falling back to players.csv...")
        return _load_from_csv()


def _load_from_csv():
    """Loads player data from the local players.csv file."""
    players = {}
    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "players.csv")

    with open(csv_path, "r") as file:
        reader = csv.DictReader(file)
        for row in reader:
            players[row["name"]] = {
                "name": row["name"],
                "position": row["position"],
                "team": row["team"],
                "opponent": row["opponent"],
                "ppg": float(row["ppg"]),
                "injury_status": row.get("injury_status", "Active")
            }

    print(f"  Loaded {len(players)} players from players.csv")
    return players
