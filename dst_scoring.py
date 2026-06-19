# D/ST Fantasy Scoring Calculator
# Default settings match Triple Flex league configuration.
# Custom settings can be passed in as a dict with the same keys.

TRIPLE_FLEX_DST_SETTINGS = {
    # Points allowed tiers
    "pa0":  5,    # Shutout
    "pa1":  4,    # 1–6 pts allowed
    "pa7":  3,    # 7–13 pts allowed
    "pa14": 1,    # 14–17 pts allowed
    "pa18": 0,    # 18–21 pts allowed
    "pa22": 0,    # 22–27 pts allowed
    "pa28": -1,   # 28–34 pts allowed
    "pa35": -3,   # 35–45 pts allowed
    "pa46": -5,   # 46+ pts allowed
    # Yards allowed tiers
    "ya100": 5,   # < 100 yards
    "ya199": 3,   # 100–199 yards
    "ya299": 2,   # 200–299 yards
    "ya349": 0,   # 300–349 yards
    "ya399": -1,  # 350–399 yards
    "ya449": -3,  # 400–449 yards
    "ya499": -5,  # 450–499 yards
    "ya549": -6,  # 500–549 yards
    "ya550": -7,  # 550+ yards
    # Counting stats
    "sk":   1,    # Each sack
    "int":  2,    # Each interception
    "fr":   2,    # Each fumble recovered
    "sf":   2,    # Each safety
    "blkk": 2,    # Blocked punt/PAT/FG
    "td":   6,    # Any defensive/ST touchdown
    "2ptret": 2,  # 2-point return
}


def calculate_dst_points(stats, settings=None):
    """
    Calculate D/ST fantasy points from projected stats.

    Args:
        stats (dict): Projected stats from Sleeper (pts_allow, yds_allow, sack, etc.)
        settings (dict): Scoring settings. Defaults to TRIPLE_FLEX_DST_SETTINGS.

    Returns:
        float: Projected fantasy points for this D/ST.
    """
    if settings is None:
        settings = TRIPLE_FLEX_DST_SETTINGS

    points = 0.0

    # ── Points allowed tier ───────────────────────────────────────────────
    pts_allow = float(stats.get("pts_allow") or 21)

    if pts_allow == 0:
        points += settings.get("pa0", 5)
    elif pts_allow <= 6:
        points += settings.get("pa1", 4)
    elif pts_allow <= 13:
        points += settings.get("pa7", 3)
    elif pts_allow <= 17:
        points += settings.get("pa14", 1)
    elif pts_allow <= 21:
        points += settings.get("pa18", 0)
    elif pts_allow <= 27:
        points += settings.get("pa22", 0)
    elif pts_allow <= 34:
        points += settings.get("pa28", -1)
    elif pts_allow <= 45:
        points += settings.get("pa35", -3)
    else:
        points += settings.get("pa46", -5)

    # ── Yards allowed tier ────────────────────────────────────────────────
    yds_allow = float(stats.get("yds_allow") or 300)

    if yds_allow < 100:
        points += settings.get("ya100", 5)
    elif yds_allow < 200:
        points += settings.get("ya199", 3)
    elif yds_allow < 300:
        points += settings.get("ya299", 2)
    elif yds_allow < 350:
        points += settings.get("ya349", 0)
    elif yds_allow < 400:
        points += settings.get("ya399", -1)
    elif yds_allow < 450:
        points += settings.get("ya449", -3)
    elif yds_allow < 500:
        points += settings.get("ya499", -5)
    elif yds_allow < 550:
        points += settings.get("ya549", -6)
    else:
        points += settings.get("ya550", -7)

    # ── Counting stats ────────────────────────────────────────────────────
    points += float(stats.get("sack")     or 0) * settings.get("sk",   1)
    points += float(stats.get("int")      or 0) * settings.get("int",  2)
    points += float(stats.get("fum_rec")  or 0) * settings.get("fr",   2)
    points += float(stats.get("safe")     or 0) * settings.get("sf",   2)
    points += float(stats.get("blk_kick") or 0) * settings.get("blkk", 2)
    points += float(stats.get("td")       or 0) * settings.get("td",   6)

    return round(points, 2)
