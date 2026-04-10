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

single_dimension = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Break down bounce rate by campaign",
        "expected_query": "The query must group by campaign_name.",
    },
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Show me bounce rate by bounce type",
        "expected_query": "The query should group by bounce_type.",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Break down card utilization by card type",
        "expected_query": (
            "The query should group by card type. Any of these groupings is acceptable: card_type, card_type_category."
        ),
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Show me card utilization rate by employee",
        "expected_query": "The query must group by user_name.",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "What's the card utilization rate for each limit tier?",
        "expected_query": "The query should group by limit_tier.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Break down churn rate by customer engagement",
        "expected_query": "The query should group by engagement_level.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's the churn rate by subscription status?",
        "expected_query": "The query should group by subscription_status.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Show me churn rate by number of emails received",
        "expected_query": "The query should group by total_deliveries.",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "Break down expense approval rate by department",
        "expected_query": "The query must group by department_name.",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What's the department approval rate by tier?",
        "expected_query": "The query should group by spend_tier.",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "Break down approval cycle time by department",
        "expected_query": "The query must group by department_name.",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "Show me cycle time by approving expenses by the type of transaction.",
        "expected_query": "The query should group by transaction_category.",
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "Break down open rate by campaign",
        "expected_query": "The query must group by campaign_name.",
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate by customer?",
        "expected_query": "The query should group by customer_name or by customer_id.",
    },
]

multiple_dimensions = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Break down bounce rate by campaign and bounce type",
        "expected_query": "The query should group by campaign_name AND bounce_type.",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Break down utilization by card type and status",
        "expected_query": "The query should group by card_type AND card_status.",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "Break down approval rate by department and spend tier",
        "expected_query": "The query should group by department_name AND spend_tier.",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "Break down cycle time by department and expense type",
        "expected_query": (
            "The query should group by department_name AND expense_category. "
            "Any of these expense groupings is acceptable: expense_category, expense_type."
        ),
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "Break down open rate by campaign and day of week",
        "expected_query": "The query should group by campaign_name (or campaign_id) AND day_of_week.",
    },
]


dimensional_breakdown = [
    *single_dimension,
    *multiple_dimensions,
]

# Create benchmark instances for dimensional breakdown
dimensional_breakdown_mentioning_metric = BenchmarkE2E(
    name="NLQ Metrics - Dimensional Breakdown (metric mentioned)",
    test_cases=create_nlq_test_cases(cases=dimensional_breakdown, entity_type="metric", mention_entity=True),
    config=full_access_user_config,
)
dimensional_breakdown_viewing_metric = BenchmarkE2E(
    name="NLQ Metrics - Dimensional Breakdown (user viewing metric)",
    test_cases=create_nlq_test_cases(cases=dimensional_breakdown, entity_type="metric", user_is_viewing=True),
    config=full_access_user_config,
)
dimensional_breakdown_no_context = BenchmarkE2E(
    name="NLQ Metrics - Dimensional Breakdown (no context)",
    test_cases=create_nlq_test_cases(cases=dimensional_breakdown, entity_type="metric"),
    config=full_access_user_config,
)
