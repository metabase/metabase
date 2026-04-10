from src.benchmarks.helpers import get_benchmark_table

temporal_filters = [
    # Brex Expenses - Relative dates
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "List all approved expenses from last month",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `status` = 'approved'
    * Filter where `approved_at` is within 2025-01-01 to 2025-01-31 (i.e. any valid filter that captures the date range of
current date/time minus 1 month, date range covering the month prior to current time, or specific month + year filter is acceptable). NOTE: We assume today is 2025-02-15.
    * Not apply any aggregation
    """,
        "current_user_time": "2025-02-15T10:00:00+00:00",
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What amount have we approved in expense claims this year?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `status` = 'approved'
    * Filter where `approved_at` year = 2025 (NOTE: We assume today is 2025-02-15)
    """,
        "current_user_time": "2025-02-15T10:00:00+00:00",
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me approved expense claims from this year?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Not apply any aggregation
    * Filter where `status` = 'approved'
    * Filter where `approved_at` year = 2025 (NOTE: We assume today is 2025-02-15)
    """,
        "current_user_time": "2025-02-15T10:00:00+00:00",
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What's the total of expense claims approved in the last 30 days?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `approved_at` is within the last 30 days from current date (NOTE: We assume today is 2025-02-15). \
Any valid date filter that captures this is acceptable (e.g. >= 2025-01-16 to <= 2025-02-15 - where the upper limit is optional)
    * Optional filter (not required): where `status` = 'approved'
    """,
        "current_user_time": "2025-02-15T10:00:00+00:00",
    },
    # Brex Expenses - Absolute dates
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expenses did we approve in Q4 2024?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Use a valid date range filter to cover Q4 2024 (October 1 to December 31, 2024) on the `approved_at` field
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expense reports were submitted in Januaries",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Filter where `submitted_at` is in the month of January (any year)
    """,
    },
    # Shopify Orders
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "How many online shop orders did we get last week?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Filter where `created_at` is within the last 7 days (NOTE: assume today is 2025-02-15). \
Any valid date filter that captures this is acceptable.
    """,
        "current_user_time": "2025-02-15T10:00:00+00:00",
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "I want to see online shop orders we got last week?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Not apply any aggregation
    * Filter where `created_at` is within the last 7 days (NOTE: assume today is 2025-02-15). \
Any valid date filter that captures this is acceptable.
    """,
        "current_user_time": "2025-02-15T10:00:00+00:00",
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What was our total online shop revenue in Q3 2025?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `total_price` field
    * Use a valid date range filter to cover Q3 2025 (July 1 to September 30, 2025) on the `created_at` field
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What was our highest order price in the online shop in Q3 2025?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Max the `total_price` field
    * Use a valid date range filter to cover Q3 2025 (July 1 to September 30, 2025) on the `created_at` field
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What was the average total price of orders in the online shop in the first quarter of any year?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Avg the `total_price` field
    * Filter the `created_at` field to be in Q1 (January 1 to March 31) of any year
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "Show me all shop orders that got cancelled in the last 30 days",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `cancelled_at` is not null
    * Filter where `cancelled_at` is within the last 30 days (NOTE: assume today is 2025-02-15). \
Any valid date filter that captures this is acceptable.
    * Not apply any aggregation
    """,
        "current_user_time": "2025-02-15T10:00:00+00:00",
    },
    # Shopify Fulfillment
    {
        "table": get_benchmark_table("shopify_data.fulfillment"),
        "question": "Show me all successful deliveries from last month",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `status` = 'success'
    * Filter where `created_at` is in January 2025 (NOTE: assume today is 2025-02-15). \
Any valid date filter that captures this is acceptable.
    * Not apply any aggregation
    """,
        "current_user_time": "2025-02-15T10:00:00+00:00",
    },
    {
        "table": get_benchmark_table("shopify_data.fulfillment"),
        "question": "How many successful deliveries did we have last month",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `status` = 'success'
    * Filter where `created_at` is in January 2025 (NOTE: assume today is 2025-02-15). \
Any valid date filter that captures this is acceptable.
    * Count the number of fulfillment records
    """,
        "current_user_time": "2025-02-15T10:00:00+00:00",
    },
    # Salesforce opportunities
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "How many opportunities did we close in 2023 and 2024?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of opportunity records
    * Filter where `closed_date` is between January 1, 2023 and December 31, 2024 (any valid date range or direct year filter that captures this is acceptable)
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "Show me opportunities opened in the first half of 2024.",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `created_date` is between January 1, 2024 and June 30, 2024 (any valid date range or direct year and month filter that captures this is acceptable)
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What is the average opportunity value for opps opened in the first half of 2024.",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `created_date` is between January 1, 2024 and June 30, 2024 (any valid date range or direct year and month filter that captures this is acceptable)
    * Calculate average of the `amount` field
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What is the highest opportunity value for opps opened in the first half of 2024.",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `created_date` is between January 1, 2024 and June 30, 2024 (any valid date range or direct year and month filter that captures this is acceptable)
    * Calculate max of the `amount` field
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What is the lowest opportunity value for opportunities from Q1 and Q4 of 2024?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `created_date` is in Q1 2024 (January 1 to March 31, 2024) or Q4 2024 (October 1 to December 31, 2024) (any valid date range or direct year and quarter filter that captures this is acceptable)
    * Calculate min of the `amount` field
    """,
    },
    # Lever applications
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "How many applications did we receive from June to December 2024?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where `created_at` is between June 1, 2024 and December 31, 2024 (any valid date range or direct year and month filter that captures this is acceptable)
    """,
    },
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "Show me applications we received in any January between 2023 and 2025.",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where `created_at` is between January 1 and January 31 for any year between 2023 and 2025 (any valid date range or direct year and month filter that captures this is acceptable)
    """,
    },
]
