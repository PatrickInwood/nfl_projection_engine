def calculate_ppr_points(
    passing_yards,
    passing_tds,
    interceptions,
    rushing_yards,
    rushing_tds,
    receptions,
    receiving_yards,
    receiving_tds

):
    
    points = 0

    points += passing_yards * 0.04
    points += passing_tds * 4
    points -= interceptions * 2

    points += rushing_yards * 0.1
    points += rushing_tds * 6

    points += receptions * 1
    points += receiving_yards * 0.1
    points += receiving_tds * 6

    return round(points, 2)