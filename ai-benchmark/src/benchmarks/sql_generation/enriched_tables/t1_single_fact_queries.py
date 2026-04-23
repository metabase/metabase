"""
Tier 1: Single-Fact Analytical Queries

This module tests the agent's ability to query enriched fact tables. Test cases
focus on:

1. Pre-computed metric recognition
2. Filtering on denormalized dimension attributes
3. Using categorical derived fields
4. Basic aggregation patterns on enriched facts
"""

# =============================================================================
# PRE-COMPUTED METRIC SELECTION
# =============================================================================

pre_computed_metric_queries = [
    # 1. Google AdWords - Average CTR
    {
        "description": "Average click-through rate from AdWords performance facts",
        "message": "Calculate average click-through rate across all AdWords keywords. Return a single value.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
            * The query should use the google_adwords_enriched.int_google_adwords_keyword_performance_facts table
            * The query should calculate the average of the click_through_rate column
            * The query should return a single aggregate value (no grouping)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT AVG(click_through_rate) as avg_ctr
            FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
        """,
    },
    # 2. Google AdWords - Average CPC by campaign
    {
        "description": "Average cost per click by campaign from pre-computed metrics",
        "message": "Show me average cost per click for each AdWords campaign. Calculate the average cost per click grouped by campaign name. Order by average CPC descending.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
            * The query should use the google_adwords_enriched.int_google_adwords_keyword_performance_facts table
            * The query should group by campaign_name
            * The query should calculate the average of the cost_per_click column for each campaign
            * The query should order results by average cost per click descending
            * The query should include campaign_name and average cost per click columns
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT campaign_name,
                   AVG(cost_per_click) as avg_cpc
            FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
            GROUP BY campaign_name
            ORDER BY avg_cpc DESC
        """,
    },
    # 3. LinkedIn Ads - CTR by creative
    {
        "description": "Click-through rate by creative from LinkedIn performance facts",
        "message": "What's the average click-through rate for each LinkedIn creative? Calculate the average click-through rate grouped by creative id. Order by average click-through rate descending, using creative id ascending as a tiebreaker.",
        "table_names": ["linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts"],
        "query_description": """
            * The query should use the linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts table
            * The query should group by creative_id
            * The query should calculate the average of the click_through_rate column for each creative
            * The query should order results by average click-through rate descending, with creative_id ascending as tiebreaker
            * The query should include creative_id and average click-through rate columns
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT creative_id,
                   AVG(click_through_rate) as avg_click_through_rate
            FROM linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts
            GROUP BY creative_id
            ORDER BY avg_click_through_rate DESC, creative_id ASC
        """,
    },
    # 4. Shopify - Customers with high AOV
    {
        "description": "Customers with average order value above threshold",
        "message": "Find all Shopify customers with average order value above $100. Filter to customers where average order value exceeds 100. Return customer id, email, first name, last name, and average order value. Order by average order value descending.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
            * The query should use the shopify_enriched.int_shopify_customer_dim table
            * The query should filter where average_order_value > 100
            * The query should order results by average_order_value descending
            * The query should include customer_id, customer identifying information (email, first_name, last_name), and average_order_value columns
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT customer_id,
                   email,
                   first_name,
                   last_name,
                   average_order_value
            FROM shopify_enriched.int_shopify_customer_dim
            WHERE average_order_value > 100
            ORDER BY average_order_value DESC
        """,
    },
    # 5. Google AdWords - Best converting keywords
    {
        "description": "Keywords with highest conversion rates",
        "message": "Show me the top 10 best converting AdWords keywords. Use the pre-computed conversion rate column. Return keyword id, keyword text, and conversion rate. Order by conversion rate descending, using keyword id ascending as a tiebreaker. Limit to 10 results.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
            * The query should use the google_adwords_enriched.int_google_adwords_keyword_performance_facts table
            * The query should use the pre-computed conversion_rate column (not calculate conversions/clicks)
            * The query should order by conversion_rate descending, with keyword_id ascending as tiebreaker
            * The query should limit to 10 rows
            * The query should include keyword_id, keyword_text, and conversion_rate columns
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT keyword_id,
                   keyword_text,
                   conversion_rate
            FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
            ORDER BY conversion_rate DESC, keyword_id ASC
            LIMIT 10
        """,
    },
]

# =============================================================================
# FILTERING ON DENORMALIZED DIMENSIONS
# =============================================================================

denormalized_dimension_filters = [
    # 6. Shopify - Revenue by product type (no product join needed)
    {
        "description": "Total revenue by product type from denormalized order line facts",
        "message": "What's the total revenue for each product type? Sum the line gross amounts grouped by product type. Order by total revenue descending.",
        "table_names": ["shopify_enriched.int_shopify_order_line_facts"],
        "query_description": """
            * The query should use the shopify_enriched.int_shopify_order_line_facts table
            * The query should group by product_type
            * The query should calculate total revenue using either:
              * SUM(line_gross_amount) - preferred since it's pre-computed
              * OR SUM(unit_price * quantity) - acceptable alternative
            * The query should order by total revenue descending
            * The query should include product_type and total revenue columns
            * The query should NOT join to other tables (product_type is denormalized in the fact table)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT product_type,
                   SUM(line_gross_amount) as total_revenue
            FROM shopify_enriched.int_shopify_order_line_facts
            GROUP BY product_type
            ORDER BY total_revenue DESC
        """,
    },
    # 7. Salesforce - Opportunity count and value by account (no account join needed)
    {
        "description": "Opportunity count and value by account from denormalized facts",
        "message": "How many opportunities and what's the total value for each Salesforce account? Count opportunities and sum opportunity amounts grouped by account name. Order by total value descending, using account name ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
            * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
            * The query should group by account_name
            * The query should count opportunities per account (COUNT(*) or COUNT(opportunity_id))
            * The query should calculate total value by summing opportunity_amount
            * The query should order by total value descending, account_name ascending as tiebreaker
            * The query should include account_name, opportunity count, and total value columns
            * The query should NOT join to other tables (account_name is denormalized in the fact table)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT account_name,
                   COUNT(*) as opportunity_count,
                   SUM(opportunity_amount) as total_value
            FROM salesforce_enriched.int_salesforce_opportunity_facts
            GROUP BY account_name
            ORDER BY total_value DESC, account_name ASC
        """,
    },
    # 8. Google AdWords - Spend by campaign (no campaign join needed)
    {
        "description": "Ad spend by campaign from denormalized performance facts",
        "message": "Show me total ad spend for each AdWords campaign. Sum the cost grouped by campaign name. Order by total spend descending.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
            * The query should use the google_adwords_enriched.int_google_adwords_keyword_performance_facts table
            * The query should group by campaign_name
            * The query should calculate total ad spend by summing the cost column
            * The query should order by total spend descending
            * The query should include campaign_name and total spend columns
            * The query should NOT join to other tables (campaign_name is denormalized in the fact table)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT campaign_name,
                   SUM(cost) as total_spend
            FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
            GROUP BY campaign_name
            ORDER BY total_spend DESC
        """,
    },
    # 9. Brex - Expenses by department (no department join needed)
    {
        "description": "Total expenses by department from denormalized expense facts",
        "message": "What are the total expenses for each department? Sum the expense amounts grouped by department name. Order by total expenses descending, using department name ascending as a tiebreaker.",
        "table_names": ["brex_enriched.int_brex_expense_facts"],
        "query_description": """
            * The query should use the brex_enriched.int_brex_expense_facts table
            * The query should group by department_name
            * The query should calculate total expenses by summing the expense_amount column
            * The query should order by total expenses descending, department_name ascending as tiebreaker
            * The query should include department_name and total expenses columns
            * The query should NOT join to other tables (department_name is denormalized in the fact table)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT department_name,
                   SUM(expense_amount) as total_expenses
            FROM brex_enriched.int_brex_expense_facts
            GROUP BY department_name
            ORDER BY total_expenses DESC, department_name ASC
        """,
    },
    # 10. Salesforce - Won opportunities by owner (no user join needed)
    {
        "description": "Won opportunity value by sales rep from denormalized facts",
        "message": "Show me total won opportunity value for each sales rep. Filter to only won opportunities (where is_won is true). Sum opportunity amounts grouped by owner name. Order by total won value descending, using owner name ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
            * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
            * The query should filter where is_won = true
            * The query should group by owner_name
            * The query should calculate total value by summing opportunity_amount
            * The query should order by total value descending, owner_name ascending as tiebreaker
            * The query should include owner_name and total value columns
            * The query should NOT join to other tables (owner_name is denormalized in the fact table)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT owner_name,
                   SUM(opportunity_amount) as total_won_value
            FROM salesforce_enriched.int_salesforce_opportunity_facts
            WHERE is_won = true
            GROUP BY owner_name
            ORDER BY total_won_value DESC, owner_name ASC
        """,
    },
    # 11. Google AdWords - Performance by ad group (no ad_group join needed)
    {
        "description": "Click and impression metrics by ad group",
        "message": "What are the total clicks and impressions for each ad group? Sum clicks and impressions grouped by ad group name. Order by total clicks descending, using ad group name ascending as a tiebreaker.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
            * The query should use the google_adwords_enriched.int_google_adwords_keyword_performance_facts table
            * The query should group by ad_group_name
            * The query should calculate total clicks by summing the clicks column
            * The query should calculate total impressions by summing the impressions column
            * The query should order by total clicks descending, ad_group_name ascending as tiebreaker
            * The query should include ad_group_name, total clicks, and total impressions columns
            * The query should NOT join to other tables (ad_group_name is denormalized in the fact table)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT ad_group_name,
                   SUM(clicks) as total_clicks,
                   SUM(impressions) as total_impressions
            FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
            GROUP BY ad_group_name
            ORDER BY total_clicks DESC, ad_group_name ASC
        """,
    },
]

# =============================================================================
# CATEGORICAL DERIVED FIELDS
# =============================================================================

categorical_derived_field_queries = [
    # 12. Shopify - Loyal customers using pre-computed segment
    {
        "description": "Count of loyal customers using pre-computed segment",
        "message": "How many loyal customers do we have in Shopify?",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
            * The query should use the shopify_enriched.int_shopify_customer_dim table
            * The query should filter where customer_segment = 'Loyal Customer'
            * The query should count the number of customers matching this criteria
            * The query should return a single aggregate value (COUNT(*))
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT COUNT(*) as loyal_customer_count
            FROM shopify_enriched.int_shopify_customer_dim
            WHERE customer_segment = 'Loyal Customer'
        """,
    },
    # 13. Shopify - Total revenue by customer value tier
    {
        "description": "Total revenue by customer value tier",
        "message": "Show me total lifetime value and customer count for each value tier. Sum lifetime values and count customers grouped by value tier. Order by total lifetime value descending.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
            * The query should use the shopify_enriched.int_shopify_customer_dim table
            * The query should group by value_tier
            * The query should calculate total lifetime value by summing the lifetime_value column
            * The query should count customers per tier
            * The query should order by total lifetime value descending
            * The query should include value_tier, total lifetime value, and customer count columns
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT value_tier,
                   SUM(lifetime_value) as total_ltv,
                   COUNT(*) as customer_count
            FROM shopify_enriched.int_shopify_customer_dim
            GROUP BY value_tier
            ORDER BY total_ltv DESC
        """,
    },
    # 14. Salesforce - Large accounts using pre-computed company size
    {
        "description": "Large accounts using pre-computed company size",
        "message": "Find all large Salesforce accounts and show their annual revenue and employee count. Filter to accounts where company size is 'Large'. Return account name, annual revenue, and employee count. Order by annual revenue descending.",
        "table_names": ["salesforce_enriched.int_salesforce_account_dim"],
        "query_description": """
            * The query should use the salesforce_enriched.int_salesforce_account_dim table
            * The query should filter where company_size = 'Large'
            * The query should order by annual_revenue descending
            * The query should include account_name, annual_revenue, and employee_count columns
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT account_name,
                   annual_revenue,
                   employee_count
            FROM salesforce_enriched.int_salesforce_account_dim
            WHERE company_size = 'Large'
            ORDER BY annual_revenue DESC
        """,
    },
    # 15. Salesforce - Opportunity metrics by account segment
    {
        "description": "Opportunity metrics by account segment",
        "message": "What are the won opportunity counts and values for each account segment? Sum won opportunity counts and total won amounts grouped by account segment. Order by total won value descending, using account segment ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_account_dim"],
        "query_description": """
            * The query should use the salesforce_enriched.int_salesforce_account_dim table
            * The query should group by account_segment
            * The query should calculate total won opportunity count using SUM(won_opportunity_count)
            * The query should calculate total won opportunity value using SUM(total_won_amount)
            * The query should order by total won value descending, account_segment ascending as tiebreaker
            * The query should include account_segment, total won count, and total won value columns
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT account_segment,
                   SUM(won_opportunity_count) as total_won_count,
                   SUM(total_won_amount) as total_won_value
            FROM salesforce_enriched.int_salesforce_account_dim
            GROUP BY account_segment
            ORDER BY total_won_value DESC, account_segment ASC
        """,
    },
    # 16. Stripe - Churn metrics by pre-computed churn cohort
    {
        "description": "Churn metrics by pre-computed churn cohort",
        "message": "Analyze Stripe churn metrics by cohort. Count customers, calculate average revenue generated, and average lifetime days grouped by churn cohort. Order by churn cohort ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
            * The query should use the stripe_enriched.int_stripe_churn_fact table
            * The query should group by churn_cohort
            * The query should count churned customers per cohort (COUNT(*))
            * The query should calculate average lifetime value using AVG(total_revenue_generated)
            * The query should calculate average lifetime days using AVG(lifetime_days)
            * The query should order by churn_cohort ascending
            * The query should include churn_cohort, churned customer count, average lifetime value, and average lifetime days columns
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT churn_cohort,
                   COUNT(*) as churned_customer_count,
                   AVG(total_revenue_generated) as avg_ltv,
                   AVG(lifetime_days) as avg_lifetime_days
            FROM stripe_enriched.int_stripe_churn_fact
            GROUP BY churn_cohort
            ORDER BY churn_cohort ASC
        """,
    },
]

# =============================================================================
# BASIC AGGREGATION PATTERNS
# =============================================================================

basic_aggregation_queries = [
    # 17. Stripe - Total MRR
    {
        "description": "Total monthly recurring revenue from Stripe",
        "message": "What's the total MRR from all active Stripe subscriptions?",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
            * The query should use the stripe_enriched.int_stripe_monthly_revenue_fact table
            * The query should filter where subscription_status = 'active'
            * The query should calculate total MRR by summing the mrr_amount column
            * The query should return a single aggregate value (SUM)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT SUM(mrr_amount) as total_mrr
            FROM stripe_enriched.int_stripe_monthly_revenue_fact
            WHERE subscription_status = 'active'
        """,
    },
    # 18. Stripe - Average MRR per customer
    {
        "description": "Average MRR across all active customers",
        "message": "What's the average MRR per active customer?",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
            * The query should use the stripe_enriched.int_stripe_monthly_revenue_fact table
            * The query should filter where subscription_status = 'active'
            * The query should calculate average MRR per customer by averaging the mrr_amount column
            * The query should return a single aggregate value (AVG)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT AVG(mrr_amount) as avg_mrr_per_customer
            FROM stripe_enriched.int_stripe_monthly_revenue_fact
            WHERE subscription_status = 'active'
        """,
    },
    # 19. Google AdWords - Total spend, clicks, and impressions
    {
        "description": "Total spend, clicks, and impressions from AdWords",
        "message": "Show me overall AdWords performance: total spend, clicks, and impressions.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
            * The query should use the google_adwords_enriched.int_google_adwords_keyword_performance_facts table
            * The query should sum the cost column for total spend
            * The query should sum the clicks column for total clicks
            * The query should sum the impressions column for total impressions
            * The query should return a single row with three aggregate values (no grouping)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT SUM(cost) as total_spend,
                   SUM(clicks) as total_clicks,
                   SUM(impressions) as total_impressions
            FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
        """,
    },
    # 20. Shopify - Total order count and revenue
    {
        "description": "Total order count and revenue from Shopify",
        "message": "What's the total number of orders and total revenue in Shopify?",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
            * The query should use the shopify_enriched.int_shopify_order_facts table
            * The query should count all rows to get total number of orders
            * The query should sum the total_price column for total revenue
            * The query should return a single row with two aggregate values (no grouping)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT COUNT(*) as total_orders,
                   SUM(total_price) as total_revenue
            FROM shopify_enriched.int_shopify_order_facts
        """,
    },
    # 21. Lever - Total candidates and interviews
    {
        "description": "Total candidates and interviews from Lever hiring funnel",
        "message": "How many total candidates and interviews have we had in Lever?",
        "table_names": ["lever_enriched.int_lever_hiring_funnel_facts"],
        "query_description": """
            * The query should use the lever_enriched.int_lever_hiring_funnel_facts table
            * The query should count distinct opportunity_id values to get total number of candidates
            * The query should sum the interview_count column for total interviews
            * The query should return a single row with two aggregate values (no grouping)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT COUNT(DISTINCT opportunity_id) as total_candidates,
                   SUM(interview_count) as total_interviews
            FROM lever_enriched.int_lever_hiring_funnel_facts
        """,
    },
    # 22. Customer.io - Email engagement totals
    {
        "description": "Total email deliveries, opens, and clicks from Customer.io",
        "message": "Show me our email performance from Customer.io: total deliveries, opens, and clicks.",
        "table_names": ["customerio_enriched.int_customerio_engagement_facts"],
        "query_description": """
            * The query should use the customerio_enriched.int_customerio_engagement_facts table
            * The query should count all rows to get total deliveries
            * The query should count rows where was_opened is true to get total opens
            * The query should count rows where was_clicked is true to get total clicks
            * The query should return a single row with three aggregate values (no grouping)
            * The query should be of type 'SQL' (not MBQL)
        """,
        "reference_query": """
            SELECT COUNT(*) as total_deliveries,
                   SUM(CASE WHEN was_opened THEN 1 ELSE 0 END) as total_opens,
                   SUM(CASE WHEN was_clicked THEN 1 ELSE 0 END) as total_clicks
            FROM customerio_enriched.int_customerio_engagement_facts
        """,
    },
]

# Export test data and metadata for benchmark creation
TEST_DATA = [
    *pre_computed_metric_queries,
    *denormalized_dimension_filters,
    *categorical_derived_field_queries,
    *basic_aggregation_queries,
]
