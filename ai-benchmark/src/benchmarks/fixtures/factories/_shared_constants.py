"""
Shared constants and helper functions for consistent date generation across all factories.

All factories should use these helpers to ensure test data has predictable date ranges.

Date Range: January 1, 2022 - December 31, 2024 (3 years of data)
"""

import random
from datetime import date, datetime, timedelta

# ============================================================================
# CORE DATE RANGE CONSTANTS
# ============================================================================

DATA_START_DATE = date(2022, 1, 1)
DATA_END_DATE = date(2024, 12, 31)

# Total days in the data range
DATA_RANGE_DAYS = (DATA_END_DATE - DATA_START_DATE).days


# ============================================================================
# DATE HELPER FUNCTIONS
# ============================================================================


def get_random_date_within_range(start_date=None, end_date=None):
    """
    Get a random date within the specified range (or full data range if not specified).

    Args:
        start_date: Optional start date (defaults to DATA_START_DATE)
        end_date: Optional end date (defaults to DATA_END_DATE)

    Returns:
        date: Random date within the range
    """
    start = start_date or DATA_START_DATE
    end = end_date or DATA_END_DATE
    delta_days = (end - start).days

    if delta_days <= 0:
        return start

    return start + timedelta(days=random.randint(0, delta_days))


def get_random_datetime_within_range(start_date=None, end_date=None):
    """
    Get a random datetime within the specified range (or full data range if not specified).

    Args:
        start_date: Optional start date (defaults to DATA_START_DATE)
        end_date: Optional end date (defaults to DATA_END_DATE)

    Returns:
        datetime: Random datetime within the range
    """
    dt = get_random_date_within_range(start_date, end_date)
    return datetime.combine(dt, datetime.min.time()) + timedelta(
        hours=random.randint(0, 23), minutes=random.randint(0, 59), seconds=random.randint(0, 59)
    )


def get_past_date(days_ago_min=30, days_ago_max=365, reference_date=None):
    """
    Get a date in the past, staying within the data range.

    Args:
        days_ago_min: Minimum days in the past
        days_ago_max: Maximum days in the past
        reference_date: Reference date (defaults to DATA_END_DATE)

    Returns:
        date: Random past date within constraints
    """
    ref = reference_date or DATA_END_DATE
    earliest = max(DATA_START_DATE, ref - timedelta(days=days_ago_max))
    latest = max(DATA_START_DATE, ref - timedelta(days=days_ago_min))

    if latest < earliest:
        latest = earliest

    return get_random_date_within_range(earliest, latest)


def get_past_datetime(days_ago_min=30, days_ago_max=365, reference_date=None):
    """
    Get a datetime in the past, staying within the data range.

    Args:
        days_ago_min: Minimum days in the past
        days_ago_max: Maximum days in the past
        reference_date: Reference date (defaults to DATA_END_DATE)

    Returns:
        datetime: Random past datetime within constraints
    """
    dt = get_past_date(days_ago_min, days_ago_max, reference_date)
    return datetime.combine(dt, datetime.min.time()) + timedelta(
        hours=random.randint(0, 23), minutes=random.randint(0, 59), seconds=random.randint(0, 59)
    )


def get_recent_date(days_ago_max=90):
    """
    Get a recent date (within last N days of data range).

    Args:
        days_ago_max: Maximum days in the past from DATA_END_DATE

    Returns:
        date: Random recent date
    """
    return get_past_date(days_ago_min=0, days_ago_max=days_ago_max, reference_date=DATA_END_DATE)


def get_recent_datetime(days_ago_max=90):
    """
    Get a recent datetime (within last N days of data range).

    Args:
        days_ago_max: Maximum days in the past from DATA_END_DATE

    Returns:
        datetime: Random recent datetime
    """
    return get_past_datetime(days_ago_min=0, days_ago_max=days_ago_max, reference_date=DATA_END_DATE)


def get_future_date(days_ahead_min=1, days_ahead_max=90, reference_date=None):
    """
    Get a future date, staying within the data range.

    Args:
        days_ahead_min: Minimum days in the future
        days_ahead_max: Maximum days in the future
        reference_date: Reference date (defaults to DATA_START_DATE)

    Returns:
        date: Random future date within constraints
    """
    ref = reference_date or DATA_START_DATE
    earliest = min(DATA_END_DATE, ref + timedelta(days=days_ahead_min))
    latest = min(DATA_END_DATE, ref + timedelta(days=days_ahead_max))

    if earliest > latest:
        earliest = latest

    return get_random_date_within_range(earliest, latest)


def get_future_datetime(days_ahead_min=1, days_ahead_max=90, reference_date=None):
    """
    Get a future datetime, staying within the data range.

    Args:
        days_ahead_min: Minimum days in the future
        days_ahead_max: Maximum days in the future
        reference_date: Reference date (defaults to DATA_START_DATE)

    Returns:
        datetime: Random future datetime within constraints
    """
    dt = get_future_date(days_ahead_min, days_ahead_max, reference_date)
    return datetime.combine(dt, datetime.min.time()) + timedelta(
        hours=random.randint(0, 23), minutes=random.randint(0, 59), seconds=random.randint(0, 59)
    )


def get_date_relative_to(reference_date, days_offset_min=-30, days_offset_max=30):
    """
    Get a date relative to a reference date, staying within the data range.

    Args:
        reference_date: The reference date
        days_offset_min: Minimum days offset (negative = past, positive = future)
        days_offset_max: Maximum days offset (negative = past, positive = future)

    Returns:
        date: Random date relative to reference
    """
    days_offset = random.randint(days_offset_min, days_offset_max)
    result_date = reference_date + timedelta(days=days_offset)

    # Clamp to data range
    if result_date < DATA_START_DATE:
        result_date = DATA_START_DATE
    if result_date > DATA_END_DATE:
        result_date = DATA_END_DATE

    return result_date


def get_datetime_relative_to(reference_datetime, hours_offset_min=-24, hours_offset_max=24):
    """
    Get a datetime relative to a reference datetime, staying within the data range.

    Args:
        reference_datetime: The reference datetime
        hours_offset_min: Minimum hours offset (negative = past, positive = future)
        hours_offset_max: Maximum hours offset (negative = past, positive = future)

    Returns:
        datetime: Random datetime relative to reference
    """
    hours_offset = random.uniform(hours_offset_min, hours_offset_max)
    result_datetime = reference_datetime + timedelta(hours=hours_offset)

    # Clamp to data range
    data_start_datetime = datetime.combine(DATA_START_DATE, datetime.min.time())
    data_end_datetime = datetime.combine(DATA_END_DATE, datetime.max.time())

    if result_datetime < data_start_datetime:
        result_datetime = data_start_datetime
    if result_datetime > data_end_datetime:
        result_datetime = data_end_datetime

    return result_datetime


# ============================================================================
# CONVENIENCE FUNCTIONS (common use cases)
# ============================================================================


def get_created_date():
    """Get a typical 'created_date' - could be anytime in the data range."""
    return get_random_date_within_range()


def get_created_datetime():
    """Get a typical 'created_datetime' - could be anytime in the data range."""
    return get_random_datetime_within_range()


def get_old_date():
    """Get an 'old' date - in the first half of the data range."""
    return get_random_date_within_range(DATA_START_DATE, DATA_START_DATE + timedelta(days=DATA_RANGE_DAYS // 2))


def get_old_datetime():
    """Get an 'old' datetime - in the first half of the data range."""
    return get_random_datetime_within_range(DATA_START_DATE, DATA_START_DATE + timedelta(days=DATA_RANGE_DAYS // 2))


# For backwards compatibility with existing code
get_random_date_within_data_range = get_random_date_within_range
