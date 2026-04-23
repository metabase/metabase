"""
Tier 1: Simple Join SQL Generation Tests

This module tests the agent's ability to construct basic SQL queries involving
joins between two tables from raw data sources.
"""

# Test 1: Win Rate Calculation (single table, single row result)
win_rate_calculation = {
    "description": "Win rate for closed Salesforce opportunities",
    "message": "What is the win rate percentage for closed Salesforce opportunities? Only include closed opportunities. Calculate win rate as the percentage of won opportunities out of all closed ones. Return a single value.",
    "table_names": ["salesforce_data.opportunity"],
    "query_description": """
        * The query should use the salesforce_data.opportunity table
        * The query should filter for closed opportunities only (is_closed = true)
        * The query should calculate win rate as a percentage of won opportunities out of all closed opportunities
        * The calculation should be: (count of is_won = true) / (total count of closed) * 100
        * The query should return a single numeric value representing the win rate percentage
    """,
    "reference_query": """
        SELECT
            COUNT(CASE WHEN is_won = true THEN 1 END)::numeric / COUNT(*) * 100 as win_rate_percent
        FROM salesforce_data.opportunity
        WHERE is_closed = true
    """,
}

# Test 2: Average Deal Size by Industry (simple 2-table join)
avg_deal_by_industry = {
    "description": "Average opportunity amount by industry",
    "message": "What is the average opportunity amount by industry? Join opportunity to account tables. Group by industry. Return industry and average amount. Order by industry ascending.",
    "table_names": ["salesforce_data.opportunity", "salesforce_data.account"],
    "query_description": """
        * The query should use salesforce_data.opportunity and salesforce_data.account tables
        * The query should join opportunity to account on account_id
        * The query should aggregate by industry (GROUP BY account.industry)
        * The query should calculate average opportunity amount using AVG(opportunity.amount)
        * The query should order by industry alphabetically (ascending)
        * The query should include industry name and average amount columns
    """,
    "reference_query": """
        SELECT a.industry,
               AVG(o.amount) as avg_amount
        FROM salesforce_data.opportunity o
        JOIN salesforce_data.account a ON o.account_id = a.id
        GROUP BY a.industry
        ORDER BY a.industry ASC
    """,
}

# Test 3: Lead Conversion Status (single table, simple GROUP BY)
lead_conversion_status = {
    "description": "Salesforce lead conversion counts",
    "message": "How many Salesforce leads do we have by conversion status? Group by the is converted field. Return status and lead count. Order by status ascending.",
    "table_names": ["salesforce_data.lead"],
    "query_description": """
        * The query should use the salesforce_data.lead table
        * The query should group by is_converted field
        * The query should count leads in each group using COUNT(*)
        * The query should order by is_converted (ascending, so false comes before true)
        * The query should include the is_converted status and lead count columns
    """,
    "reference_query": """
        SELECT is_converted,
               COUNT(*) as lead_count
        FROM salesforce_data.lead
        GROUP BY is_converted
        ORDER BY is_converted ASC
    """,
}

# Test 4: Opportunities Aging Report (single table, date filter)
opportunities_aging = {
    "description": "Opportunities open for more than 60 days",
    "message": "Which opportunities have been open for more than 60 days? Only include open opportunities where the created date is more than 60 days ago. Return opportunity details. Order by created date ascending, using id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity"],
    "query_description": """
        * The query should use the salesforce_data.opportunity table
        * The query should filter for open opportunities only (is_closed = false)
        * The query should filter for opportunities where created_date is more than 60 days ago
        * The date comparison should use CURRENT_DATE - INTERVAL '60 days' or equivalent
        * The query should order by created_date ascending (oldest first), with id ascending as tiebreaker
        * The query should include opportunity id, name, stage_name, amount, and created_date columns
    """,
    "reference_query": """
        SELECT id,
               name,
               stage_name,
               amount,
               created_date
        FROM salesforce_data.opportunity
        WHERE is_closed = false
          AND created_date < CURRENT_DATE - INTERVAL '60 days'
        ORDER BY created_date ASC, id ASC
    """,
}

# Test 5: Accounts with Multiple Opportunities (2-table join with HAVING)
accounts_with_multiple_opps = {
    "description": "Accounts with more than 2 opportunities",
    "message": "Which accounts have more than 2 opportunities? Join account to opportunity tables. Group by account and only include those with more than 2 opportunities. Return account details and opportunity count. Order by count descending, using account id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity", "salesforce_data.account"],
    "query_description": """
        * The query should use salesforce_data.account and salesforce_data.opportunity tables
        * The query should join account to opportunity on account.id = opportunity.account_id
        * The query should group by account (GROUP BY account.id and/or account.name)
        * The query should filter groups with HAVING COUNT > 2
        * The query should order by opportunity count descending, with account id ascending as tiebreaker
        * The query should include account id, account name, and opportunity count columns
    """,
    "reference_query": """
        SELECT a.id,
               a.name,
               COUNT(o.id) as opportunity_count
        FROM salesforce_data.account a
        JOIN salesforce_data.opportunity o ON a.id = o.account_id
        GROUP BY a.id, a.name
        HAVING COUNT(o.id) > 2
        ORDER BY opportunity_count DESC, a.id ASC
    """,
}

# Test 6: Opportunity Stage History Analysis (single table aggregation)
stage_history_analysis = {
    "description": "Stage change count per opportunity",
    "message": "How many stage changes has each opportunity had? Use the opportunity history table and group by opportunity. Return opportunity id and change count. Order by count descending, using opportunity id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity_history"],
    "query_description": """
        * The query should use the salesforce_data.opportunity_history table
        * The query should group by opportunity_id
        * The query should count rows per opportunity using COUNT(*)
        * The query should order by stage change count descending, with opportunity_id ascending as tiebreaker
        * The query should include opportunity_id and stage change count columns
    """,
    "reference_query": """
        SELECT opportunity_id,
               COUNT(*) as stage_change_count
        FROM salesforce_data.opportunity_history
        GROUP BY opportunity_id
        ORDER BY stage_change_count DESC, opportunity_id ASC
    """,
}

# Test 7: Top Products by Order Count (2-table join with LIMIT)
top_products_by_orders = {
    "description": "Top 14 products by number of orders",
    "message": "What are the top 14 products by number of orders? Join product to order line tables. Count distinct orders per product. Return product details and order count. Order by count descending, using product id ascending as a tiebreaker. Limit to 14.",
    "table_names": ["shopify_data.order_line", "shopify_data.product"],
    "query_description": """
        * The query should use shopify_data.order_line and shopify_data.product tables
        * The query should join product to order_line on product.id = order_line.product_id
        * The query should group by product (GROUP BY product.id and/or product.title)
        * The query should count distinct orders using COUNT(DISTINCT order_id) or equivalent
        * The query should order by order count descending, with product id ascending as tiebreaker
        * The query should limit results to 14 rows
        * The query should include order count, product id, and product title columns
    """,
    "reference_query": """
        SELECT COUNT(DISTINCT ol.order_id) as order_count,
               p.id as product_id,
               p.title as product
        FROM shopify_data.order_line ol
        JOIN shopify_data.product p ON p.id = ol.product_id
        GROUP BY p.id, p.title
        ORDER BY order_count DESC, p.id ASC
        LIMIT 14
    """,
}

# Export test data
TEST_DATA = [
    win_rate_calculation,
    avg_deal_by_industry,
    lead_conversion_status,
    opportunities_aging,
    accounts_with_multiple_opps,
    stage_history_analysis,
    top_products_by_orders,
]
