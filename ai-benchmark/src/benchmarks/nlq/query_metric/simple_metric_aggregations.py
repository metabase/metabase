from src.core.base import BenchmarkE2E
from src.benchmarks.helpers import (
    BOUNCE_RATE_METRIC,
    CARD_TRANSACTION_VOLUME_PER_CARD_METRIC,
    CARD_UTILIZATION_RATE_METRIC,
    CUSTOMER_CHURN_RATE_METRIC,
    DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
    EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
    OPEN_RATE_METRIC,
    SCHEDULED_EVENTS_METRIC,
    full_access_user_config,
)
from src.benchmarks.nlq.factories import create_nlq_test_cases

SIMPLE_AGGREGATION_EXPECTATION = """
The query should perform an aggregation calculation.
You can trust that if an aggregation is present, it is the correct calculation for the intended metric.
Any joins, subqueries, filters, or additional columns that are part of the calculation are acceptable.
The query should not include additional WHERE clauses, GROUP BY clauses, or filtering that would change
the scope beyond the metric's defined calculation.
"""

simple_metric_aggregation_cases = [
    {
        "metric": BOUNCE_RATE_METRIC,
        "question": "What is our bounce rate?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What is our open rate?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What share of emails were opened?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": OPEN_RATE_METRIC,
        "question": "What percentage of emails were opened?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What percentage of customers have unsubscribed from our emails?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What is our customer churn rate?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": CUSTOMER_CHURN_RATE_METRIC,
        "question": "What portion of customers have churned?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "How fast do we approve expenses?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": EXPENSE_APPROVAL_CYCLE_TIME_METRIC,
        "question": "What is the average time to approve an expense?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": CARD_UTILIZATION_RATE_METRIC,
        "question": "What is the utilization rate of our company cards?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What percentage of department expenses get approved?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What share of department expenses get approved?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": DEPARTMENT_EXPENSE_APPROVAL_RATE_METRIC,
        "question": "What portion of department expenses get approved?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": SCHEDULED_EVENTS_METRIC,
        "question": "How many events have been scheduled overall?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": CARD_TRANSACTION_VOLUME_PER_CARD_METRIC,
        "question": "What is the average transaction volume per card?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": CARD_TRANSACTION_VOLUME_PER_CARD_METRIC,
        "question": "How many transactions are made per card on average?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": CARD_TRANSACTION_VOLUME_PER_CARD_METRIC,
        "question": "What is the avg number of transactions per card?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
    {
        "metric": CARD_TRANSACTION_VOLUME_PER_CARD_METRIC,
        "question": "What is the mean transaction volume per card?",
        "expected_query": SIMPLE_AGGREGATION_EXPECTATION,
    },
]


simple_metric_aggregation_mentioning_metric = BenchmarkE2E(
    name="NLQ Metrics - Simple Aggregation (metric mentioned)",
    test_cases=create_nlq_test_cases(
        cases=simple_metric_aggregation_cases, entity_type="metric", mention_entity=True
    ),
    config=full_access_user_config,
)
simple_metric_aggregation_viewing_metric = BenchmarkE2E(
    name="NLQ Metrics - Simple Aggregation (user viewing metric)",
    test_cases=create_nlq_test_cases(
        cases=simple_metric_aggregation_cases, entity_type="metric", user_is_viewing=True
    ),
    config=full_access_user_config,
)
simple_metric_aggregation_no_context = BenchmarkE2E(
    name="NLQ Metrics - Simple Aggregation (no context)",
    test_cases=create_nlq_test_cases(cases=simple_metric_aggregation_cases, entity_type="metric"),
    config=full_access_user_config,
)
