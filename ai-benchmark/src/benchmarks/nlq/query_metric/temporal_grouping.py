from src.core.base import BenchmarkE2E
from src.benchmarks.helpers import (
    BOUNCE_RATE_METRIC,
    CARD_UTILIZATION_RATE_METRIC,
    CUSTOMER_CHURN_RATE_METRIC,
    DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
    EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
    OPEN_RATE_METRIC,
    full_access_user_config,
)
from src.benchmarks.nlq.factories import create_nlq_test_cases

bounce_rate_temporal_grouping = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Show me the bounce rate by month",
        "expected_query": "The query should group by bounce_month or use temporal grouping on bounce_timestamp/bounce_date with monthly granularity.",  # noqa: E501
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Show me the bounce rate by day",
        "expected_query": "The query should use temporal grouping on bounce_timestamp/bounce_date with daily granularity.",  # noqa: E501
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Show me the bounce rate by week",
        "expected_query": "The query should use temporal grouping on bounce_timestamp/bounce_date with weekly granularity.",  # noqa: E501
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Show me the bounce rate by hour of the day",
        "expected_query": "The query should use temporal grouping on bounce_timestamp/bounce_date with hourly granularity (hour of day).",  # noqa: E501
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Are there any hours of the day where bounce rate is particularly high?",
        "expected_query": "The query should use temporal grouping on bounce_timestamp/bounce_date with hourly granularity (hour of day).",  # noqa: E501
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Are there specific quarters where bounce rate spikes?",
        "expected_query": "The query should use temporal grouping on bounce_timestamp/bounce_date with quarterly granularity.",  # noqa: E501
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What's our bounce rate over the years?",
        "expected_query": "The query should group by bounce_year or use temporal grouping with yearly granularity.",
    },
]

card_utilization_rate_temporal_grouping = [
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Show me utilization rate by when cards were created monthly",
        "expected_query": "The query should group by card_created_date with monthly granularity.",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Is there an influence of card creation quarter on utilization rate?",
        "expected_query": "The query should group by card_created_date with quarterly granularity.",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Is there an influence of day of week when cards were created on utilization rate?",
        "expected_query": "The query should group by card_created_date with weekly granularity.",
    },
]

customer_churn_rate_temporal_grouping = [
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Show me monthly churn rate trends",
        "expected_query": "The query should group by customer_created_date or customer_updated_date with monthly granularity.",  # noqa: E501
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Show me weekly churn rate trends",
        "expected_query": "The query should group by customer_created_date or customer_updated_date with weekly granularity.",  # noqa: E501
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's our churn rate year over year?",
        "expected_query": "The query should group by customer_created_date or customer_updated_date with yearly granularity.",  # noqa: E501
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What does the churn rate look like by day of the week?",
        "expected_query": "The query should group by customer_created_date or customer_updated_date with day of week granularity.",  # noqa: E501
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What does the churn rate look like by hour of the day?",
        "expected_query": "The query should group by customer_created_date or customer_updated_date with hourly (hour of day) granularity.",  # noqa: E501
    },
]

department_expense_approval_rate_temporal_grouping = [
    # TEMPORAL GROUPING - Monthly trend
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "Show me monthly department expense approval rates",
        "expected_query": "The query should group by expense_date or submission_date with monthly granularity.",
    },
    # TEMPORAL GROUPING - Quarterly trend
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What's our quarterly department expense approval rate trend?",
        "expected_query": "The query should group by expense_date or submission_date with quarterly granularity.",
    },
]

expense_approval_cycle_time_temporal_grouping = [
    # TEMPORAL GROUPING - Monthly trend
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "What's the monthly trend for approval cycle time?",
        "expected_query": "The query should group by submission_date or expense_date with monthly granularity.",
    },
]

open_rate_temporal_grouping = [
    # TEMPORAL GROUPING - Monthly trend
    {
        "metric": OPEN_RATE_METRIC,
        "question": "Show me monthly open rate trends",
        "expected_query": "The query should group by delivery_date or sent_date with monthly granularity.",
    },
    # TEMPORAL GROUPING - Weekly trend
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's our weekly open rate?",
        "expected_query": "The query should group by delivery_date or sent_date with weekly granularity.",
    },
]

temporal_grouping = [
    *bounce_rate_temporal_grouping,
    *card_utilization_rate_temporal_grouping,
    *customer_churn_rate_temporal_grouping,
    *department_expense_approval_rate_temporal_grouping,
    *expense_approval_cycle_time_temporal_grouping,
    *open_rate_temporal_grouping,
]

# Create benchmark instances for temporal grouping
temporal_grouping_mentioning_metric = BenchmarkE2E(
    name="NLQ Metrics - Temporal Grouping (metric mentioned)",
    test_cases=create_nlq_test_cases(cases=temporal_grouping, entity_type="metric", mention_entity=True),
    config=full_access_user_config,
)
temporal_grouping_viewing_metric = BenchmarkE2E(
    name="NLQ Metrics - Temporal Grouping (user viewing metric)",
    test_cases=create_nlq_test_cases(cases=temporal_grouping, entity_type="metric", user_is_viewing=True),
    config=full_access_user_config,
)
temporal_grouping_no_context = BenchmarkE2E(
    name="NLQ Metrics - Temporal Grouping (no context)",
    test_cases=create_nlq_test_cases(cases=temporal_grouping, entity_type="metric"),
    config=full_access_user_config,
)
