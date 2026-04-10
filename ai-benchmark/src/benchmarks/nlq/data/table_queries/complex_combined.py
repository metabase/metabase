from src.benchmarks.helpers import get_benchmark_table

complex_combined_queries = [
    # Brex Expenses
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What's the total of approved expense claims over $1000?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `status` = 'approved'
    * Filter where `amount` > 1000
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me rejected expenses from the marketing team in the 2nd month of 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `status` = 'rejected'
    * Filter where department `name` = 'Marketing'
    * Filter where year = 2024 and month = 2 on the `submitted_at` field (`created_at` field is also acceptable). \
Other valid date range filters for February 2024 are also acceptable.
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How much in large expense claims over $2000 is still pending approval?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `status` = 'submitted'
    * Filter where `amount` > 2000
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me how much we reimbursed to the sales team for every month in 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `status` = 'reimbursed'
    * Filter where department `name` = 'Sales'
    * Filter where year = 2024 on the `submitted_at` or `created_at` field (other valid date range filters for 2024 are also acceptable)
    * Group by `submitted_at` or `created_at` with monthly granularity
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How much have we reimbursed to sales folks?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where department `name` = 'Sales' and `status` = 'reimbursed' (note the case sensitivity)
    """,
    },
    # Brex Transfer + Account
    {
        "table": get_benchmark_table("brex_data.transfer"),
        "question": "What are the names of the account pairs with the most transfers between them?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of account name pairs
    * Group by `from_account.name` and `to_account.name`
    * Order by transfer count descending
    """,
    },
    # Shopify Fulfillment
    {
        "table": get_benchmark_table("shopify_data.fulfillment"),
        "question": "How many shipments were sent via fedex where the order value was over $500?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of fulfillment records
    * Filter where `tracking_company` = 'FedEx' and related order's `total_price` > 500
    """,
    },
    # Shopify Refunds
    {
        "table": get_benchmark_table("shopify_data.refund"),
        "question": "Show me all refunds due to damaged items in 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `note` = "Item damaged"
    * Filter where `created_at` year = 2024 (other valid date range filters for 2024 are also acceptable)
    * Not apply any aggregation
    """,
    },
    # Lever applications
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "Show me the weekly number of applications for Engineering roles in 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where the posting categories team = 'Engineering'
    * Filter where application `created_at` year = 2024 (other valid date range filters for 2024 are also acceptable)
    * Group by `created_at` with weekly granularity
    """,
    },
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "Show me the monthly number of applications for Sales roles in 2024",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where the posting categories team = 'Sales'
    * Filter where application `created_at` year = 2024 (other valid date range filters for 2024 are also acceptable)
    * Group by `created_at` with monthly granularity
    """,
    },
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "How many applications did we receive for Intern roles in every month of Q1 2024?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where the posting categories commitment = 'Intern'
    * Filter where application `created_at` is within Q1 2024 (other valid date range filters or direct quarter + year filters for Q1 2024 are also acceptable)
    * Group by `created_at` with monthly granularity
    """,
    },
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "How many applications did we receive for Full-time in Abbottmouth in 2024?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where the posting categories commitment = 'Full-time'
    * Filter where the posting location = 'Abbottmouth'
    * Filter where application `created_at` year = 2024 (other valid date range filters for 2024 are also acceptable)
    """,
    },
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "Show me the monthly number of applications in 2023 from folks that are named Alex and applied for an Intern role.",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where applicant `name` contains 'Alex' (lower or upper case does not matter)
    * Filter where the posting categories commitment = 'Intern'
    * Filter where application `created_at` year = 2023 (other valid date range filters for 2023 are also acceptable)
    * Group by `created_at` with monthly granularity
    """,
    },
]
