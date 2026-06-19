from defenses import defenses

def get_adjusted_projection(position, projected_points, opponent):

    if position == "RB":
        modifier = defenses[opponent]["rb_modifier"]

    elif position == "WR":
        modifier = defenses[opponent]["wr_modifier"]

    elif position == "QB":
        modifier = defenses[opponent]["qb_modifier"]

    else:
        modifier = 0

    adjusted_projection = projected_points + modifier

    return adjusted_projection