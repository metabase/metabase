"""
Tests cross-grain join between invitee-level booking detail and daily event-type aggregates.
Agent must join individual invitee bookings to daily booking funnel statistics, matching on both
event_type_uri AND booking_date. Requires comparing individual days_booked_ahead against the
daily avg_days_scheduled_ahead for that event type, then deduplicating by event_type to avoid
listing the same event type multiple times when multiple invitees exceed the daily average.
"""

calendly_invitees_exceed_daily_lead_time_avg = {
    "description": "Event types with bookings exceeding daily average lead time - tests invitee-to-funnel grain join with temporal matching and event type deduplication",
    "message": "Show me calendly event types where individual bookings had longer lead times than the daily average for that event type",
    "table_names": [
        "calendly_enriched.int_calendly_invitee_facts",
        "calendly_enriched.int_calendly_booking_funnel_facts",
    ],
    "expected_fields": [
        "event_type_uri",
        "event_type_name",
        "days_booked_ahead",
        "avg_days_scheduled_ahead",
        "booking_date",
    ],
    "query_description": """
        * The query should use calendly_enriched.int_calendly_invitee_facts and calendly_enriched.int_calendly_booking_funnel_facts tables
        * The query should join on both event_type_uri AND booking_date to match individual bookings to their corresponding daily aggregates
        * The query should filter where individual days_booked_ahead is greater than the daily avg_days_scheduled_ahead
        * The query should deduplicate by event type to show each event type only once (using GROUP BY event_type_uri or DISTINCT)
        * The query should include event type identifier (event_type_uri and/or event_type_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT
          cibff.event_type_uri,
          cibff.event_type_name
        FROM
          calendly_enriched.int_calendly_booking_funnel_facts cibff
        JOIN
          calendly_enriched.int_calendly_invitee_facts ciff
          ON cibff.event_type_uri = ciff.event_type_uri
          AND cibff.booking_date = ciff.booking_date
        WHERE
          ciff.days_booked_ahead > cibff.avg_days_scheduled_ahead
          AND cibff.avg_days_scheduled_ahead IS NOT NULL
          AND ciff.days_booked_ahead IS NOT NULL;
    """,
}

"""
Tests cross-grain comparison between weekly user aggregates and overall user-level statistics.
Agent must join weekly scheduling metrics to user dimension table, matching on user_uri. Requires
comparing weekly cancellation_rate from the scheduling metrics (one row per user per week) against
the overall cancellation_rate from user dimension (one row per user), then deduplicating by user
to avoid listing the same user multiple times when they have multiple weeks exceeding their overall rate.
"""
calendly_users_weekly_cancellation_exceeds_overall = {
    "description": "Users with weekly cancellation rates exceeding overall rate - tests weekly-aggregate-to-dimension grain join with user deduplication",
    "message": "Show me calendly users who had weeks where their cancellation rate exceeded their overall cancellation rate",
    "table_names": [
        "calendly_enriched.int_calendly_scheduling_metrics_facts",
        "calendly_enriched.int_calendly_user_dim",
    ],
    "expected_fields": [
        "user_uri",
        "user_name",
        "cancellation_rate",
        "scheduling_week",
    ],
    "query_description": """
        * The query should use calendly_enriched.int_calendly_scheduling_metrics_facts and calendly_enriched.int_calendly_user_dim tables
        * The query should join on user_uri to match weekly metrics to user-level statistics
        * The query should filter where weekly cancellation_rate (from scheduling_metrics_facts) is greater than overall cancellation_rate (from user_dim)
        * The query should deduplicate by user to show each user only once (using GROUP BY user_uri or DISTINCT)
        * The query should include user identifier (user_uri and/or user_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT f.user_name
        FROM calendly_enriched.int_calendly_scheduling_metrics_facts f
        INNER JOIN calendly_enriched.int_calendly_user_dim u
        ON f.user_uri = u.user_uri
        WHERE f.cancellation_rate > u.cancellation_rate;
    """,
}

TEST_SPECS = [
    calendly_invitees_exceed_daily_lead_time_avg,
    calendly_users_weekly_cancellation_exceeds_overall,
]
