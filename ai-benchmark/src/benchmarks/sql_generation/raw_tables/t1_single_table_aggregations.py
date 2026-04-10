"""
Tier 1: Single-Table Aggregation SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
basic aggregation queries against single tables:
- COUNT, SUM, AVG aggregations
- GROUP BY with aggregations
- Simple WHERE filters
- Date-based filters
"""

# 1. Total Paid Invoices - Stripe Revenue 2024
test_1 = {
    "description": "Total revenue from paid Stripe invoices this year",
    "message": "What is the total revenue from paid Stripe invoices in 2024? Return the total amount paid.",
    "table_names": ["stripe_data.invoice"],
    "query_description": """
        * The query should use the stripe_data.invoice table
        * The query should filter for paid invoices (paid = true)
        * The query should filter for invoices created in year 2024
        * The query should sum the amount_paid field to calculate total revenue
        """,
    "reference_query": """
        SELECT SUM(amount_paid) as total_revenue
        FROM stripe_data.invoice
        WHERE paid = true
          AND EXTRACT(YEAR FROM created) = 2024
        """,
}

# 2. Active Subscription Count - Stripe
test_2 = {
    "description": "Count of active Stripe subscriptions",
    "message": "How many active Stripe subscriptions are there? Return the total count.",
    "table_names": ["stripe_data.subscription"],
    "query_description": """
        * The query should use the stripe_data.subscription table
        * The query should filter for subscriptions with status = 'active'
        * The query should count the total number of active subscriptions
        """,
    "reference_query": """
        SELECT COUNT(*) as active_subscription_count
        FROM stripe_data.subscription
        WHERE status = 'active'
        """,
}

# 3. Open Opportunities by Stage - Salesforce
test_3 = {
    "description": "Open opportunities count and value by stage",
    "message": "For open opportunities, count them and sum their amounts by stage. Return stage, count, and total value. Order by stage name.",
    "table_names": ["salesforce_data.opportunity"],
    "query_description": """
        * The query should use the salesforce_data.opportunity table
        * The query should filter for open opportunities (is_closed = false)
        * The query should group by stage_name
        * The query should count the number of opportunities per stage
        * The query should sum the amount field to calculate total value per stage
        * The query should order results by stage_name
        """,
    "reference_query": """
        SELECT stage_name,
               COUNT(*) as opportunity_count,
               SUM(amount) as total_value
        FROM salesforce_data.opportunity
        WHERE is_closed = false
        GROUP BY stage_name
        ORDER BY stage_name
        """,
}

# 4. Order Volume by Month - Shopify
test_4 = {
    "description": "Shopify order volume by month",
    "message": "How many Shopify orders have we received each month? Return month and order count. Order by month ascending.",
    "table_names": ["shopify_data.order"],
    "query_description": """
        * The query should use the shopify_data.order table
        * The query should group by month using DATE_TRUNC('month', created_at) or equivalent
        * The query should count the number of orders per month
        * The query should order by month ascending
        """,
    "reference_query": """
        SELECT DATE_TRUNC('month', created_at) as month,
               COUNT(*) as order_count
        FROM shopify_data.order
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month
        """,
}

# 5. Overdue Invoices Report - QuickBooks
test_5 = {
    "description": "Overdue and unpaid QuickBooks invoices",
    "message": "Which QuickBooks invoices are overdue and unpaid? Return all invoice details. Order by id.",
    "table_names": ["quickbooks_data.invoice"],
    "query_description": """
        * The query should use the quickbooks_data.invoice table
        * The query should filter for overdue invoices where due_date < CURRENT_DATE
        * The query should filter for unpaid invoices where balance > 0
        * The query should return all columns from the invoice table
        """,
    "reference_query": """
        SELECT *
        FROM quickbooks_data.invoice
        WHERE due_date < CURRENT_DATE
          AND balance > 0
        ORDER BY id
        """,
}

# 6. LinkedIn Ad Campaign Count - by Status
test_6 = {
    "description": "LinkedIn ad campaigns by status",
    "message": "How many LinkedIn ad campaigns do we have in each status? Return status and campaign count. Order by status.",
    "table_names": ["linkedin_ads_data.campaign"],
    "query_description": """
        * The query should use the linkedin_ads_data.campaign table
        * The query should group by status
        * The query should count the number of campaigns per status
        * The query should order by status ascending
        """,
    "reference_query": """
        SELECT status,
               COUNT(*) as campaign_count
        FROM linkedin_ads_data.campaign
        GROUP BY status
        ORDER BY status
        """,
}

# 7. Average Meeting Duration - Calendly
test_7 = {
    "description": "Average duration of Calendly event types",
    "message": "What is the average duration of Calendly event types? Return the average duration.",
    "table_names": ["calendly_data.event_type"],
    "query_description": """
        * The query should use the calendly_data.event_type table
        * The query should calculate the average of the duration field
        * The query should return a single aggregated value
        """,
    "reference_query": """
        SELECT AVG(duration) as avg_duration
        FROM calendly_data.event_type
        """,
}

# 8. Top Merchants by Transaction Count - Brex
test_8 = {
    "description": "Top merchants by Brex transaction frequency",
    "message": "Which merchants appear most frequently in our Brex transactions? Return merchant name and transaction count. Order by count descending, using merchant name ascending as a tiebreaker.",
    "table_names": ["brex_data.transaction"],
    "query_description": """
        * The query should use the brex_data.transaction table
        * The query should group by merchant_name
        * The query should count the number of transactions per merchant
        * The query should order by transaction count descending
        * The query should include merchant_name as a tiebreaker in the ORDER BY clause (ascending)
        """,
    "reference_query": """
        SELECT merchant_name,
               COUNT(*) as transaction_count
        FROM brex_data.transaction
        GROUP BY merchant_name
        ORDER BY transaction_count DESC, merchant_name ASC
        """,
}

# 9. Unsubscribe Count by Month - Customer.io
test_9 = {
    "description": "Email unsubscribes by month from Customer.io",
    "message": "How many Customer.io email unsubscribes have we had each month? Return month and unsubscribe count. Order by month ascending.",
    "table_names": ["customerio_data.unsubscribes"],
    "query_description": """
        * The query should use the customerio_data.unsubscribes table
        * The query should group by month using DATE_TRUNC('month', timestamp) or equivalent
        * The query should count the number of unsubscribes per month
        * The query should order by month ascending
        """,
    "reference_query": """
        SELECT DATE_TRUNC('month', timestamp) as month,
               COUNT(*) as unsubscribe_count
        FROM customerio_data.unsubscribes
        GROUP BY DATE_TRUNC('month', timestamp)
        ORDER BY month
        """,
}

# 10. Job Postings by State - Lever
test_10 = {
    "description": "Job posting count by state in Lever",
    "message": "How many Lever job postings do we have in each state? Return state and posting count. Order by state.",
    "table_names": ["lever_data.posting"],
    "query_description": """
        * The query should use the lever_data.posting table
        * The query should group by state
        * The query should count the number of postings per state
        * The query should order by state ascending
        """,
    "reference_query": """
        SELECT state,
               COUNT(*) as posting_count
        FROM lever_data.posting
        GROUP BY state
        ORDER BY state
        """,
}

# 11. Google Ads Accounts Listing - All accounts with currencies and timezones
test_11 = {
    "description": "All Google Ads accounts with currencies and timezones",
    "message": "Show all Google Ads accounts with their currencies and timezones. Return id, name, currency, and timezone. Order by name.",
    "table_names": ["google_adwords_data.account"],
    "query_description": """
        * The query should use the google_adwords_data.account table
        * The query should select account information including id, name, currency_code, and time_zone
        * The query should return all accounts (no filtering)
        * The query should order by name ascending
        """,
    "reference_query": """
        SELECT
            id,
            name,
            currency_code,
            time_zone
        FROM google_adwords_data.account
        ORDER BY name
        """,
}

TEST_DATA = [
    test_1,
    test_2,
    test_3,
    test_4,
    test_5,
    test_6,
    test_7,
    test_8,
    test_9,
    test_10,
    test_11,
]
