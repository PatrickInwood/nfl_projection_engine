import csv
import os
from data_loader import load_players
from defenses import defenses
from projections import get_adjusted_projection

# ── Load players ───────────────────────────────────────────────────────────
print()
print("NFL PROJECTION ENGINE — Loading data...")
players = load_players()

# ── Build rankings by position ─────────────────────────────────────────────
rankings       = []
qb_rankings    = []
rb_rankings    = []
wr_rankings    = []
te_rankings    = []
flex_rankings  = []
k_rankings     = []

for player_name, data in players.items():

    position         = data["position"]
    projected_points = data["ppg"]
    opponent         = data.get("opponent", "TBD")
    injury_status    = data.get("injury_status", "Active")

    adjusted_projection = get_adjusted_projection(position, projected_points, opponent)

    entry = {
        "name":          player_name,
        "position":      position,
        "team":          data.get("team", ""),
        "projection":    adjusted_projection,
        "injury_status": injury_status
    }

    rankings.append(entry)

    if position == "QB":
        qb_rankings.append(entry)

    elif position == "RB":
        rb_rankings.append(entry)
        flex_rankings.append(entry)

    elif position == "WR":
        wr_rankings.append(entry)
        flex_rankings.append(entry)

    elif position == "TE":
        te_rankings.append(entry)
        flex_rankings.append(entry)

    elif position == "K":
        k_rankings.append(entry)

# ── Sort all lists ─────────────────────────────────────────────────────────
for lst in [rankings, qb_rankings, rb_rankings, wr_rankings,
            te_rankings, flex_rankings, k_rankings]:
    lst.sort(key=lambda p: p["projection"], reverse=True)


# ── Helpers ────────────────────────────────────────────────────────────────
def injury_tag(status):
    """Returns a short tag for non-active players shown next to their name."""
    if not status or status.lower() in ("active", "none", ""):
        return ""
    return f" [{status}]"


def export_to_csv(all_rankings):
    """Exports the current week's projections to a readable CSV file."""
    project_dir = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(project_dir, "weekly_projections.csv")

    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Rank", "Name", "Position", "Team", "Projected PPR Points", "Injury Status"])
        for rank, player in enumerate(all_rankings, start=1):
            writer.writerow([
                rank,
                player["name"],
                player["position"],
                player["team"],
                player["projection"],
                player["injury_status"]
            ])

    print(f"\n  Exported {len(all_rankings)} players to: weekly_projections.csv")
    print("  Open it in Excel or VS Code to browse the full list.")


def print_position_rankings(title, position_list, limit=None):
    print()
    print(title)
    print("-" * len(title))

    shown = position_list[:limit] if limit else position_list

    for rank, player in enumerate(shown, start=1):
        tag  = injury_tag(player["injury_status"])
        line = (
            f"{rank}. {player['name']}{tag}"
            f"  ({player['team']})"
            f"  —  {player['projection']} pts"
        )
        print(line)


# ── Main menu loop ─────────────────────────────────────────────────────────
running = True

while running:

    print()
    print("═══════════════════════════════")
    print("    NFL PROJECTION ENGINE")
    print("═══════════════════════════════")
    print(" 1.  Overall Rankings")
    print(" 2.  QB Rankings")
    print(" 3.  RB Rankings")
    print(" 4.  WR Rankings")
    print(" 5.  TE Rankings")
    print(" 6.  K Rankings")
    print(" 7.  FLEX Rankings")
    print(" 8.  Top 3 FLEX Recommendations")
    print(" 9.  Start/Sit Comparison")
    print(" 10. Export Rankings to CSV")
    print(" 11. Exit")
    print()

    choice = input("Enter your choice: ").strip()

    if choice == "1":
        print_position_rankings("OVERALL RANKINGS", rankings)

    elif choice == "2":
        print_position_rankings("QB RANKINGS", qb_rankings)

    elif choice == "3":
        print_position_rankings("RB RANKINGS", rb_rankings)

    elif choice == "4":
        print_position_rankings("WR RANKINGS", wr_rankings)

    elif choice == "5":
        print_position_rankings("TE RANKINGS", te_rankings)

    elif choice == "6":
        print_position_rankings("K RANKINGS", k_rankings)

    elif choice == "7":
        print_position_rankings("FLEX RANKINGS", flex_rankings)

    elif choice == "8":
        print()
        print("TOP 3 FLEX RECOMMENDATIONS")
        print("--------------------------")
        for i, player in enumerate(flex_rankings[:3], start=1):
            tag = injury_tag(player["injury_status"])
            print(f"{i}. {player['name']}{tag}  ({player['team']})  —  {player['projection']} pts")

    elif choice == "9":
        player_1_input = input("Enter first player name:  ").strip().lower()
        player_2_input = input("Enter second player name: ").strip().lower()

        p1 = next((p for p in rankings if p["name"].lower() == player_1_input), None)
        p2 = next((p for p in rankings if p["name"].lower() == player_2_input), None)

        if p1 is None:
            print(f"  '{player_1_input}' not found in this week's projections.")
        elif p2 is None:
            print(f"  '{player_2_input}' not found in this week's projections.")
        elif p1["projection"] == p2["projection"]:
            print()
            print("  Projected tie — coin flip.")
        else:
            starter, sitter = (p1, p2) if p1["projection"] > p2["projection"] else (p2, p1)
            advantage = round(abs(p1["projection"] - p2["projection"]), 2)
            print()
            print(f"  START:  {starter['name']}  —  {starter['projection']} pts")
            print(f"  SIT:    {sitter['name']}  —  {sitter['projection']} pts")
            print(f"  Edge:   +{advantage} pts")

    elif choice == "10":
        export_to_csv(rankings)

    elif choice == "11":
        print("Exiting NFL Projection Engine. Good luck this week.")
        running = False

    else:
        print("  Invalid choice. Enter a number from 1 to 11.")
