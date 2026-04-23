from src.benchmarks.helpers import get_benchmark_table

single_numeric_filter = [
    # Brex Expenses
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expense claims are over $500?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Filter where `amount` > 500
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me expense reports between $100 and $1000",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `amount` >= 100 AND `amount` <= 1000
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me expense reports beyond $2000",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `amount` is greater than 2000 (greater than or equal to is also acceptable)
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What's the total value of large expense claims over $2000?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `amount` > 2000
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many low value expenses (under $50) have we received?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Filter where `amount` < 50
    """,
    },
    # Shopify Customers
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "How many customers have spent over $1000 in our store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of customer records
    * Filter where `total_spent` > 1000
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "How many customers have spent less than $1000 in our store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of customer records
    * Filter where `total_spent` < 1000
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "How many customers have spent at least $753 in our store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of customer records
    * Filter where `total_spent` >= 753
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "How many customers have spent at least $753 in our store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of customer records
    * Filter where `total_spent` >= 753
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.customer"),
        "question": "How many whale buyers (spent over 10k) do we have in our store?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of customer records
    * Filter where `total_spent` > 10000
    """,
    },
    # Salesforce opportunities
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "How many sales opportunities are worth more than $50,000?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of opportunity records
    * Filter where `amount` > 50000
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "How many sales opportunities are worth less than $10,000?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of opportunity records
    * Filter where `amount` < 10000
    """,
    },
]

multiple_numeric_filters = [
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "Show me discounted orders with total price between $100 and $500",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `total_price` >= 100 AND `total_price` <= 500 AND `total_discounts` > 0
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "How many discounted orders have a total price between $100 and $500",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `total_price` >= 100 AND `total_price` <= 500 AND `total_discounts` > 0
    * Count the number of order records
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "Show me all orders with a value of at least 10k and a discount greater than $500",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `amount` >= 10000 AND `discount` > 500
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What is the average tax for high value orders (over 5k) that had discounts?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `tax` field
    * Filter where `amount` > 5000 AND `discount` > 0
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What is the minimum tax we saw for orders below 3.5k without discount?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate minimum of the `tax` field
    * Filter where `amount` < 3500 AND `discount` = 0
    """,
    },
    # Shopify product variant
    {
        "table": get_benchmark_table("shopify_data.product_variant"),
        "question": "How many product variants are priced between $20 and $100 and have at least 10 items in stock?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of product variant records
    * Filter where `price` >= 20 AND `price` <= 100 AND `inventory_quantity` >= 10
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.product_variant"),
        "question": "How many product variants with prices over $100 are out of stock?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of product variant records
    * Filter where `price` > 100 AND `inventory_quantity` = 0
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.product_variant"),
        "question": "Show me products with a weight more than 30kg and a price under $500",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `weight` > 30 AND `price` < 500 (is is also acceptable if there is an additional filter for weight unit being 'kg')
    * Not apply any aggregation
    """,
    },
    # Linkedin campaigns
    {
        "table": get_benchmark_table("linkedin_ads_data.campaign"),
        "question": "Show me linkedin campaigns with a daily budget between 100 and 300 with costs per click/view,etc. under $5",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `daily_budget` >= 100 AND `daily_budget` <= 300 AND `cost_per_click` < 5
    * Not apply any aggregation
    """,
    },
]

numeric_filters = [
    *single_numeric_filter,
    *multiple_numeric_filters,
]
