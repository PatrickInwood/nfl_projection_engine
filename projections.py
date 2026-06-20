from defenses import defenses


def get_adjusted_projection(position, projected_points, opponent,
                             weather_modifiers=None, def_modifier=0.0):
    """
    Adjusts a player's projected points using:
      1. Static defensive modifier from defenses.py (fallback / legacy)
      2. Dynamic defensive modifier from def_rankings.py (if provided)
      3. Weather modifier from weather.py (if provided)

    Args:
        position (str):           QB, RB, WR, TE, K, DEF
        projected_points (float): Raw projected points from Sleeper
        opponent (str):           Opponent team abbreviation or "TBD"
        weather_modifiers (dict): {pos: modifier} from weather.get_weather_modifiers()
        def_modifier (float):     Additive modifier from def_rankings.get_def_modifier()
    """
    # 1. Static defensive modifier (all zeros by default; kept for manual override)
    static_mod = 0.0
    if position in ("QB", "RB", "WR"):
        key = f"{position.lower()}_modifier"
        static_mod = defenses.get(opponent, defenses["TBD"]).get(key, 0)

    # 2. Dynamic defensive modifier (from Sleeper season stats)
    dynamic_mod = def_modifier if def_modifier else 0.0

    # 3. Weather modifier
    weather_mod = 0.0
    if weather_modifiers and position in weather_modifiers:
        weather_mod = weather_modifiers[position]

    adjusted = projected_points + static_mod + dynamic_mod + weather_mod
    return max(0.0, round(adjusted, 2))
