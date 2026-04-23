from src.core.base import BenchmarkE2E
from src.benchmarks.helpers import (
    AVERAGE_RETURN_LOW_COST_CAMPAIGNS_METRIC,
    Q4_AOV_METRIC,
    full_access_user_config,
)
from src.benchmarks.nlq.factories import create_nlq_test_cases

measures_and_segments = [
    {
        "metric": Q4_AOV_METRIC,
        "question": "What's our Q4 average order value?",
        "expected_query": (
            "The query should calculate avg(total_price) from the int_shopify_order_facts table "
            "AND filter where order_quarter = 4."
        ),
    },
    {
        "metric": Q4_AOV_METRIC,
        "question": "Show me Q4 AOV",
        "expected_query": (
            "The query should calculate avg(total_price) from the int_shopify_order_facts table "
            "AND filter where order_quarter = 4."
        ),
    },
    {
        "metric": AVERAGE_RETURN_LOW_COST_CAMPAIGNS_METRIC,
        "question": "Show me our return from low-cost campaigns",
        "expected_query": (
            "The query should calculate avg(return_on_ad_spend) from the int_google_adwords_daily_spend_facts table "
            "AND filter where average_cost_per_conversion is low (e.g. average_cost_per_conversion < some threshold)."
        ),
    },
    {
        "metric": AVERAGE_RETURN_LOW_COST_CAMPAIGNS_METRIC,
        "question": "What is our average return from low-cost conversion campaigns?",
        "expected_query": (
            "The query should calculate avg(return_on_ad_spend) from the int_google_adwords_daily_spend_facts table "
            "AND filter where average_cost_per_conversion is low (e.g. average_cost_per_conversion < some threshold)."
        ),
    },
]

measures_and_segments_mentioning_metric = BenchmarkE2E(
    name="NLQ Metrics - Measures and Segments (metric mentioned)",
    test_cases=create_nlq_test_cases(cases=measures_and_segments, entity_type="metric", mention_entity=True),
    config=full_access_user_config,
)

measures_and_segments_viewing_metric = BenchmarkE2E(
    name="NLQ Metrics - Measures and Segments (user viewing metric)",
    test_cases=create_nlq_test_cases(cases=measures_and_segments, entity_type="metric", user_is_viewing=True),
    config=full_access_user_config,
)

measures_and_segments_no_context = BenchmarkE2E(
    name="NLQ Metrics - Measures and Segments (no context)",
    test_cases=create_nlq_test_cases(cases=measures_and_segments, entity_type="metric"),
    config=full_access_user_config,
)
