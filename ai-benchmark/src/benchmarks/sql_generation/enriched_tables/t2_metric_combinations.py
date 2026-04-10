"""
Tier 2: Metric Combinations

This module tests the agent's ability to derive new metrics by combining
pre-computed metrics from enriched tables.
"""


# =============================================================================
# RATIO CALCULATIONS FROM PRE-COMPUTED METRICS
# =============================================================================

ratio_calculations = [
    # 1. Salesforce - Win rate from account aggregates
    {
        "description": "Win rate calculated from pre-computed opportunity counts",
        "message": "Calculate win rate for each Salesforce account. Filter to accounts with at least one opportunity. Calculate win rate as won opportunities divided by total opportunities. Return account id, account name, won opportunity count, total opportunity count, and win rate. Order by win rate descending, using account id ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_account_dim"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_account_dim table
                * The query should calculate win rate as won_opportunity_count divided by opportunity_count
                * The query should filter to only include accounts with opportunity_count > 0
                * The query should include account identifying information (account_id and/or account_name)
                * The query should order by win_rate descending, with account_id ascending as tiebreaker
                """,
        "reference_query": """
                SELECT
                    account_id,
                    account_name,
                    won_opportunity_count,
                    opportunity_count,
                    CASE
                        WHEN opportunity_count > 0
                        THEN CAST(won_opportunity_count AS DECIMAL) / opportunity_count
                        ELSE 0
                    END as win_rate
                FROM salesforce_enriched.int_salesforce_account_dim
                WHERE opportunity_count > 0
                ORDER BY win_rate DESC, account_id ASC
                """,
    },
    # 2. Shopify - Average order value per customer
    {
        "description": "Average order value from lifetime metrics",
        "message": "Calculate average order value for each Shopify customer. Filter to customers with at least one order. Calculate average order value as lifetime value divided by lifetime orders. Return customer id, email, full name, lifetime value, lifetime orders, and calculated average order value. Order by average order value descending, using customer id ascending as a tiebreaker.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_customer_dim table
                * The query should calculate average order value as lifetime_value divided by lifetime_orders
                * The query should filter to only include customers with lifetime_orders > 0
                * The query should include customer identifying information (customer_id and/or email/full_name)
                * The query should order by calculated average order value descending, with customer_id ascending as tiebreaker
                """,
        "reference_query": """
                SELECT
                    customer_id,
                    email,
                    full_name,
                    lifetime_value,
                    lifetime_orders,
                    CASE
                        WHEN lifetime_orders > 0
                        THEN lifetime_value / lifetime_orders
                        ELSE 0
                    END as actual_average_order_value
                FROM shopify_enriched.int_shopify_customer_dim
                WHERE lifetime_orders > 0
                ORDER BY actual_average_order_value DESC, customer_id ASC
                """,
    },
    # 3. Google AdWords - Conversion rate from performance metrics
    {
        "description": "Conversion rate as ratio of conversions to clicks",
        "message": "Calculate conversion rate for each Google AdWords campaign. Sum conversions and clicks by campaign. Calculate conversion rate as conversions divided by clicks, handling division by zero. Return campaign id, campaign name, total conversions, total clicks, and conversion rate. Order by conversion rate descending, using campaign id ascending as a tiebreaker.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should group by campaign (GROUP BY campaign_id and/or campaign_name)
                * The query should calculate conversion rate as SUM(conversions) / SUM(clicks) or equivalent
                * The query should handle division by zero (either filter WHERE clicks > 0 or use CASE statement)
                * The query should order by conversion_rate descending, with campaign_id ascending as tiebreaker
                """,
        "reference_query": """
                SELECT
                    campaign_id,
                    campaign_name,
                    SUM(conversions) as total_conversions,
                    SUM(clicks) as total_clicks,
                    CASE
                        WHEN SUM(clicks) > 0 THEN SUM(conversions) / SUM(clicks)
                        ELSE 0
                    END as conversion_rate
                FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                GROUP BY campaign_id, campaign_name
                ORDER BY conversion_rate DESC, campaign_id ASC
                """,
    },
    # 4. Salesforce - Pipeline conversion efficiency
    {
        "description": "Ratio of won deals to total opportunities",
        "message": "Calculate the overall win percentage across all Salesforce accounts. Exclude accounts with no opportunities. Sum won opportunities divided by sum of total opportunities, expressed as a percentage. Return a single value.",
        "table_names": ["salesforce_enriched.int_salesforce_account_dim"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_account_dim table
                * The query should calculate overall win percentage as (sum of won_opportunity_count / sum of opportunity_count) * 100
                * The query should aggregate across all accounts (no GROUP BY)
                * The query should handle division by zero (either filter WHERE opportunity_count > 0 or use CASE statement)
                * The query should return a single row with the win percentage
                """,
        "reference_query": """
                SELECT
                    SUM(won_opportunity_count)::DECIMAL / SUM(opportunity_count) * 100 as win_percentage
                FROM salesforce_enriched.int_salesforce_account_dim
                WHERE opportunity_count > 0
                """,
    },
]

# =============================================================================
# PERCENTAGE CALCULATIONS
# =============================================================================

percentage_calculations = [
    # 5. Shopify - Customer segment distribution
    {
        "description": "Percentage of customers in each segment",
        "message": "Calculate the distribution of Shopify customers across segments. Count customers in each segment and calculate the percentage of total customers. Return customer segment, customer count, and percentage. Order by percentage descending, using customer segment ascending as a tiebreaker.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_customer_dim table
                * The query should group by customer_segment
                * The query should calculate the count of customers in each segment
                * The query should calculate the percentage using: (count in segment / total count) * 100
                * The query should include customer_segment, customer_count, and percentage columns
                * The query should order by percentage descending, with customer_segment ascending as tiebreaker
                """,
        "reference_query": """
                SELECT
                    customer_segment,
                    COUNT(*) as customer_count,
                    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
                FROM shopify_enriched.int_shopify_customer_dim
                GROUP BY customer_segment
                ORDER BY percentage DESC, customer_segment ASC
                """,
    },
    # 6. Stripe - Churn rate calculation
    {
        "description": "Overall churn rate as percentage",
        "message": "Calculate the overall churn rate percentage for Stripe customers. Count churned customers from the churn fact table divided by total customers from the customers dimension table, expressed as a percentage. Return a single value.",
        "table_names": [
            "stripe_enriched.int_stripe_churn_fact",
            "stripe_enriched.int_stripe_customers_dim",
        ],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_churn_fact to count churned customers
                * The query should use stripe_enriched.int_stripe_customers_dim to get total customer count
                * The query should calculate churn rate as: (churned count / total customers) * 100
                * The query should return a single row with the churn rate percentage
                """,
        "reference_query": """
                SELECT
                    ROUND(
                        (SELECT COUNT(*) FROM stripe_enriched.int_stripe_churn_fact)::NUMERIC * 100.0 /
                        (SELECT COUNT(*) FROM stripe_enriched.int_stripe_customers_dim),
                        2
                    ) as churn_rate_percentage
                """,
    },
    # 7. Salesforce - Opportunity stage distribution
    {
        "description": "Percentage of opportunities in each stage",
        "message": "Calculate the distribution of Salesforce opportunities across stages. Count opportunities in each stage and calculate the percentage of total opportunities. Return stage name, opportunity count, and percentage. Order by percentage descending, using stage name ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group by stage_name
                * The query should calculate the count of opportunities in each stage
                * The query should calculate the percentage using: (count in stage / total count) * 100
                * The query should include stage_name, opportunity_count, and percentage columns
                * The query should order by percentage descending, with stage_name ascending as tiebreaker
                """,
        "reference_query": """
                SELECT
                    stage_name,
                    COUNT(*) as opportunity_count,
                    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                GROUP BY stage_name
                ORDER BY percentage DESC, stage_name ASC
                """,
    },
    # 8. Shopify - Value tier distribution
    {
        "description": "Percentage of customers by value tier",
        "message": "Calculate the distribution of Shopify customers across value tiers. Count customers in each tier and calculate the percentage of total customers. Return value tier, customer count, and percentage. Order by percentage descending, using value tier ascending as a tiebreaker.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_customer_dim table
                * The query should group by value_tier
                * The query should calculate the count of customers in each tier
                * The query should calculate the percentage using: (count in tier / total count) * 100
                * The query should include value_tier, customer_count, and percentage columns
                * The query should order by percentage descending, with value_tier ascending as tiebreaker
                """,
        "reference_query": """
                SELECT
                    value_tier,
                    COUNT(*) as customer_count,
                    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
                FROM shopify_enriched.int_shopify_customer_dim
                GROUP BY value_tier
                ORDER BY percentage DESC, value_tier ASC
                """,
    },
]

# =============================================================================
# COMPARATIVE METRICS
# =============================================================================

comparative_metric_queries = [
    # 9. Google AdWords - Campaign efficiency comparison
    {
        "description": "Cost per conversion across campaigns",
        "message": "Calculate cost per conversion for each Google AdWords campaign. Sum cost and conversions by campaign. Calculate cost per conversion as total cost divided by total conversions, excluding campaigns with zero conversions. Return campaign id, campaign name, total cost, total conversions, and cost per conversion. Order by cost per conversion ascending (most efficient first), using campaign id ascending as a tiebreaker.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should group by campaign (GROUP BY campaign_id and/or campaign_name)
                * The query should calculate cost per conversion as SUM(cost) / SUM(conversions) or equivalent
                * The query should filter to only include campaigns with conversions > 0 (using WHERE or HAVING)
                * The query should order by cost_per_conversion ascending (most efficient first), with campaign_id ascending as tiebreaker
                * The query should include campaign identifying information and the calculated cost per conversion metric
                """,
        "reference_query": """
                SELECT
                    campaign_id,
                    campaign_name,
                    SUM(cost) as total_cost,
                    SUM(conversions) as total_conversions,
                    CASE
                        WHEN SUM(conversions) > 0 THEN SUM(cost) / SUM(conversions)
                        ELSE NULL
                    END as cost_per_conversion
                FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                GROUP BY campaign_id, campaign_name
                HAVING SUM(conversions) > 0
                ORDER BY cost_per_conversion ASC, campaign_id ASC
                """,
    },
    # 10. LinkedIn Ads - Creative performance comparison
    {
        "description": "CTR comparison across ad creatives",
        "message": "Calculate click-through rate for each LinkedIn ad creative. Sum clicks and impressions by creative. Calculate CTR as clicks divided by impressions, expressed as a percentage, handling division by zero. Return creative id, campaign name, total clicks, total impressions, and CTR percentage. Order by CTR descending, using creative id ascending as a tiebreaker.",
        "table_names": ["linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts"],
        "query_description": """
                * The query should use linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts table
                * The query should group by creative (GROUP BY creative_id)
                * The query should calculate click-through rate as (SUM(clicks) / SUM(impressions)) or use pre-computed click_through_rate
                * The query should handle division by zero (either filter WHERE impressions > 0 or use CASE statement)
                * The query should order by CTR descending (top performers first), with creative_id ascending as tiebreaker
                * The query should include creative identifying information and the CTR metric
                """,
        "reference_query": """
                SELECT
                    creative_id,
                    campaign_name,
                    SUM(clicks) as total_clicks,
                    SUM(impressions) as total_impressions,
                    CASE
                        WHEN SUM(impressions) > 0 THEN (SUM(clicks)::DECIMAL / SUM(impressions)) * 100
                        ELSE 0
                    END as ctr_percentage
                FROM linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts
                GROUP BY creative_id, campaign_name
                ORDER BY ctr_percentage DESC, creative_id ASC
                """,
    },
    # 11. Salesforce - Sales rep win rate comparison
    {
        "description": "Win rates by sales rep",
        "message": "Calculate win rate for each sales rep. Exclude opportunities with null owner names. Count total opportunities and won opportunities (where is_won is true) by owner. Calculate win rate as a percentage. Return owner id, owner name, total opportunities, won opportunities, and win rate percentage. Order by win rate descending, using owner id ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group by sales rep (GROUP BY owner_id and/or owner_name)
                * The query should calculate win rate as (count of won opportunities / count of total opportunities) * 100
                * The query should use is_won = true to identify won opportunities
                * The query should filter to only include reps with at least one opportunity (using WHERE or HAVING)
                * The query should order by win_rate descending (highest first), with owner_id ascending as tiebreaker
                * The query should include owner identifying information and the calculated win rate metric
                """,
        "reference_query": """
                SELECT
                    owner_id,
                    owner_name,
                    COUNT(*) as total_opportunities,
                    SUM(CASE WHEN is_won = true THEN 1 ELSE 0 END) as won_opportunities,
                    ROUND(
                        CASE
                            WHEN COUNT(*) > 0
                            THEN SUM(CASE WHEN is_won = true THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100
                            ELSE 0
                        END,
                        2
                    ) as win_rate_percentage
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                WHERE owner_name IS NOT NULL
                GROUP BY owner_id, owner_name
                ORDER BY win_rate_percentage DESC, owner_id ASC
                """,
    },
    # 12. Shopify - Product category discount rate comparison
    {
        "description": "Average discount rate by product type",
        "message": "Calculate average discount rate for each Shopify product type. Exclude lines with null product types. Use a weighted average approach: divide total discount amount (sum of line_gross_amount - line_net_amount) by total gross amount (sum of line_gross_amount), expressed as a percentage. Handle division by zero. Return product type, line count, and average discount percentage. Order by discount percentage descending, using product type ascending as a tiebreaker.",
        "table_names": ["shopify_enriched.int_shopify_order_line_facts"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_line_facts table
                * The query should group by product_type
                * The query should calculate weighted average discount rate using SUM(line_gross_amount - line_net_amount) / SUM(line_gross_amount) or equivalently AVG(discount) / AVG(gross)
                * The query should handle division by zero (use NULLIF or CASE statement)
                * The query should filter to only include rows with product_type IS NOT NULL
                * The query should order by discount_rate descending (highest first), with product_type ascending as tiebreaker
                * The query should include product_type and the calculated average discount rate metric
                """,
        "reference_query": """
                SELECT
                    product_type,
                    COUNT(*) as line_count,
                    ROUND(
                        SUM(line_gross_amount - line_net_amount) /
                        NULLIF(SUM(line_gross_amount), 0) * 100,
                        2
                    ) as avg_discount_percentage
                FROM shopify_enriched.int_shopify_order_line_facts
                WHERE product_type IS NOT NULL
                GROUP BY product_type
                ORDER BY avg_discount_percentage DESC, product_type ASC
                """,
    },
]

# =============================================================================
# CONDITIONAL AGGREGATION METRICS
# =============================================================================

conditional_aggregation_metrics = [
    # 13. Salesforce - Open vs. closed opportunities
    {
        "description": "Count of opportunities by open/closed status",
        "message": "Count Salesforce opportunities by open versus closed status. Group by whether the opportunity is closed and count opportunities in each group. Return status label (open or closed) and opportunity count. Order by status ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group by is_closed status (or create labels like 'open' and 'closed')
                * The query should count opportunities in each group
                * The query should show counts for both open (is_closed = false) and closed (is_closed = true) opportunities
                * The query should order by status ascending (closed before open, or alphabetically if using labels)
                """,
        "reference_query": """
                SELECT
                    CASE
                        WHEN is_closed = true THEN 'closed'
                        ELSE 'open'
                    END as status,
                    COUNT(*) as opportunity_count
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                GROUP BY is_closed
                ORDER BY status ASC
                """,
    },
    # 14. Shopify - Revenue from new vs. returning customers
    {
        "description": "Revenue segmented by customer type",
        "message": "Calculate Shopify revenue from new customers versus returning customers. Classify each order as 'new' (first order for that customer) or 'returning' (subsequent orders) based on order sequence. Count orders and sum revenue for each customer type. Return customer type, order count, and total revenue. Order by customer type ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_facts table
                * The query should determine if each order is a new customer order (first order) or returning customer order (subsequent orders)
                * This requires using a window function like ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_created_at) or similar logic
                * The query should group by customer type (new vs returning)
                * The query should sum net_revenue or total_price for each customer type
                * The query should order by customer type ascending (new before returning)
                """,
        "reference_query": """
                WITH orders_with_rank AS (
                    SELECT
                        order_id,
                        customer_id,
                        net_revenue,
                        ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_created_at) as order_rank
                    FROM shopify_enriched.int_shopify_order_facts
                )
                SELECT
                    CASE
                        WHEN order_rank = 1 THEN 'new'
                        ELSE 'returning'
                    END as customer_type,
                    COUNT(*) as order_count,
                    SUM(net_revenue) as total_revenue
                FROM orders_with_rank
                GROUP BY customer_type
                ORDER BY customer_type ASC
                """,
    },
    # 15. Stripe - Active vs. trialing subscription MRR
    {
        "description": "MRR by subscription status",
        "message": "Calculate Stripe monthly recurring revenue by subscription status. Sum MRR amounts grouped by subscription status. Return subscription status and total MRR. Order by subscription status ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_monthly_revenue_fact table
                * The query should group by subscription_status
                * The query should sum mrr_amount for each subscription status
                * The query should show totals for both active and trialing subscription statuses
                * The query should order by subscription_status ascending
                """,
        "reference_query": """
                SELECT
                    subscription_status,
                    SUM(mrr_amount) as total_mrr
                FROM stripe_enriched.int_stripe_monthly_revenue_fact
                GROUP BY subscription_status
                ORDER BY subscription_status ASC
                """,
    },
    # 16. Salesforce - Won vs. lost opportunity value
    {
        "description": "Total value of won versus lost deals",
        "message": "Calculate total value of won versus lost Salesforce opportunities. Classify opportunities as 'won' (where is_won is true) or 'lost' (where closed but not won). Count opportunities and sum amounts for each status. Return status, count, and total value. Order by status ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should categorize opportunities into won and lost groups
                * Won opportunities are identified by is_won = true
                * Lost opportunities are identified by is_closed = true AND is_won = false
                * The query should sum opportunity_amount for each category
                * The query should group by opportunity status (won vs lost)
                * The query should order by opportunity status ascending
                """,
        "reference_query": """
                SELECT
                    CASE
                        WHEN is_won = true THEN 'won'
                        WHEN is_closed = true AND is_won = false THEN 'lost'
                    END as opportunity_status,
                    COUNT(*) as opportunity_count,
                    SUM(opportunity_amount) as total_value
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                WHERE is_won = true OR (is_closed = true AND is_won = false)
                GROUP BY opportunity_status
                ORDER BY opportunity_status ASC
                """,
    },
]

# =============================================================================
# EFFICIENCY METRICS
# =============================================================================

efficiency_metrics = [
    # 17. Google AdWords - Cost per click
    {
        "description": "Average cost per click across all keywords",
        "message": "Calculate the overall cost per click across all Google AdWords keywords. Sum total cost and total clicks, then divide cost by clicks. Exclude keywords with no clicks. Return a single value.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should calculate overall cost per click across all campaigns
                * The query should calculate cost per click as SUM(cost) / SUM(clicks) or use AVG(cost_per_click)
                * The query should filter to only include rows with clicks > 0 (to avoid division by zero)
                * The query should return a single row with the overall cost per click metric
                * The query should aggregate across all keywords, ad groups, and campaigns (no GROUP BY)
                """,
        "reference_query": """
                SELECT
                    SUM(cost)::DECIMAL / NULLIF(SUM(clicks), 0) as overall_cost_per_click
                FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                WHERE clicks > 0
                """,
    },
    # 18. Salesforce - Deal velocity
    {
        "description": "Average deal size per day in sales cycle",
        "message": "Calculate deal velocity as average opportunity value per day in sales cycle. Calculate average opportunity amount divided by average sales cycle days. Exclude opportunities with zero days or zero value. Return a single value.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should calculate deal velocity as AVG(opportunity_amount) / AVG(sales_cycle_days)
                * The query should filter to only include opportunities with sales_cycle_days > 0 and opportunity_amount > 0
                * The query should return a single row with the deal velocity metric
                * The query should aggregate across all opportunities (no GROUP BY)
                """,
        "reference_query": """
                SELECT
                    AVG(opportunity_amount) / NULLIF(AVG(sales_cycle_days), 0) as deal_velocity
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                WHERE sales_cycle_days > 0 AND opportunity_amount > 0
                """,
    },
    # 19. LinkedIn Ads - Cost per engagement
    {
        "description": "Cost per click for LinkedIn campaigns",
        "message": "Calculate cost per click for each LinkedIn campaign. Sum cost and clicks by campaign. Calculate cost per click as total cost divided by total clicks, excluding campaigns with zero clicks. Return campaign id, campaign name, total cost, total clicks, and cost per click. Order by cost per click descending, using campaign id ascending as a tiebreaker.",
        "table_names": ["linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts"],
        "query_description": """
                * The query should use linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts table
                * The query should group by campaign (GROUP BY campaign_id and/or campaign_name)
                * The query should calculate cost per click as SUM(cost) / SUM(clicks) or use AVG(cost_per_click)
                * The query should filter to only include campaigns with clicks > 0 (using WHERE or HAVING)
                * The query should order by cost_per_click descending (highest cost first), with campaign_id ascending as tiebreaker
                * The query should include campaign identifying information and the calculated cost per click metric
                """,
        "reference_query": """
                SELECT
                    campaign_id,
                    campaign_name,
                    SUM(cost) as total_cost,
                    SUM(clicks) as total_clicks,
                    CASE
                        WHEN SUM(clicks) > 0 THEN SUM(cost) / SUM(clicks)
                        ELSE 0
                    END as cost_per_click
                FROM linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts
                GROUP BY campaign_id, campaign_name
                HAVING SUM(clicks) > 0
                ORDER BY cost_per_click DESC, campaign_id ASC
                """,
    },
    # 20. Shopify - Revenue per order
    {
        "description": "Average revenue per order",
        "message": "Calculate the average revenue per order for Shopify. Calculate the average of net revenue across all orders. Exclude orders with null revenue. Return a single value.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_facts table
                * The query should calculate average revenue per order using AVG(net_revenue) or AVG(total_price)
                * The query should return a single row with the average revenue metric
                * The query should aggregate across all orders (no GROUP BY)
                * The query may optionally filter to exclude cancelled orders or null revenue values
                """,
        "reference_query": """
                SELECT
                    AVG(net_revenue) as avg_revenue_per_order
                FROM shopify_enriched.int_shopify_order_facts
                WHERE net_revenue IS NOT NULL
                """,
    },
]

TEST_DATA = [
    *ratio_calculations,
    *percentage_calculations,
    *comparative_metric_queries,
    *conditional_aggregation_metrics,
    *efficiency_metrics,
]
