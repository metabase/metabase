from src.benchmarks.helpers import get_benchmark_table

simple_grouping = [
    # Brex Expenses - Group by department
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me expense totals by department",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Group by department `name` field
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expense reports per department?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Group by the department `name` field
    """,
    },
    # Brex Expenses - Group by user
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me how much each employee expensed.",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Group by user (can be user name, id, email or first name / last name)
    """,
    },
    # Brex Expenses - Group by status
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What are the min, max, and average expense amounts by status?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate minimum of the `amount` field
    * Calculate maximum of the `amount` field
    * Calculate average of the `amount` field
    * Group by `status`
    """,
    },
    # Shopify Customers - Group by accepts_marketing
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "What percentage of our shopify customer base accepts marketing?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of customer records
    * Group by `accepts_marketing`
    """,
    },
    # Shopify Products - Group by product_type
    {
        "table": get_benchmark_table("shopify_data.product"),
        "question": "How many products do we have per type in our online store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of product records
    * Group by `product_type`
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.product"),
        "question": "Do we have products with duplicate names in our shop?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of product records
    * Group by `title`
    """,
    },
    # Shopify Fulfillment - Group by tracking_company
    {
        "table": get_benchmark_table("shopify_data.fulfillment"),
        "question": "Show me shipment count by carrier",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of fulfillment records
    * Group by `tracking_company`
    """,
    },
]

temporal_grouping = [
    # Brex Expenses
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me monthly expense totals for 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `submitted_at` or `created_at` year = 2024 (other valid date range filters for 2024 are also acceptable)
    * Group by the date field with monthly granularity
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show weekly average expense submission amounts",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `amount` field
    * Group by `submitted_at` with weekly granularity
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me rejected expense trends by month that were in US dollars",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `status` = 'rejected'
    * Filter where `currency` = 'USD'
    * Group by `approved_at` with monthly granularity
    """,
    },
    # Shopify Orders
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "Show me the monthly number of online shop orders for 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Filter where `created_at` year = 2024
    * Group by `created_at` with monthly granularity
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "How are our online store orders distributed across the hours of the day?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Group by `created_at` with hourly granularity
    """,
    },
    # Shopify Refunds
    {
        "table": get_benchmark_table("shopify_data.refund"),
        "question": "Show me the weekly number of refunded orders.",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of refund records
    * Group by `created_at` with weekly granularity
    """,
    },
    # Salesforce Opportunities
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "Show me the quarterly opportunity amounts for 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `close_date` year = 2024 (other valid date range filters for 2024 are also acceptable)
    * Group by `close_date` with quarterly granularity
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "Show me the monthly opportunity amounts for 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `close_date` year = 2024 (other valid date range filters for 2024 are also acceptable)
    * Group by `close_date` with monthly granularity
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "Show me the highest opportunity amounts by day for July 2024.",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Max the `amount` field
    * Filter where `close_date` is in July 2024 (other valid date range filters for July 2024 are also acceptable)
    * Group by `close_date` with daily granularity
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "Show me the average opportunity amounts by created day for July 2024.",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Average the `amount` field
    * Filter where `created_date` is in July 2024 (other valid date range filters for July 2024 are also acceptable)
    * Group by `created_date` with daily granularity
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "How are our online store orders distributed across the days of the week?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Group by `created_at` with daily (day of week) granularity
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "Show me the quarterly online shop orders for 2025",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Filter where `created_at` year = 2025
    * Group by `created_at` with quarterly granularity
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        # NOTE: This one is more tricky since it should group by the processed_at field
        "question": "Show me the daily online shop orders did we process in January 2025",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Filter where `processed_at` is in January 2025
    * Group by `processed_at` with daily granularity
    """,
    },
    # Lever Applications
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "Show me the monthly application counts for 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where `created_at` year = 2024 (other valid date range filters for 2024 are also acceptable)
    * Group by `created_at` with monthly granularity
    """,
    },
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "How our application counts distributed across the days of the week?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Group by `created_at` with daily (day of week) granularity
    """,
    },
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "Show me the monthly application trend for 2023 and 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where `created_at` year = 2023 or 2024 (other valid date range filters for 2023 and 2024 are also acceptable)
    * Group by `created_at` with monthly granularity
    """,
    },
    # Expenses
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What $ amount of expense requests in every month of 2005?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `submitted_at` or `created_at` year = 2005 (other valid date range filters for 2005 are also acceptable. )
    * Group by the date field with monthly granularity
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What was the highest expense amount submitted by quarter in 2023?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Max the `amount` field
    * Filter where `submitted_at` or `created_at` year = 2023 (other valid date range filters for 2023 are also acceptable)
    * Group by the date field with quarterly granularity
    """,
    },
]


grouping = [
    *simple_grouping,
    *temporal_grouping,
]
