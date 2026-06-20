"""
NFL Stadium database — coordinates and indoor/dome status.
indoor=True  → weather skipped entirely (dome or fully retractable/closed)
indoor=False → weather fetched from Open-Meteo for this location
"""

STADIUMS = {
    "ARI": {"name": "State Farm Stadium",       "lat": 33.5276,  "lon": -112.2626, "indoor": True},   # retractable, almost always closed
    "ATL": {"name": "Mercedes-Benz Stadium",    "lat": 33.7554,  "lon": -84.4006,  "indoor": True},
    "BAL": {"name": "M&T Bank Stadium",         "lat": 39.2780,  "lon": -76.6227,  "indoor": False},
    "BUF": {"name": "Highmark Stadium",         "lat": 42.7738,  "lon": -78.7868,  "indoor": False},
    "CAR": {"name": "Bank of America Stadium",  "lat": 35.2258,  "lon": -80.8531,  "indoor": False},
    "CHI": {"name": "Soldier Field",            "lat": 41.8623,  "lon": -87.6167,  "indoor": False},
    "CIN": {"name": "Paycor Stadium",           "lat": 39.0954,  "lon": -84.5160,  "indoor": False},
    "CLE": {"name": "Huntington Bank Field",    "lat": 41.5061,  "lon": -81.6995,  "indoor": False},
    "DAL": {"name": "AT&T Stadium",             "lat": 32.7480,  "lon": -97.0930,  "indoor": True},   # retractable, usually closed
    "DEN": {"name": "Empower Field",            "lat": 39.7439,  "lon": -105.0201, "indoor": False},
    "DET": {"name": "Ford Field",               "lat": 42.3400,  "lon": -83.0456,  "indoor": True},
    "GB":  {"name": "Lambeau Field",            "lat": 44.5013,  "lon": -88.0622,  "indoor": False},
    "HOU": {"name": "NRG Stadium",              "lat": 29.6847,  "lon": -95.4107,  "indoor": True},   # retractable, usually closed
    "IND": {"name": "Lucas Oil Stadium",        "lat": 39.7601,  "lon": -86.1639,  "indoor": True},
    "JAX": {"name": "EverBank Stadium",         "lat": 30.3240,  "lon": -81.6373,  "indoor": False},
    "KC":  {"name": "Arrowhead Stadium",        "lat": 39.0489,  "lon": -94.4839,  "indoor": False},
    "LAC": {"name": "SoFi Stadium",             "lat": 33.9535,  "lon": -118.3392, "indoor": False},  # roof but open-air sides
    "LAR": {"name": "SoFi Stadium",             "lat": 33.9535,  "lon": -118.3392, "indoor": False},
    "LV":  {"name": "Allegiant Stadium",        "lat": 36.0909,  "lon": -115.1833, "indoor": True},
    "MIA": {"name": "Hard Rock Stadium",        "lat": 25.9580,  "lon": -80.2389,  "indoor": False},
    "MIN": {"name": "U.S. Bank Stadium",        "lat": 44.9736,  "lon": -93.2575,  "indoor": True},
    "NE":  {"name": "Gillette Stadium",         "lat": 42.0909,  "lon": -71.2643,  "indoor": False},
    "NO":  {"name": "Caesars Superdome",        "lat": 29.9511,  "lon": -90.0812,  "indoor": True},
    "NYG": {"name": "MetLife Stadium",          "lat": 40.8135,  "lon": -74.0745,  "indoor": False},
    "NYJ": {"name": "MetLife Stadium",          "lat": 40.8135,  "lon": -74.0745,  "indoor": False},
    "PHI": {"name": "Lincoln Financial Field",  "lat": 39.9008,  "lon": -75.1675,  "indoor": False},
    "PIT": {"name": "Acrisure Stadium",         "lat": 40.4468,  "lon": -80.0158,  "indoor": False},
    "SEA": {"name": "Lumen Field",              "lat": 47.5952,  "lon": -122.3316, "indoor": False},
    "SF":  {"name": "Levi's Stadium",           "lat": 37.4033,  "lon": -121.9694, "indoor": False},
    "TB":  {"name": "Raymond James Stadium",    "lat": 27.9759,  "lon": -82.5033,  "indoor": False},
    "TEN": {"name": "Nissan Stadium",           "lat": 36.1665,  "lon": -86.7713,  "indoor": False},
    "WAS": {"name": "Northwest Stadium",        "lat": 38.9076,  "lon": -76.8645,  "indoor": False},
}


def get_stadium(team):
    return STADIUMS.get(team)
