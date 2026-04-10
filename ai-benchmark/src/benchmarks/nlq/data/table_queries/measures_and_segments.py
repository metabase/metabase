from src.benchmarks.helpers import (
    ACTIVE_SUBSCRIBERS_SEGMENT,
    AVERAGE_CUSTOMER_LIFETIME_VALUE_MEASURE,
    AVERAGE_ORDER_VALUE_MEASURE,
    NEW_CUSTOMERS_SEGMENT,
    Q4_ORDERS_SEGMENT,
    TOTAL_MONTHLY_RECURRING_REVENUE_MEASURE,
    TOTAL_NET_REVENUE_MEASURE,
    get_benchmark_table,
)

measure_usage_tests = [
    {
        "table": get_benchmark_table("shopify_enriched.int_shopify_order_facts"),
        "measure_ids": [AVERAGE_ORDER_VALUE_MEASURE.id],
        "question": "What's the average order value?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate the average of the `total_price` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("shopify_enriched.int_shopify_order_facts"),
        "measure_ids": [TOTAL_NET_REVENUE_MEASURE.id],
        "question": "Show me total net revenue",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate the sum of the `net_revenue` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("shopify_enriched.int_shopify_customer_dim"),
        "measure_ids": [AVERAGE_CUSTOMER_LIFETIME_VALUE_MEASURE.id],
        "question": "What's our average customer lifetime value?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate the average of the `lifetime_value` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("stripe_enriched.int_stripe_monthly_revenue_fact"),
        "measure_ids": [TOTAL_MONTHLY_RECURRING_REVENUE_MEASURE.id],
        "question": "Show me our total monthly recurring revenue",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate the sum of the `mrr_amount` field
    * No filters applied
    """,
    },
]

segment_usage_tests = [
    {
        "table": get_benchmark_table("shopify_enriched.int_shopify_order_facts"),
        "segment_ids": [NEW_CUSTOMERS_SEGMENT.id],
        "question": "Show me orders from new customers",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter for customers where `created_at` is within the past 30 days (via join to customer dimension)
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("shopify_enriched.int_shopify_order_facts"),
        "segment_ids": [Q4_ORDERS_SEGMENT.id],
        "question": "What are our Q4 orders?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `order_quarter` = 4
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("stripe_enriched.int_stripe_monthly_revenue_fact"),
        "segment_ids": [ACTIVE_SUBSCRIBERS_SEGMENT.id],
        "question": "Show me active subscribers",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `subscription_status` = 'active'
    * Not apply any aggregation
    """,
    },
]

measures_and_segments_usage_tests = [
    {
        "table": get_benchmark_table("shopify_enriched.int_shopify_order_facts"),
        "measure_ids": [AVERAGE_ORDER_VALUE_MEASURE.id],
        "segment_ids": [NEW_CUSTOMERS_SEGMENT.id],
        "question": "Show me average order value for new customers",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate the average of the `total_price` field
    * Filter for customers where `created_at` is within the past 30 days (via join to customer dimension)
    """,
    },
    {
        "table": get_benchmark_table("shopify_enriched.int_shopify_order_facts"),
        "measure_ids": [TOTAL_NET_REVENUE_MEASURE.id],
        "segment_ids": [Q4_ORDERS_SEGMENT.id],
        "question": "What's the total net revenue from Q4 orders?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate the sum of the `net_revenue` field
    * Filter where `order_quarter` = 4
    """,
    },
    {
        "table": get_benchmark_table("stripe_enriched.int_stripe_monthly_revenue_fact"),
        "measure_ids": [TOTAL_MONTHLY_RECURRING_REVENUE_MEASURE.id],
        "segment_ids": [ACTIVE_SUBSCRIBERS_SEGMENT.id],
        "question": "Show me monthly recurring revenue for active subscribers",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate the sum of the `mrr_amount` field
    * Filter where `subscription_status` = 'active'
    """,
    },
]

measures_and_segments = [
    *measure_usage_tests,
    *segment_usage_tests,
    *measures_and_segments_usage_tests,
]
