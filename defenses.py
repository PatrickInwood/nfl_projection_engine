# Defense modifiers represent how much a team allows above/below average
# to each position in PPR fantasy points.
#
# Positive = easier matchup (defense allows more points to that position)
# Negative = tougher matchup (defense allows fewer points)
#
# Note: Since we now use Sleeper projections (which already factor in opponent),
# these modifiers are set to 0 by default to avoid double-counting.
# You can customize them as you track tendencies across the season.

defenses = {

    "ARI": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "ATL": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "BAL": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "BUF": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "CAR": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "CHI": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "CIN": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "CLE": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "DAL": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "DEN": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "DET": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "GB":  {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "HOU": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "IND": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "JAX": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "KC":  {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "LAC": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "LAR": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "LV":  {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "MIA": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "MIN": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "NE":  {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "NO":  {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "NYG": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "NYJ": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "PHI": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "PIT": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "SEA": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "SF":  {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "TB":  {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "TEN": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},
    "WAS": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},

    # Fallback for players on bye or with unknown opponent
    "TBD": {"rb_modifier": 0, "wr_modifier": 0, "qb_modifier": 0},

}
