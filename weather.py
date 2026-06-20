"""
Weather integration using Open-Meteo (free, no API key required).
Fetches forecast for outdoor NFL stadiums and calculates projection modifiers.
"""

import requests
from datetime import datetime, timedelta

# Simple in-memory cache: { "LAT,LON,DATE": weather_dict }
_weather_cache = {}


def _get_upcoming_game_day():
    """Returns the next Sunday's date (most NFL games are Sunday)."""
    today = datetime.now().date()
    days_until_sunday = (6 - today.weekday()) % 7
    if days_until_sunday == 0:
        days_until_sunday = 7  # next Sunday if today is Sunday
    return today + timedelta(days=days_until_sunday)


def fetch_weather(lat, lon, game_date=None):
    """
    Fetch weather forecast for a stadium location on game day.

    Returns a dict:
    {
        "temp_f":      float,   # high temp in Fahrenheit
        "wind_mph":    float,   # max wind speed in mph
        "precip_pct":  int,     # precipitation probability (0-100)
        "condition":   str,     # human-readable label
        "icon":        str,     # emoji icon
        "indoor":      False,
    }
    Returns None on error.
    """
    if game_date is None:
        game_date = _get_upcoming_game_day()

    cache_key = f"{lat},{lon},{game_date}"
    if cache_key in _weather_cache:
        return _weather_cache[cache_key]

    try:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude":   lat,
            "longitude":  lon,
            "daily":      "temperature_2m_max,wind_speed_10m_max,precipitation_probability_max,weather_code",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit":  "mph",
            "timezone":   "auto",
            "forecast_days": 14,
        }
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        daily = data.get("daily", {})
        dates = daily.get("time", [])

        # Find the target date in the forecast
        target = str(game_date)
        if target not in dates:
            # Fall back to last available date if game day not in window
            idx = -1
        else:
            idx = dates.index(target)

        temp_f     = daily["temperature_2m_max"][idx] or 60.0
        wind_mph   = daily["wind_speed_10m_max"][idx] or 0.0
        precip_pct = daily["precipitation_probability_max"][idx] or 0
        wcode      = daily["weather_code"][idx] or 0

        condition, icon = _interpret_weather(temp_f, wind_mph, precip_pct, wcode)

        result = {
            "temp_f":     round(temp_f),
            "wind_mph":   round(wind_mph, 1),
            "precip_pct": int(precip_pct),
            "condition":  condition,
            "icon":       icon,
            "indoor":     False,
        }
        _weather_cache[cache_key] = result
        return result

    except Exception:
        return None


def _interpret_weather(temp_f, wind_mph, precip_pct, wcode):
    """Returns (condition_label, emoji_icon) from weather parameters."""
    # Snow (WMO codes 71-77, 85-86)
    if wcode in (71, 73, 75, 77, 85, 86):
        return "Snow", "❄️"
    # Rain/drizzle (WMO codes 51-67, 80-82, 95-99)
    if wcode in range(51, 68) or wcode in (80, 81, 82, 95, 96, 99):
        if precip_pct >= 70:
            return "Heavy Rain", "🌧️"
        return "Rain", "🌦️"
    # High wind
    if wind_mph >= 20:
        return f"Windy", "💨"
    # Cold
    if temp_f <= 32:
        return "Freezing", "🥶"
    return "Clear", "☀️"


def get_weather_modifiers(weather):
    """
    Returns projection multipliers by position based on weather conditions.
    All values are additive modifiers (e.g. -1.5 means subtract 1.5 pts).

    Passing game affected: QB, WR, TE, K
    Ground game slightly helped by bad weather: RB
    """
    if weather is None or weather.get("indoor"):
        return {"QB": 0, "RB": 0, "WR": 0, "TE": 0, "K": 0}

    wind  = weather.get("wind_mph", 0)
    precip = weather.get("precip_pct", 0)
    temp  = weather.get("temp_f", 60)
    wcode = 0  # we use wind/precip directly

    pass_mod = 0.0
    rb_mod   = 0.0

    # Wind modifiers
    if wind >= 25:
        pass_mod -= 3.0
        rb_mod   += 0.5
    elif wind >= 20:
        pass_mod -= 2.0
        rb_mod   += 0.3
    elif wind >= 15:
        pass_mod -= 1.0

    # Precipitation modifiers
    if precip >= 70:
        pass_mod -= 1.5
        rb_mod   += 0.3
    elif precip >= 50:
        pass_mod -= 0.75

    # Cold temperature modifiers
    if temp <= 20:
        pass_mod -= 1.5
        rb_mod   -= 0.5
    elif temp <= 32:
        pass_mod -= 0.75

    # Snow: extra penalty to passing, small RB bump
    if weather.get("condition") == "Snow":
        pass_mod -= 1.0
        rb_mod   += 0.5

    return {
        "QB": round(pass_mod, 2),
        "WR": round(pass_mod, 2),
        "TE": round(pass_mod * 0.8, 2),   # TEs slightly less affected
        "K":  round(pass_mod * 1.2, 2),   # Kickers most affected by wind
        "RB": round(rb_mod, 2),
    }


DOME_WEATHER = {
    "temp_f":    72,
    "wind_mph":  0,
    "precip_pct": 0,
    "condition": "Dome",
    "icon":      "🏟️",
    "indoor":    True,
}
