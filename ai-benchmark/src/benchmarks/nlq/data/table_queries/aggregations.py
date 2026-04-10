from src.benchmarks.helpers import get_benchmark_table

simple_aggregations = [
    # Brex Expenses
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expense reports have we received?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * No filters applied (excluding null values in submitted_at or filtering on status being 'submitted' is acceptable)
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What's the total value of all expense claims?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What's the average expense claim amount?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `amount` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How high was was the largest expense ever claimed?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate maximum of the `amount` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How high was the smallest expense claim we've received?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate minimum of the `amount` field
    * No filters applied
    """,
    },
    # Shopify Orders
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "How many orders have we received through our online shop?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Optionally filters out cancelled orders
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What's our total online store revenue?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `total_price` field
    * Optionally filters out cancelled orders
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What's the average order value in our store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `total_price` field
    * Optionally filters out cancelled orders
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What was our largest single online shop purchase?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate maximum of the `total_price` field
    * Optionally filters out cancelled orders
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What's the total amount of discounts we've given out in the online shop?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `total_discounts` field
    * Optionally filters out cancelled orders
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "How much tax have we collected from online shop sales?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `total_tax` field
    * Optionally filters out cancelled orders
    """,
    },
    # Shopify Customers
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "How many customers do we have in our online store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of customer records
    * No filters applied (excluding fivetran deleted records is acceptable)
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "What's the total lifetime value across all our customers for our online store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `total_spent` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "What's the average customer lifetime value in our store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `total_spent` field
    * No filters applied
    """,
    },
    # Shopify Products
    {
        "table": get_benchmark_table("shopify_data.product"),
        "question": "How many products are active in our online shop?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of product records
    * Filter for `status` = 'active' (excluding fivetran deleted records is acceptable but not required)
    """,
    },
    # Shopify Fulfillment
    {
        "table": get_benchmark_table("shopify_data.fulfillment"),
        "question": "How many shipments have we processed successfully?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of fulfillment records
    * Filter where `status` = 'successful'
    """,
    },
    # Shopify Refunds
    {
        "table": get_benchmark_table("shopify_data.refund"),
        "question": "How many refunds have we processed for orders in our shop?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of refund records
    * Optionally filter out null values in `processed_at`
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many employees have ever submitted expense reports?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count distinct `user_id`
    * Optionally filter out null values in `submitted_at`
    """,
    },
    # Lever applications
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "When did we receive the latest job application?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Get the maximum of the `created_at` field
    * No filters applied
    """,
    },
    # Salesforce opportunities
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What's the total value of all sales opportunities?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What's highest sales opportunity value we've recorded?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Get the maximum of the `amount` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What's lowest sales opportunity value we've recorded?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Get the minimum of the `amount` field
    * No filters applied
    """,
    },
]

multiple_aggregations = [
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me number of expenses, total-, and average spending by department",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Sum the `amount` field
    * Calculate average of the `amount` field
    * Group by department `name`
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What's the total value of all sales opportunities and how many do we have?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Count the number of opportunity records
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What's highest and lowest sales opportunity value we've recorded?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Get the maximum of the `amount` field
    * Get the minimum of the `amount` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What's highest and lowest sales opportunity value we've recorded and how many do we have?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Get the minimum of the `amount` field
    * Get the maximum of the `amount` field
    * Count the number of opportunity records
    * No filters applied
    """,
    },
    # Shopify Customers
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "Show me how many customers we have in our online store and what their average lifetime value is?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of customer records
    * Calculate average of the `total_spent` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "What's the total, max and min lifetime value across all our customers?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `total_spent` field
    * Get the maximum of the `total_spent` field
    * Get the minimum of the `total_spent` field
    * No filters applied
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "What's the average, min and max customer lifetime value in our store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `total_spent` field
    * Get the minimum of the `total_spent` field
    * Get the maximum of the `total_spent` field
    * No filters applied
    """,
    },
]

aggregations = [
    *simple_aggregations,
    *multiple_aggregations,
]
