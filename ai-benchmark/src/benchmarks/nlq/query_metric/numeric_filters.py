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

single_filter = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What's the bounce rate for emails that bounced within 24 hours of delivery?",
        "expected_query": "The query should filter where hours_since_delivery <= 24.",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "What's the utilization rate for cards with credit limits over 5000?",
        "expected_query": "The query should filter where credit_limit > 5000.",
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "Show me utilization for cards with more than 10 transactions",
        "expected_query": "The query should filter where transaction_count > 10.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's the churn rate for customers who received at least 5 emails?",
        "expected_query": "The query should filter where total_deliveries >= 5.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What's the churn rate for customers who never opened emails?",
        "expected_query": "The query should filter where total_opens = 0.",
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Show me churn for customers who clicked 2 or more times",
        "expected_query": "The query should filter where total_clicks >= 2.",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What's the approval rate for department expenses over $1000?",
        "expected_query": "The query should filter where total_expenses > 1000.",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "How long does it take to approve expenses over $10000?",
        "expected_query": "The query should filter for expense_amount over $10000.",
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate for emails opened within 24 hours?",
        "expected_query": (
            "The query should filter for emails opened within 24 hours. "
            "Any of these filters is acceptable: hours_since_delivery <= 24, time_to_open <= 24."
        ),
    },
]

range_filters = [
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "What's the utilization for cards with credit limits between 3000 and 7000?",
        "expected_query": "The query should filter where credit_limit >= 3000 AND credit_limit <= 7000.",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "Show me approval rate for monthly department expenses between $500 and $2000",
        "expected_query": "The query should filter where total_expenses >= 500 AND total_expenses <= 2000.",
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "What's the approval time for expenses between $1000 and $5000?",
        "expected_query": "The query should filter where expense_amount >= 1000 AND expense_amount <= 5000.",
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate for emails opened between 1 and 5 hours after delivery?",
        "expected_query": "The query should filter where time_to_open >= 1 AND time_to_open <= 5.",
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What is the approval rate for departments with 10 to 50 expenses?",
        "expected_query": "The query should filter where expense_count >= 10 AND expense_count <= 50.",
    },
]

multiple_filters = [
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "Show me churn rate for customers who received at least 10 emails and clicked more than 3 times",
        "expected_query": "The query should filter where total_deliveries >= 10 AND total_clicks > 3.",
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What's the open rate for emails opened within 12 hours and that had at least 2 opens but not more than 3 clicks?",  # noqa: E501
        "expected_query": "The query should filter where time_to_open <= 12 AND total_opens >= 2 AND total_clicks <= 3.",  # noqa: E501
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What's the approval rate for department expenses between $500 and $5000 with more than 5 expenses?",  # noqa: E501
        "expected_query": "The query should filter where total_expenses >= 500 AND total_expenses <= 5000 AND expense_count > 5.",  # noqa: E501
    },
]


numeric_filters = [
    *single_filter,
    *range_filters,
    *multiple_filters,
]

# Create benchmark instances for numeric and string filters
numeric_filters_mentioning_metric = BenchmarkE2E(
    name="NLQ Metrics - Numeric Filters (metric mentioned)",
    test_cases=create_nlq_test_cases(cases=numeric_filters, entity_type="metric", mention_entity=True),
    config=full_access_user_config,
)
numeric_filters_viewing_metric = BenchmarkE2E(
    name="NLQ Metrics - Numeric Filters (user viewing metric)",
    test_cases=create_nlq_test_cases(cases=numeric_filters, entity_type="metric", user_is_viewing=True),
    config=full_access_user_config,
)
numeric_filters_no_context = BenchmarkE2E(
    name="NLQ Metrics - Numeric Filters (no context)",
    test_cases=create_nlq_test_cases(cases=numeric_filters, entity_type="metric"),
    config=full_access_user_config,
)
