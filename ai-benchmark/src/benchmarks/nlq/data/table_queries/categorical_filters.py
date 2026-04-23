from src.benchmarks.helpers import get_benchmark_table

single_categorical_filter = [
    # Brex Expenses - Status filtering
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expense reports are waiting for approval?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Filter where `status` = 'submitted'
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me all rejected expense claims",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `status` = 'rejected'
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What's the total amount of reimbursed expense claims?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where `status` = 'reimbursed'
    """,
    },
    # Brex Expenses + Department
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me all expense claims from the marketing team",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where department `name` = 'Marketing'
    * Not apply any aggregation
    """,
    },
    # Brex Expenses + Transaction
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How much did we expense for traveling?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `amount` field
    * Filter where transaction `category` = 'Travel'
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expense reports are for software purchases?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * Filter where transaction `category` = 'Software'
    """,
    },
    # Shopify Orders + Customer
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "How many orders were placed by customers with a gmail email address?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Filter where `email` contains 'gmail' (gmail.com or any other gmail domain is acceptable)
    """,
    },
    # Shopify Orders - Payment status
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "How many orders have been fully paid?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Filter where `financial_status` = 'paid'
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What's the amount from pending payment orders in the shop?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `total_price` field
    * Filter where `financial_status` = 'pending'
    """,
    },
    # Shopify Orders - Fulfillment status
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "How many orders are waiting to be shipped?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of order records
    * Filter where `fulfillment_status` = 'unfulfilled' (it is also acceptable to include 'partial' status but not required)
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "What's our total revenue from successfully fulfilled orders?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Sum the `total_price` field
    * Filter where `fulfillment_status` = 'fulfilled'
    """,
    },
    # Shopify Products - Product type
    {
        "table": get_benchmark_table("shopify_data.product"),
        "question": "How many electronic products do we offer online?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of product records
    * Filter where `product_type` = 'Electronics' and `status` = 'active'
    """,
    },
    {
        "table": get_benchmark_table("shopify_data.product"),
        "question": "Show me all draft products that haven't been published yet",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `status` = 'draft' (an additional filter for `published_at` being null is also acceptable)
    * Not apply any aggregation
    """,
    },
    # Shopify Fulfillment - Shipping status
    {
        "table": get_benchmark_table("shopify_data.fulfillment"),
        "question": "How many shipments are currently pending?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of fulfillment records
    * Filter where `status` = 'pending'
    """,
    },
    # Lever applications
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "How many applications came in via a referral?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where `type` = 'referral' (alternatively, filtering where the opportunity source is 'referral' is also acceptable)
    """,
    },
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "How many internal applications have we received?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of application records
    * Filter where `type` = 'internal'
    """,
    },
    {
        "table": get_benchmark_table("lever_data.application"),
        "question": "For how many job postings did we receive internal applications?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of distinct `posting_id`s
    * Filter where `type` = 'internal'
    """,
    },
    {
        "table": get_benchmark_table("lever_data.offer"),
        "question": "How many offers got declined by candidates?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of offer records
    * Filter where `status` = 'declined'
    """,
    },
    {
        "table": get_benchmark_table("lever_data.offer"),
        "question": "How many offers are waiting for candidate response?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of offer records
    * There are multiple ways of filtering this correctly. The following are acceptable:
       - Filter where `status` = 'pending'
       - Filter where `status` = 'sent'
       - Filter where `status` in ('pending', 'sent')
       - Filter where `status` NOT IN ('accepted', 'declined')
    """,
    },
]

multiple_categorical_filters = [
    # Brex Expenses
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show already checked expense reports that need reimbursement or are already reimbursed",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `status` IN ('approved', 'reimbursed')
    * Not apply any aggregation
    """,
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "What's the average expense amount for the sales and operations teams?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `amount` field
    * Filter where department `name` IN ('Sales', 'Operations')
    """,
    },
    # Shopify Orders
    {
        "table": get_benchmark_table("shopify_data.order"),
        "question": "Show me all orders that were refunded or partially refunded",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `financial_status` IN ('refunded', 'partially_refunded')
    * Not apply any aggregation
    """,
    },
    # Salesforce opportunities
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What is the average value of customer upgrade opportunities that where sourced from trade shows?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `amount` field
    * Filter where `type` = 'Existing Customer - Upgrade' AND `lead_source` = 'Trade Show'
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "What is the average value of won opportunities that were sourced from either phone calls or a name list we purchased?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `amount` field
    * Filter where `stage_name` = 'Closed Won' AND `lead_source` is either 'Phone Inquiry' or 'Purchased List'. An additional filter for is_won = true is also acceptable.
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.opportunity"),
        "question": "How many accounts from the energy sector have opportunities in the negotiation phase",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number distinct accounts
    * Filter where account `industry` = 'Energy' AND `stage_name` = 'Negotiation/Review'""",
    },
    # Salesforce accounts
    {
        "table": get_benchmark_table("salesforce_data.account"),
        "question": "What is the average annual revenue from our prospect accounts from the tech sector?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `annual_revenue` field
    * Filter where `type` = 'Prospect' AND `industry` = 'Technology'
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.account"),
        "question": "What is the biggest annual revenue from our prospect accounts from the tech sector?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate max of the `annual_revenue` field
    * Filter where `type` = 'Prospect' AND `industry` = 'Technology'
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.account"),
        "question": "What is the smallest annual revenue from our prospect accounts from the tech sector?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate min of the `annual_revenue` field
    * Filter where `type` = 'Prospect' AND `industry` = 'Technology'
    """,
    },
    {
        "table": get_benchmark_table("salesforce_data.account"),
        "question": "What is the average employee size of our partner accounts in the healthcare and finance sectors?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Calculate average of the `number_of_employees` field
    * Filter where `type` = 'Partner' AND `industry` being 'Healthcare' or 'Financial Services'
    """,
    },
    # Stripe Subscriptions
    {
        "table": get_benchmark_table("stripe_data.subscription"),
        "question": "How many active subscriptions do we have from customers with gmail addresses?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of subscription records
    * Filter where `status` = 'active' AND  customer email contains 'gmail' (any other valid filter for gmail addresses is also acceptable)
    """,
    },
    # CustomerIO Bounces
    {
        "table": get_benchmark_table("customerio_data.bounces"),
        "question": "How many hard bouces did we have for marketing mails that had 'friend' in the subject line?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of bounce records
    * Filter where `type` = 'hard' AND delivery `subject` containing 'friend'
    """,
    },
    {
        "table": get_benchmark_table("customerio_data.bounces"),
        "question": "How many soft bouces did we have for marketing mails that talked about 'cost' in the subject line?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of bounce records
    * Filter where `type` = 'soft' AND delivery `subject` containing 'cost'
    """,
    },
]


categorical_filters_where_filter_value_does_not_exist_in_samples = [
    # Test cases where the agent won't see the filter value in the field sample data.
    # It needs to come up with a best guess based on the other sample values and the field statistics.
    # However, it should tell the user about that assumption
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expense reports are for team event purchases?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * A reasonable filter on the `category` that tries to filter for team events
    """,
        "response_expectation": 'The agent should acknowledge that the search term ("team event" or similar) was not found in the sample data, or explain that it is using a best guess based on available samples. It should mention that results might be affected if terminology differs. This disclosure must appear in the final response.',
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expense reports are for personal learning purchases?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * A reasonable filter on the `category` that tries to filter for personal learning
    """,
        "response_expectation": 'The agent should acknowledge that the search term ("personal learning" or similar) was not found in the sample data, or explain that it is using a best guess based on available samples. It should mention that results might be affected if terminology differs. This disclosure must appear in the final response.',
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "How many expense reports are for personal health purchases?",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Count the number of expense records
    * A reasonable filter on the `category` that tries to filter for personal health
    """,
        "response_expectation": 'The agent should acknowledge that the search term ("personal health" or similar) was not found in the sample data, or explain that it is using a best guess based on available samples. It should mention that results might be affected if terminology differs. This disclosure must appear in the final response.',
    },
    {
        "table": get_benchmark_table("brex_data.expense"),
        "question": "Show me all expense claims with euro currency",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Filter where `currency` = 'EUR' (or any reasonable assumption for Euro currency)
    * Not apply any aggregation
    """,
        "response_expectation": 'The agent should acknowledge if the currency code ("EUR") was not found in the sample data, or explain the pattern used (ISO currency codes). For widely-known standards like ISO currency codes, minimal or no disclosure is acceptable if the pattern is obvious from samples.',
    },
    {
        "table": get_benchmark_table("lever_data.posting"),
        "question": "Show me job postings from the HR department",
        "expected_query": """The query should be of type 'MBQL' and should:
    * Not apply any aggregation
    * A reasonable filter on the `categories_department` that tries to filter for HR department (can also use Operations or some other related department)
    """,
        "response_expectation": 'The agent should acknowledge if the department value ("HR" or similar) was not found in the sample data, or explain that it is using a best guess based on available samples. It should state what value it will use. This disclosure must appear in the final response.',
    },
]


categorical_filters = [
    *single_categorical_filter,
    *multiple_categorical_filters,
    *categorical_filters_where_filter_value_does_not_exist_in_samples,
]
