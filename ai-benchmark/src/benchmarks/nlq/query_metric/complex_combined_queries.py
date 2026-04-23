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

bounce_rate_complex_combined = [
    # COMBINED - Filter + Grouping
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "Show me monthly bounce rate for the onboarding campaign",
        "expected_query": "The query should filter where campaign_name = 'Onboarding' AND group by month using bounce_month or temporal grouping.",
    },
    # COMBINED - Multiple filters + Grouping
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What's the hard bounce rate by campaign in 2024?",
        "expected_query": "The query should filter where bounce_type = 'hard' AND bounce_year = 2024 AND group by campaign_name.",
    },
    # COMBINED - Temporal + Categorical with sorting
    {
        "metric": BOUNCE_RATE_METRIC,
        # TODO (Thomas 2025-11-24): Metrics cannot sort yet. When they can, this should add sorting and limit 1 to the expected query.
        "question": "Which bounce type had the highest rate in 2024?",
        "expected_query": "The query should filter where bounce_year = 2024, group by bounce_type.",
    },
]


card_utilization_rate_complex_combined = [
    # COMBINED - Filter + Grouping
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Show me active card utilization by card type",
        "expected_query": (
            "The query should filter for active cards AND group by card_type. "
            "Any of these active card filters is acceptable: card_status = 'active', is_active = true."
        ),
    },
    # COMBINED - Multiple filters
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "What's the utilization rate for active physical cards with high limits?",
        "expected_query": (
            "The query should filter for active cards AND card_type = 'physical' AND limit_tier = 'High Limit'. "
            "Any of these active card filters is acceptable: card_status = 'active', is_active = true."
        ),
    },
    # COMBINED - Numeric filter + Grouping
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Break down utilization by card type for cards with over 5 transactions",
        "expected_query": "The query should filter where transaction_count > 5 AND group by card_type.",
    },
    # COMBINED - Filter + Grouping + Sorting
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        # TODO (Thomas 2025-11-24): Metrics cannot sort yet. When they can, this should add sorting and limit 1 to the expected query.
        "question": "Which user has the highest utilization rate on active cards?",
        "expected_query": (
            "The query should filter for active cards, group by user_name. "
            "Any of these active card filters is acceptable: card_status = 'active', is_active = true."
        ),
    },
]

customer_churn_rate_complex_combined = [
    # COMBINED - Engagement filter + Temporal grouping
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Show me monthly churn for low engaged customers",
        "expected_query": "The query should filter where engagement_level = 'Low Engagement' AND group by month using customer_created_date or customer_updated_date.",
    },
    # COMBINED - Numeric filter + Grouping
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Break down churn by engagement level for customers with 3+ deliveries",
        "expected_query": "The query should filter where total_deliveries >= 3 AND group by engagement_level.",
    },
    # COMBINED - Multiple numeric filters
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's the churn rate for customers who received emails but never opened them?",
        "expected_query": "The query should filter where total_deliveries > 0 AND total_opens = 0.",
    },
    # COMBINED - Boolean + Numeric filter
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's the churn among unsubscribed customers who opened at least 3 mails?",
        "expected_query": "The query should filter where unsubscribed = true AND total_opens >= 3.",
    },
]

department_expense_approval_rate_complex_combined = [
    # COMBINED - Filter + Grouping
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "Show me Marketing department approval rate by month",
        "expected_query": "The query should filter where department_name = 'Marketing' AND group by month using expense_date or submission_date.",
    },
    # COMBINED - Multiple filters
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What's the approval rate for customer success expenses over $5000?",
        "expected_query": "The query should filter where department_name = 'Customer Success' AND total_expenses > 5000.",
    },
    # COMBINED - Filter + Grouping + Sorting
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "Which department has the lowest approval rate?",
        "expected_query": "The query should group by department_name, and sort ascending with limit 1.",
    },
]

expense_approval_cycle_time_complex_combined = [
    # COMBINED - Filter + Grouping
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "Show me Marketing department approval time by transaction category",
        "expected_query": "The query should filter where department_name = 'Marketing' AND group by transaction_category.",
    },
    # COMBINED - Multiple filters
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "What's the approval time for Sales travel expenses over $2000?",
        "expected_query": "The query should filter where department_name = 'Sales' AND transaction_category = 'Travel' AND expense_amount > 2000.",
    },
    # COMBINED - Filter + Grouping + Sorting
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "Which department has the slowest approval time?",
        "expected_query": "The query should group by department_name, and sort ascending with limit 1.",
    },
]

open_rate_complex_combined = [
    # COMBINED - Filter + Grouping
    {
        "metric": OPEN_RATE_METRIC,
        "question": "Show me monthly open rate for the upgrade nudging campaign",
        "expected_query": "The query should filter where campaign_name = 'Upgrade Nudge' AND group by month using delivery_date or sent_date.",
    },
    # COMBINED - Multiple filters + Grouping
    {
        "metric": OPEN_RATE_METRIC,
        "question": "Break down 2024 open rate by campaign",
        "expected_query": "The query should filter where year = 2024 AND group by campaign_name.",
    },
    # COMBINED - Filter + Grouping + Sorting
    {
        "metric": OPEN_RATE_METRIC,
        # TODO (Thomas 2025-11-24): Metrics cannot sort yet. When they can, this should add sorting and limit 1 to the expected query.
        "question": "Which campaign had the best open rate in 2024?",
        "expected_query": "The query should filter where year = 2024, group by campaign_name.",
    },
    # COMBINED - Temporal + Categorical with sorting
    {
        "metric": OPEN_RATE_METRIC,
        # TODO (Thomas 2025-11-24): Metrics cannot sort yet. When they can, this should add sorting and limit 1 to the expected query.
        "question": "Which day of the week had the highest open rate in 2024?",
        "expected_query": "The query should filter where year = 2024, group by day_of_week.",
    },
]

complex_combined = [
    *bounce_rate_complex_combined,
    *card_utilization_rate_complex_combined,
    *customer_churn_rate_complex_combined,
    *department_expense_approval_rate_complex_combined,
    *expense_approval_cycle_time_complex_combined,
    *open_rate_complex_combined,
]

# Create benchmark instances for complex combined queries
complex_combined_mentioning_metric = BenchmarkE2E(
    name="NLQ Metrics - Complex Combined (metric mentioned)",
    test_cases=create_nlq_test_cases(cases=complex_combined, entity_type="metric", mention_entity=True),
    config=full_access_user_config,
)
complex_combined_viewing_metric = BenchmarkE2E(
    name="NLQ Metrics - Complex Combined (user viewing metric)",
    test_cases=create_nlq_test_cases(cases=complex_combined, entity_type="metric", user_is_viewing=True),
    config=full_access_user_config,
)
complex_combined_no_context = BenchmarkE2E(
    name="NLQ Metrics - Complex Combined (no context)",
    test_cases=create_nlq_test_cases(cases=complex_combined, entity_type="metric"),
    config=full_access_user_config,
)
