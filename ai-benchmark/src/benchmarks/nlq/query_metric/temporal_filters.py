from src.core.base import BenchmarkE2E
from src.benchmarks.helpers import (
    BOUNCE_RATE_METRIC,
    CUSTOMER_CHURN_RATE_METRIC,
    DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
    EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
    OPEN_RATE_METRIC,
    full_access_user_config,
)
from src.benchmarks.nlq.factories import create_nlq_test_cases

absolute_date_filters = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What was the bounce rate on 1st February 2024?",
        "expected_query": "Should apply a reasonable filter on bounce_date/bounce_timestamp that would filter for bounces occurring on 2024-02-01.",  # noqa: E501
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What was the bounce before 1st February 2024?",
        "expected_query": "Should apply a reasonable filter on bounce_date/bounce_timestamp that would filter for bounces occurring before 2024-02-01.",  # noqa: E501
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What was the bounce after 1st February 2024?",
        "expected_query": "Should apply a reasonable filter on bounce_date/bounce_timestamp that would filter for bounces occurring after 2024-02-01.",  # noqa: E501
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What was the bounce rate between 1st February 2024 and 15th February 2024?",
        "expected_query": "Should apply a reasonable filter on bounce_date/bounce_timestamp that would filter for bounces occurring between 2024-02-01 and 2024-02-15.",  # noqa: E501
    },
]

date_bucket_filters = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What was our bounce rate in 2024?",
        "expected_query": """Any of the following filters are acceptable (if any is present, the test passes):
        -  bounce_year = 2024
        - OR bounce_date/bounce_timestamp within 2024""",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What was the churn rate in 2024?",
        "expected_query": """The query should apply 1 of the following filters (both are acceptable):
        1. customer_created_date
        2. OR customer_updated_date within 2024""",
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What's the bounce rate on Sundays?",
        "expected_query": "The query should filter bounce_day_of_week = 1 (Sunday).",
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What's the bounce rate in January across all years?",
        "expected_query": "The query should filter where bounce_month = 1.",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What was the approval rate in 2024?",
        "expected_query": "The query should filter where spending_month or spending_year within 2024.",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "What was the average approval time in 2024?",
        "expected_query": "The query should filter where submission_date is within 2024. Alternatively, it is also acceptable to filter where expense_date is within 2024.",  # noqa: E501
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What was the open rate in 2024?",
        "expected_query": "The query should filter where delivery_date within 2024 (using sent_date as an alternative column is also acceptable).",  # noqa: E501
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate on Mondays?",
        "expected_query": (
            "The query should filter for Mondays. "
            "Any of these filters is acceptable: day_of_week = 2, delivery_day_of_week = 2."
        ),
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate on weekends?",
        "expected_query": "The query should perform a day of week extraction on the delivery date in the filter. The resulting values should be filtered to be equal to 1 (Sunday) or 7 (Saturday).",  # noqa: E501
    },
]

relative_date_filters = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What was our bounce rate in the last 30 days?",
        "expected_query": """The query should filter bounce_date or bounce_timestamp to the period from 2025-08-31 to 2025-09-30.
Relative time filters are also acceptable. For the start, date, it is also acceptable to use 2025-09-01 (inclusive). It is also acceptable if the end date is omitted (assuming up to current date).
""",  # noqa: E501
        "current_user_time": "2025-09-30T13:14:43+02:00",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's our churn rate in the last quarter?",
        "expected_query": """The query should apply the following filters to either the customer_created_date or customer_updated_date (both are acceptable):
Filter to the period from 2025-07-01 to 2025-09-30. Relative time filters are also acceptable. It is also acceptable to filter on quarter and year (quarter = 2 and year = 2025).
""",  # noqa: E501
        "current_user_time": "2025-09-30T13:14:43+02:00",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What's the approval rate for the last 60 days for all departments?",
        "expected_query": """The query should filter expense_date or submission_date starting at 2025-08-01. Alternatively, using a relative time filter over the last 60 days is also acceptable.
        Optionally it may include filter with an end date of 2025-09-30.""",  # noqa: E501
        "current_user_time": "2025-09-30T13:14:43+02:00",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "What's the approval cycle time over the last 90 days?",
        "expected_query": "The query should filter submission_date or expense_date to the period from 2025-07-02 to 2025-09-30. Relative time filters are also acceptable. The upper limit is optional and not required.",
        "current_user_time": "2025-09-30T13:14:43+02:00",
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate for the last 30 days?",
        "expected_query": """The query should filter delivery_date or sent_date to the period from 2025-08-31 to 2025-09-30.
Relative time filters are also acceptable. The upper limit is optional and not required. For the lower limit, it is also acceptable to start from 2025-09-01 (inclusive).
""",
        "current_user_time": "2025-09-30T13:14:43+02:00",
    },
]

temporal_filters = [
    *absolute_date_filters,
    *date_bucket_filters,
    *relative_date_filters,
]

# Create benchmark instances for temporal filters
temporal_filters_mentioning_metric = BenchmarkE2E(
    name="NLQ Metrics - Temporal Filters (metric mentioned)",
    test_cases=create_nlq_test_cases(cases=temporal_filters, entity_type="metric", mention_entity=True),
    config=full_access_user_config,
)
temporal_filters_viewing_metric = BenchmarkE2E(
    name="NLQ Metrics - Temporal Filters (user viewing metric)",
    test_cases=create_nlq_test_cases(cases=temporal_filters, entity_type="metric", user_is_viewing=True),
    config=full_access_user_config,
)
temporal_filters_no_context = BenchmarkE2E(
    name="NLQ Metrics - Temporal Filters (no context)",
    test_cases=create_nlq_test_cases(cases=temporal_filters, entity_type="metric"),
    config=full_access_user_config,
)
