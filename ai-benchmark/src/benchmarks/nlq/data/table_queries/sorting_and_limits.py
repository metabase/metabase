from src.benchmarks.helpers import get_benchmark_table

sorting_and_limits = [
    # Brex Expenses
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What are the 10 largest expense claims?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Order by `amount` descending
    * Limit to 10 records
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me the most recent 15 expense submissions",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Order by `submitted_at` or `created_at` descending
    * Limit to 15 records
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Which department has submitted the most expense claims?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Group by the department `name` field
    * Order by count descending (optionally, it is also acceptable to order by department name)
    * Optionally limit to 1 record
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Which top 12 employees have submitted the most expense reports?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Group by user name
    * Order by count descending
    * Limit to top 12 records
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Who has the highest total in expense claims?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Group by user name
    * Order by sum descending
    * Optionally limit to 1 record
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Who has the lowest total in expense claims?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Group by user name
    * Order by sum ascending
    * Optionally limit to 1 record
    """,
    },
    # Shopify Customers
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "Who are our top 20 shop customers by spending?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Order by `total_spent` descending
    * Limit to 20 records
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "Who are our worst 20 shop customers by spending?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Order by `total_spent` ascending
    * Limit to 20 records
    * Not apply any aggregation
    """,
    },
    # Shopify orders
    {
        "table": get_benchmark_table("shopify_data.order_line"),
        "question": "Which customer ordered the most unique electronic products?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count distinct `product_id`
    * Group by `order.customer_id`
    * Filter where `product.product_type` = 'Electronics'
    * Order by count descending
    * Optionally limit to 1 record
    """,
    },
    # Salesforce Opportunities
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What are the top 5 highest value opportunities we have?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Order by `amount` descending
    * Limit to 5 records
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What are the 10 lowest value opportunities we have?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Order by `amount` ascending
    * Limit to 10 records
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What are the best 5 lead sources by opportunity count?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of opportunity records
    * Group by `lead_source`
    * Order by count descending
    * Limit to 5 records
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What are the worst 5 lead sources by opportunity count?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of opportunity records
    * Group by `lead_source`
    * Order by count ascending
    * Limit to 5 records
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What are the best 5 lead sources by opportunity amount?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Group by `lead_source`
    * Order by sum descending
    * Limit to 5 records
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What are the worst 5 lead sources by opportunity amount?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Group by `lead_source`
    * Order by sum ascending
    * Limit to 5 records
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What types of opportunities have the highest average amount?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Average the `amount` field
    * Group by `type`
    * Order by average descending
    * Optionally it is also acceptable to limit to top N records
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What types of opportunities have the the lowest average amount?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Average the `amount` field
    * Group by `type`
    * Order by average ascending
    * Optionally it is also acceptable to limit to top N records
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What lead sources have most opportunities?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of opportunity records
    * Group by `lead_source`
    * Order by count descending
    * Optionally it is also acceptable to limit to top N records
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What is the opportunity with the highest amount?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Order by `amount` descending
    * Limit to 1 record
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What is the opportunity with the lowest amount?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Order by `amount` ascending
    * Limit to 1 record
    * Not apply any aggregation
    """,
    },
]
