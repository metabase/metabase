"""
Tier 2: Time Series Analysis

This module tests the agent's ability to work with temporal data in enriched tables.
Test cases focus on:

1. Time grain selection (daily vs. monthly fact tables)
2. Date range filtering (absolute and relative dates)
3. Time bucketing and aggregation (monthly, quarterly, yearly)
4. Temporal pattern recognition

Enriched tables often provide time-series data at multiple grains (e.g., Stripe has
both daily_revenue_fact and monthly_revenue_fact). The agent must select the
appropriate grain based on the query's temporal focus.

Key Difference from Raw Tables: Multiple pre-aggregated time grains available,
eliminating need for DATE_TRUNC in many cases.
"""


# =============================================================================
# TIME GRAIN SELECTION
# =============================================================================

time_grain_selection = [
    # 1. Stripe - Monthly revenue trend (use monthly grain)
    {
        "description": "Monthly recurring revenue trend over time",
        "message": "Calculate monthly MRR trend for active subscriptions. Filter to only active subscriptions (where subscription status is 'active'). Sum the MRR amounts grouped by month. Return the month and total MRR. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_monthly_revenue_fact table
                * The query should filter for active subscriptions (subscription_status = 'active')
                * The query should group by month_start_date
                * The query should aggregate MRR using SUM(mrr_amount)
                * The query should order results by month_start_date ascending
                * The query should include month_start_date and total MRR columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT month_start_date,
                       SUM(mrr_amount) as total_mrr
                FROM stripe_enriched.int_stripe_monthly_revenue_fact
                WHERE subscription_status = 'active'
                GROUP BY month_start_date
                ORDER BY month_start_date
                """,
    },
    # 2. Stripe - Daily revenue for recent period (use daily grain)
    {
        "description": "Daily revenue for last 7 days",
        "message": "Get daily revenue for the last 7 days. Find the most recent date in the data and include the 6 preceding days. Sum net revenue grouped by date to aggregate across currencies. Return the date and total daily revenue. Order by date descending.",
        "table_names": ["stripe_enriched.int_stripe_daily_revenue_fact"],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_daily_revenue_fact table
                * The query should filter for the last 7 days of available data
                * The query should group by revenue_date to aggregate across currencies
                * The query should aggregate daily revenue using SUM(net_revenue) or SUM(gross_revenue)
                * The query should order results by date descending
                * The query should include the date and total daily revenue columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT revenue_date,
                       SUM(net_revenue) as total_daily_revenue
                FROM stripe_enriched.int_stripe_daily_revenue_fact
                WHERE revenue_date >= (
                    SELECT MAX(revenue_date) - INTERVAL '6 days'
                    FROM stripe_enriched.int_stripe_daily_revenue_fact
                )
                GROUP BY revenue_date
                ORDER BY revenue_date DESC
                """,
    },
    # 3. Stripe - Monthly grain for quarterly analysis
    {
        "description": "Quarterly revenue totals using monthly grain",
        "message": "Calculate quarterly revenue totals for 2024. Filter to only year 2024. Group by calendar quarter and sum the MRR amounts. Return the quarter and total revenue. Order by quarter ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_monthly_revenue_fact table
                * The query should filter for year 2024 (month_start_date in 2024)
                * The query should group by quarter using DATE_TRUNC('quarter', month_start_date) or EXTRACT(QUARTER FROM month_start_date)
                * The query should aggregate revenue using SUM(mrr_amount)
                * The query should order results by quarter ascending
                * The query should include the quarter and total revenue columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT DATE_TRUNC('quarter', month_start_date) as quarter,
                       SUM(mrr_amount) as total_revenue
                FROM stripe_enriched.int_stripe_monthly_revenue_fact
                WHERE EXTRACT(YEAR FROM month_start_date) = 2024
                GROUP BY DATE_TRUNC('quarter', month_start_date)
                ORDER BY quarter ASC
                """,
    },
    # 4. Stripe - Daily grain for specific day analysis
    {
        "description": "Revenue spikes on specific days",
        "message": "Find the top 10 days with highest revenue. Sum net revenue grouped by date to aggregate across currencies. Order by total revenue descending, using date ascending as a tiebreaker. Limit to 10 results.",
        "table_names": ["stripe_enriched.int_stripe_daily_revenue_fact"],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_daily_revenue_fact table
                * The query should group by revenue_date to aggregate across currencies
                * The query should aggregate daily revenue using SUM(net_revenue) or SUM(gross_revenue)
                * The query should order results by total revenue descending, with date ascending as tiebreaker
                * The query should limit results to 10 rows
                * The query should include the date and total revenue columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT revenue_date,
                       SUM(net_revenue) as total_daily_revenue
                FROM stripe_enriched.int_stripe_daily_revenue_fact
                GROUP BY revenue_date
                ORDER BY total_daily_revenue DESC, revenue_date ASC
                LIMIT 10
                """,
    },
]

# =============================================================================
# DATE RANGE FILTERING
# =============================================================================

date_range_filtering = [
    # 5. Stripe - MRR for specific month (adjusted from Q4 to December due to data availability)
    {
        "description": "Monthly recurring revenue for December 2024",
        "message": "Calculate total MRR for December 2024 from active subscriptions. Filter to December 2024 (month starting December 1, 2024) and only active subscriptions. Return the sum of MRR amounts as a single total.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_monthly_revenue_fact table
                * The query should filter for December 2024 (month_start_date = '2024-12-01' or month_start_date >= '2024-12-01' AND month_start_date < '2025-01-01')
                * The query should filter for active subscriptions (subscription_status = 'active')
                * The query should aggregate MRR using SUM(mrr_amount)
                * The query should return a single total MRR value
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT SUM(mrr_amount) as total_mrr
                FROM stripe_enriched.int_stripe_monthly_revenue_fact
                WHERE month_start_date >= '2024-12-01'
                  AND month_start_date < '2025-01-01'
                  AND subscription_status = 'active'
                """,
    },
    # 6. Google AdWords - Performance in date range (adjusted to 2025 data availability)
    {
        "description": "Keyword performance metrics for specific date range",
        "message": "Get AdWords performance metrics from October 11, 2025 to November 9, 2025. Filter to dates within that range inclusive. Return total spend (sum of cost), total impressions, and total clicks as a single row.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should filter for dates between October 11, 2025 and November 9, 2025 (performance_date >= '2025-10-11' AND performance_date <= '2025-11-09')
                * The query should aggregate cost using SUM(cost)
                * The query should aggregate impressions using SUM(impressions)
                * The query should aggregate clicks using SUM(clicks)
                * The query should return a single row with three aggregated values
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT SUM(cost) as total_spend,
                       SUM(impressions) as total_impressions,
                       SUM(clicks) as total_clicks
                FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                WHERE performance_date >= '2025-10-11'
                  AND performance_date <= '2025-11-09'
                """,
    },
    # 7. Salesforce - Won opportunities in calendar year 2024
    {
        "description": "Won opportunities in calendar year 2024",
        "message": "Calculate metrics for won opportunities in 2024. Filter to won opportunities (where is_won is true) with close dates in calendar year 2024. Return total won value (sum of amounts) and count of won opportunities as a single row.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should filter for won opportunities (is_won = true)
                * The query should filter for calendar year 2024 (EXTRACT(YEAR FROM close_date) = 2024 or close_year = 2024)
                * The query should aggregate total opportunity value using SUM(opportunity_amount)
                * The query should count won opportunities using COUNT(opportunity_id)
                * The query should return a single row with two aggregated values
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT SUM(opportunity_amount) as total_won_value,
                       COUNT(opportunity_id) as won_count
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                WHERE is_won = true
                  AND EXTRACT(YEAR FROM close_date) = 2024
                """,
    },
    # 8. Shopify - Orders in specific month
    {
        "description": "Order metrics for December 2024",
        "message": "Calculate order metrics for December 2024. Filter to orders created in December 2024 (from December 1, 2024 through the end of the month). Return order count and net revenue as a single row.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_facts table
                * The query should filter for December 2024 (order_created_at >= '2024-12-01' AND order_created_at < '2025-01-01' or order_year = 2024 AND order_month = 12)
                * The query should count orders
                * The query should aggregate revenue using SUM(net_revenue)
                * The query should return a single row with two aggregated values
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT COUNT(*) as order_count,
                       SUM(net_revenue) as total_revenue
                FROM shopify_enriched.int_shopify_order_facts
                WHERE order_created_at >= '2024-12-01'
                  AND order_created_at < '2025-01-01'
                """,
    },
    # 9. Brex - Year-to-date expense totals
    {
        "description": "Year-to-date expense totals",
        "message": "Calculate year-to-date expense totals for 2024. Filter to expenses created in calendar year 2024. Return total expenses (sum of amounts) and transaction count as a single row.",
        "table_names": ["brex_enriched.int_brex_expense_facts"],
        "query_description": """
                * The query should use brex_enriched.int_brex_expense_facts table
                * The query should filter for calendar year 2024 (EXTRACT(YEAR FROM expense_created_date) = 2024 or expense_year = 2024)
                * The query should aggregate total expenses using SUM(expense_amount)
                * The query should count transactions using COUNT(*)
                * The query should return a single row with two aggregated values
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT SUM(expense_amount) as ytd_expenses,
                       COUNT(*) as transaction_count
                FROM brex_enriched.int_brex_expense_facts
                WHERE EXTRACT(YEAR FROM expense_created_date) = 2024
                """,
    },
]

# =============================================================================
# TIME BUCKETING & AGGREGATION
# =============================================================================

time_bucketing_queries = [
    # 10. Google AdWords - Monthly ad spend from daily facts
    {
        "description": "Aggregate daily keyword performance to monthly spend",
        "message": "Calculate monthly AdWords spend and clicks. Aggregate daily data by calendar month. Sum the cost and clicks for each month. Return month, total spend, and total clicks. Order by month ascending.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should group by month using DATE_TRUNC('month', performance_date) or EXTRACT(YEAR/MONTH) combination
                * The query should aggregate daily spend to monthly totals using SUM(cost)
                * The query should aggregate daily clicks to monthly totals using SUM(clicks)
                * The query should order results by month ascending
                * The query should include the month and aggregated spend/clicks columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT DATE_TRUNC('month', performance_date) as month,
                       SUM(cost) as total_spend,
                       SUM(clicks) as total_clicks
                FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                GROUP BY DATE_TRUNC('month', performance_date)
                ORDER BY month
                """,
    },
    # 11. LinkedIn Ads - Quarterly creative performance
    {
        "description": "Aggregate creative performance to quarterly metrics",
        "message": "Calculate quarterly LinkedIn Ads performance. Aggregate daily data by calendar quarter. Sum the cost, impressions, and clicks for each quarter. Return quarter, total cost, total impressions, and total clicks. Order by quarter ascending.",
        "table_names": ["linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts"],
        "query_description": """
                * The query should use linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts table
                * The query should group by quarter using DATE_TRUNC('quarter', performance_date) or EXTRACT(YEAR/QUARTER) combination
                * The query should aggregate daily performance to quarterly totals using SUM(cost), SUM(impressions), and SUM(clicks)
                * The query should order results by quarter ascending
                * The query should include the quarter and aggregated performance metrics columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT DATE_TRUNC('quarter', performance_date) as quarter,
                       SUM(cost) as total_cost,
                       SUM(impressions) as total_impressions,
                       SUM(clicks) as total_clicks
                FROM linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts
                GROUP BY DATE_TRUNC('quarter', performance_date)
                ORDER BY quarter ASC
                """,
    },
    # 12. Salesforce - Quarterly opportunity creation
    {
        "description": "Opportunities created per quarter",
        "message": "Calculate quarterly opportunity creation metrics. Group opportunities by calendar quarter of creation date. Count opportunities and sum amounts for each quarter. Return quarter, opportunities created, and total pipeline value. Order by quarter ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group by quarter using DATE_TRUNC('quarter', created_date) or EXTRACT(YEAR/QUARTER) combination
                * The query should count opportunities using COUNT(opportunity_id)
                * The query should aggregate pipeline value using SUM(opportunity_amount)
                * The query should order results by quarter ascending
                * The query should include the quarter, opportunity count, and total pipeline value columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT DATE_TRUNC('quarter', created_date) as quarter,
                       COUNT(opportunity_id) as opportunities_created,
                       SUM(opportunity_amount) as total_pipeline_value
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                GROUP BY DATE_TRUNC('quarter', created_date)
                ORDER BY quarter ASC
                """,
    },
    # 13. Shopify - Yearly order volume
    {
        "description": "Annual order count and revenue",
        "message": "Calculate annual order metrics. Group orders by calendar year of creation. Count orders and sum total prices for each year. Return year, order count, and total revenue. Order by year ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_facts table
                * The query should group by year using EXTRACT(YEAR FROM order_created_at) or equivalent
                * The query should count orders using COUNT(order_id)
                * The query should aggregate revenue using SUM(total_price)
                * The query should order results by year ascending
                * The query should include the year, order count, and total revenue columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT EXTRACT(YEAR FROM order_created_at) as year,
                       COUNT(order_id) as order_count,
                       SUM(total_price) as total_revenue
                FROM shopify_enriched.int_shopify_order_facts
                GROUP BY EXTRACT(YEAR FROM order_created_at)
                ORDER BY year ASC
                """,
    },
    # 14. Lever - Weekly candidate applications (additional test case)
    {
        "description": "Weekly candidate application counts",
        "message": "Calculate weekly candidate application counts. Group candidates by calendar week of creation. Count candidates for each week. Return week and candidate count. Order by week ascending.",
        "table_names": ["lever_enriched.int_lever_hiring_funnel_facts"],
        "query_description": """
                * The query should use lever_enriched.int_lever_hiring_funnel_facts table
                * The query should group by week using DATE_TRUNC('week', candidate_created_date) or equivalent
                * The query should count candidates using COUNT(*)
                * The query should order results by week ascending
                * The query should include the week and candidate count columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT DATE_TRUNC('week', candidate_created_date) as week,
                       COUNT(*) as candidate_count
                FROM lever_enriched.int_lever_hiring_funnel_facts
                GROUP BY DATE_TRUNC('week', candidate_created_date)
                ORDER BY week ASC
                """,
    },
    # 15. Lever - Quarterly hiring trend
    {
        "description": "Hiring trend by quarter",
        "message": "Calculate quarterly hiring trend. Group candidates by calendar quarter of creation. Count candidates for each quarter. Return quarter and candidate count. Order by quarter ascending.",
        "table_names": ["lever_enriched.int_lever_hiring_funnel_facts"],
        "query_description": """
                * The query should use lever_enriched.int_lever_hiring_funnel_facts table
                * The query should group by quarter using DATE_TRUNC('quarter', candidate_created_date) or EXTRACT(YEAR/QUARTER) combination
                * The query should count candidates using COUNT(*)
                * The query should order results by quarter ascending
                * The query should include the quarter and candidate count columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT DATE_TRUNC('quarter', candidate_created_date) as quarter,
                       COUNT(*) as candidate_count
                FROM lever_enriched.int_lever_hiring_funnel_facts
                GROUP BY DATE_TRUNC('quarter', candidate_created_date)
                ORDER BY quarter ASC
                """,
    },
    # 16. Shopify - Monthly order volume trend
    {
        "description": "Order volume over time",
        "message": "Calculate monthly order volume trend. Group orders by calendar month of creation. Count orders and sum total prices for each month. Return month, order count, and revenue. Order by month ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_facts table
                * The query should group by month using DATE_TRUNC('month', order_created_at) or EXTRACT(YEAR/MONTH) combination
                * The query should count orders using COUNT(order_id)
                * The query should aggregate revenue using SUM(total_price)
                * The query should order results by month ascending
                * The query should include the month, order count, and total revenue columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT DATE_TRUNC('month', order_created_at) as month,
                       COUNT(order_id) as order_count,
                       SUM(total_price) as revenue
                FROM shopify_enriched.int_shopify_order_facts
                GROUP BY DATE_TRUNC('month', order_created_at)
                ORDER BY month ASC
                """,
    },
]

# =============================================================================
# TEMPORAL PATTERNS & TRENDS
# =============================================================================

temporal_patterns = [
    # 17. Salesforce - Pipeline creation trend
    {
        "description": "Pipeline creation trend over time",
        "message": "Calculate monthly pipeline creation trend. Group opportunities by calendar month of creation. Count opportunities and sum amounts for each month. Return month, opportunities created, and pipeline created. Order by month ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group by month using DATE_TRUNC('month', created_date)
                * The query should count opportunities created using COUNT(opportunity_id)
                * The query should aggregate pipeline value created using SUM(opportunity_amount)
                * The query should order results by month ascending
                * The query should include month, opportunity count, and pipeline value columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT DATE_TRUNC('month', created_date) as month,
                       COUNT(opportunity_id) as opps_created,
                       SUM(opportunity_amount) as pipeline_created
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                GROUP BY DATE_TRUNC('month', created_date)
                ORDER BY month
                """,
    },
    # 18. Stripe - Churn trend analysis
    {
        "description": "Monthly churn rate trend",
        "message": "Calculate monthly churn trend. Group churned customers by churn month. Count customers and calculate average lifetime value (total revenue generated) for each month. Return churn month, churned customer count, and average lifetime value. Order by churn month ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_churn_fact table
                * The query should group by churn_month
                * The query should count churned customers using COUNT(customer_id) or COUNT(*)
                * The query should calculate average lifetime value using AVG(total_revenue_generated)
                * The query should order results by churn_month ascending
                * The query should include churn_month, churned customer count, and average LTV columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT churn_month,
                       COUNT(customer_id) as churned_customers,
                       AVG(total_revenue_generated) as avg_ltv
                FROM stripe_enriched.int_stripe_churn_fact
                GROUP BY churn_month
                ORDER BY churn_month
                """,
    },
    # 19. Shopify - December revenue comparison year over year
    {
        "description": "December revenue comparison year over year",
        "message": "Compare December revenue across years. Filter to only December orders (month 12). Group by calendar year. Sum total prices and count orders for each year. Return year, December revenue, and December order count. Order by year ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_facts table
                * The query should filter for December orders (EXTRACT(MONTH FROM order_created_at) = 12)
                * The query should group by year using EXTRACT(YEAR FROM order_created_at)
                * The query should aggregate revenue using SUM(total_price)
                * The query should count December orders using COUNT(order_id)
                * The query should order results by year ascending
                * The query should include year, December revenue, and December order count columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT EXTRACT(YEAR FROM order_created_at) as year,
                       SUM(total_price) as december_revenue,
                       COUNT(order_id) as december_orders
                FROM shopify_enriched.int_shopify_order_facts
                WHERE EXTRACT(MONTH FROM order_created_at) = 12
                GROUP BY EXTRACT(YEAR FROM order_created_at)
                ORDER BY year
                """,
    },
    # 20. Stripe - Q4 MRR comparison year over year
    {
        "description": "Q4 MRR comparison year over year",
        "message": "Compare Q4 MRR across years for active subscriptions. Filter to quarter 4 and only active subscriptions. Group by calendar year. Sum the MRR amounts for each year. Return year and Q4 MRR. Order by year ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_monthly_revenue_fact table
                * The query should filter for Q4 (EXTRACT(QUARTER FROM month_start_date) = 4)
                * The query should filter for active subscriptions (subscription_status = 'active')
                * The query should group by year using EXTRACT(YEAR FROM month_start_date)
                * The query should aggregate MRR using SUM(mrr_amount)
                * The query should order results by year ascending
                * The query should include year and Q4 MRR columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT EXTRACT(YEAR FROM month_start_date) as year,
                       SUM(mrr_amount) as q4_mrr
                FROM stripe_enriched.int_stripe_monthly_revenue_fact
                WHERE EXTRACT(QUARTER FROM month_start_date) = 4
                  AND subscription_status = 'active'
                GROUP BY EXTRACT(YEAR FROM month_start_date)
                ORDER BY year
                """,
    },
    # 21. Salesforce - Quarter-over-quarter pipeline comparison
    {
        "description": "Pipeline value by quarter for year-over-year comparison",
        "message": "Calculate quarterly pipeline for year-over-year comparison. Group by calendar year and calendar quarter of creation date. Sum opportunity amounts and count opportunities for each year-quarter combination. Return year, quarter, pipeline value, and opportunity count. Order by year ascending, then quarter ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group by year using EXTRACT(YEAR FROM created_date)
                * The query should group by quarter using EXTRACT(QUARTER FROM created_date)
                * The query should aggregate pipeline value using SUM(opportunity_amount)
                * The query should count opportunities using COUNT(opportunity_id)
                * The query should order results by year ascending, then quarter ascending
                * The query should include year, quarter, pipeline value, and opportunity count columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT EXTRACT(YEAR FROM created_date) as year,
                       EXTRACT(QUARTER FROM created_date) as quarter,
                       SUM(opportunity_amount) as pipeline_value,
                       COUNT(opportunity_id) as opp_count
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                GROUP BY EXTRACT(YEAR FROM created_date), EXTRACT(QUARTER FROM created_date)
                ORDER BY year, quarter
                """,
    },
]

TEST_DATA = [
    *time_grain_selection,
    *date_range_filtering,
    *time_bucketing_queries,
    *temporal_patterns,
]
