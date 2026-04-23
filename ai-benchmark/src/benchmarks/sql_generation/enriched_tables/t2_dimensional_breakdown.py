"""
Tier 2: Dimensional Breakdown Analysis

This module tests the agent's ability to perform dimensional analysis by joining
fact tables to dimension tables and grouping results by dimensional attributes.

While enriched fact tables often have denormalized dimensions, there are scenarios
where fact-dimension joins are necessary:
- Dimension has attributes not denormalized into facts
- Multiple facts share a common dimension
- Filtering on dimension-specific calculated fields

Key Analytical Skills:
1. Fact-dimension join construction
2. GROUP BY dimensional attributes
3. Multi-dimensional breakdowns (2+ dimensions)
4. Understanding when denormalization makes joins unnecessary vs. when they're needed
"""

# =============================================================================
# SINGLE-DIMENSION BREAKDOWNS
# =============================================================================
# Test cases breaking down metrics by a single dimensional attribute.
#
# Examples:
# - "Revenue by customer segment" → join order_facts to customer_dim, group by segment
# - "Opportunities by account industry" → may be denormalized or require join
# - "Ad performance by campaign" → may be denormalized or require join
#
# Business Domains: Shopify, Salesforce, Google AdWords, LinkedIn Ads
# Expected Patterns: Fact-dimension join with single GROUP BY or denormalized field usage
# =============================================================================

single_dimension_breakdowns = [
    # 1. Shopify - Revenue by customer segment (requires join to customer_dim)
    {
        "description": "Order revenue breakdown by customer segment",
        "message": "Calculate total revenue by customer segment. Join orders to customers on customer id. Sum order totals and count orders for each customer segment. Return customer segment, total revenue, and order count. Order by total revenue descending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts", "shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
* The query should use shopify_enriched.int_shopify_order_facts and shopify_enriched.int_shopify_customer_dim tables
* The query should join order_facts to customer_dim on customer_id
* The query should group by customer_segment (GROUP BY c.customer_segment or similar)
* The query should calculate total revenue using SUM(total_price) or equivalent
* The query should count orders using COUNT(order_id) or equivalent
* The query should order by total revenue descending
* The query should include customer_segment, total_revenue, and order_count columns
        """,
        "reference_query": """
            SELECT c.customer_segment,
                   SUM(o.total_price) as total_revenue,
                   COUNT(o.order_id) as order_count
            FROM shopify_enriched.int_shopify_order_facts o
            JOIN shopify_enriched.int_shopify_customer_dim c ON o.customer_id = c.customer_id
            GROUP BY c.customer_segment
            ORDER BY total_revenue DESC
        """,
    },
    # 2. Salesforce - Pipeline value by account industry (industry is denormalized)
    {
        "description": "Opportunity pipeline breakdown by account industry",
        "message": "Calculate pipeline value by industry from opportunity facts. Sum opportunity amounts and count opportunities for each account industry. Return account industry, total pipeline value, and opportunity count. Order by total pipeline value descending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
* The query should use salesforce_enriched.int_salesforce_opportunity_facts table
* The query should group by account_industry (account_industry is denormalized in the fact table)
* The query should calculate total pipeline value using SUM(opportunity_amount) or equivalent
* The query should count opportunities using COUNT(opportunity_id) or equivalent
* The query should order by total pipeline value descending
* The query should include account_industry, total_pipeline_value, and opportunity_count columns
* NOTE: account_industry is denormalized in int_salesforce_opportunity_facts, so no join to int_salesforce_account_dim is required
        """,
        "reference_query": """
            SELECT account_industry,
                   SUM(opportunity_amount) as total_pipeline_value,
                   COUNT(opportunity_id) as opportunity_count
            FROM salesforce_enriched.int_salesforce_opportunity_facts
            GROUP BY account_industry
            ORDER BY total_pipeline_value DESC
        """,
    },
    # 3. Salesforce - Win rate by account segment
    {
        "description": "Win rate and average deal size analysis by account segment",
        "message": "Calculate win rate and average deal size by account segment. Join opportunities to accounts on account id. Filter to only closed opportunities. Count total and won opportunities (where is_won is true) for each account segment. Calculate win rate as a percentage and average won deal size. Return account segment, won count, total count, win rate percentage, and average won deal size. Order by win rate descending, using account segment ascending as a tiebreaker.",
        "table_names": [
            "salesforce_enriched.int_salesforce_opportunity_facts",
            "salesforce_enriched.int_salesforce_account_dim",
        ],
        "query_description": """
* The query should use salesforce_enriched.int_salesforce_opportunity_facts and salesforce_enriched.int_salesforce_account_dim tables
* The query should join opportunity_facts to account_dim on account_id
* The query should filter for closed opportunities (WHERE is_closed = true)
* The query should group by account_segment (GROUP BY a.account_segment or similar)
* The query should count won opportunities using COUNT(CASE WHEN is_won THEN 1 END) or equivalent
* The query should count total closed opportunities using COUNT(*) or equivalent
* The query should calculate win rate percentage as (won_count / total_count) * 100
* The query should calculate average won deal size using AVG(CASE WHEN is_won THEN opportunity_amount END) or equivalent
* The query should order by win rate descending, with account segment ascending as tiebreaker
* The query should include account_segment, won_count, total_count, win_rate_pct, and avg_won_deal_size columns
        """,
        "reference_query": """
            SELECT a.account_segment,
                   COUNT(CASE WHEN o.is_won THEN 1 END) as won_count,
                   COUNT(*) as total_count,
                   ROUND(100.0 * COUNT(CASE WHEN o.is_won THEN 1 END) / COUNT(*), 2) as win_rate_pct,
                   ROUND(AVG(CASE WHEN o.is_won THEN o.opportunity_amount END), 2) as avg_won_deal_size
            FROM salesforce_enriched.int_salesforce_opportunity_facts o
            JOIN salesforce_enriched.int_salesforce_account_dim a ON o.account_id = a.account_id
            WHERE o.is_closed = true
            GROUP BY a.account_segment
            ORDER BY win_rate_pct DESC, a.account_segment ASC
        """,
    },
    # 4. Lever - Candidates by recruiter
    {
        "description": "Candidate count by recruiter from hiring funnel",
        "message": "Count candidates per recruiter from the hiring funnel. Exclude records with null owner names. Count distinct candidates (by opportunity id) and sum interview counts for each recruiter. Return recruiter name, candidate count, and total interviews. Order by candidate count descending, using recruiter name ascending as a tiebreaker.",
        "table_names": ["lever_enriched.int_lever_hiring_funnel_facts"],
        "query_description": """
* The query should use lever_enriched.int_lever_hiring_funnel_facts table
* The query should group by owner_name (the recruiter name, which is denormalized in the facts table)
* The query should count distinct candidates using COUNT(DISTINCT opportunity_id) or equivalent
* The query should sum total interviews using SUM(interview_count) or equivalent
* The query should filter to exclude NULL owner_names
* The query should order by candidate count descending, with recruiter name ascending as tiebreaker
* The query should include recruiter_name, candidate_count, and total_interviews columns
* NOTE: owner_name is denormalized in int_lever_hiring_funnel_facts, so no join to int_lever_user_dim is required
        """,
        "reference_query": """
            SELECT owner_name as recruiter_name,
                   COUNT(DISTINCT opportunity_id) as candidate_count,
                   SUM(interview_count) as total_interviews
            FROM lever_enriched.int_lever_hiring_funnel_facts
            WHERE owner_name IS NOT NULL
            GROUP BY owner_name
            ORDER BY candidate_count DESC, owner_name ASC
        """,
    },
    # 5. Shopify - Orders by customer segment
    {
        "description": "Order metrics breakdown by customer segment",
        "message": "Calculate order metrics by customer segment. Join orders to customers on customer id. Count orders and calculate average order value for each customer segment. Return customer segment, order count, and average order value. Order by average order value descending, using customer segment ascending as a tiebreaker.",
        "table_names": ["shopify_enriched.int_shopify_order_facts", "shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
* The query should use shopify_enriched.int_shopify_order_facts and shopify_enriched.int_shopify_customer_dim tables
* The query should join order_facts to customer_dim on customer_id
* The query should group by customer_segment (GROUP BY c.customer_segment or similar)
* The query should calculate order count using COUNT(order_id) or equivalent
* The query should calculate average order value using AVG(total_price) or equivalent
* The query should order by average order value descending, with customer segment ascending as tiebreaker
* The query should include customer_segment, order_count, and avg_order_value columns
        """,
        "reference_query": """
            SELECT c.customer_segment,
                   COUNT(o.order_id) as order_count,
                   AVG(o.total_price) as avg_order_value
            FROM shopify_enriched.int_shopify_order_facts o
            JOIN shopify_enriched.int_shopify_customer_dim c ON o.customer_id = c.customer_id
            GROUP BY c.customer_segment
            ORDER BY avg_order_value DESC, c.customer_segment ASC
        """,
    },
]


# =============================================================================
# MULTI-DIMENSIONAL BREAKDOWNS
# =============================================================================
# Test cases requiring breakdowns by 2+ dimensional attributes simultaneously.
#
# Examples:
# - "Revenue by customer segment and product category"
# - "Opportunities by stage and industry"
# - "Ad performance by campaign and creative"
#
# Business Domains: Shopify, Salesforce, LinkedIn Ads
# Expected Patterns: Multiple GROUP BY dimensions
# =============================================================================

multi_dimensional_breakdowns = [
    # 6. Shopify - Revenue by customer segment and product type
    {
        "description": "Revenue breakdown by customer segment and product type",
        "message": "Calculate revenue by customer segment and product type. Join order lines to customers on customer id. Sum revenue (quantity times unit price) and count distinct orders for each combination of customer segment and product type. Return customer segment, product type, total revenue, and order count. Order by total revenue descending, then customer segment ascending, then product type ascending.",
        "table_names": [
            "shopify_enriched.int_shopify_order_line_facts",
            "shopify_enriched.int_shopify_customer_dim",
        ],
        "query_description": """
* The query should use shopify_enriched.int_shopify_order_line_facts and shopify_enriched.int_shopify_customer_dim tables
* The query should join order_line_facts to customer_dim on customer_id
* The query should group by both customer_segment and product_type (GROUP BY c.customer_segment, o.product_type or similar)
* The query should calculate total revenue using SUM(quantity * unit_price) or SUM(line_net_amount) or equivalent
* The query should count distinct orders using COUNT(DISTINCT order_id) or equivalent
* The query should order by total revenue descending, then customer segment ascending, then product type ascending
* The query should include customer_segment, product_type, total_revenue, and order_count columns
        """,
        "reference_query": """
            SELECT c.customer_segment,
                   o.product_type,
                   SUM(o.quantity * o.unit_price) as total_revenue,
                   COUNT(DISTINCT o.order_id) as order_count
            FROM shopify_enriched.int_shopify_order_line_facts o
            JOIN shopify_enriched.int_shopify_customer_dim c ON o.customer_id = c.customer_id
            GROUP BY c.customer_segment, o.product_type
            ORDER BY total_revenue DESC, c.customer_segment ASC, o.product_type ASC
        """,
    },
    # 7. Salesforce - Opportunities by stage and industry
    {
        "description": "Opportunity pipeline by stage and account industry",
        "message": "Calculate opportunity metrics by stage and industry from opportunity facts. Count opportunities and sum amounts for each combination of stage name and account industry. Return stage name, account industry, opportunity count, and total value. Order by total value descending, then stage name ascending, then account industry ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
* The query should use salesforce_enriched.int_salesforce_opportunity_facts table
* The query should group by both stage_name and account_industry (GROUP BY stage_name, account_industry)
* The query should count opportunities using COUNT(opportunity_id) or COUNT(*) or equivalent
* The query should calculate total value using SUM(opportunity_amount) or equivalent
* The query should order by total value descending, then stage name ascending, then industry ascending
* The query should include stage_name, account_industry, opportunity_count, and total_value columns
* NOTE: account_industry is denormalized in int_salesforce_opportunity_facts, so no join to int_salesforce_account_dim is required
        """,
        "reference_query": """
            SELECT stage_name,
                   account_industry,
                   COUNT(opportunity_id) as opp_count,
                   SUM(opportunity_amount) as total_value
            FROM salesforce_enriched.int_salesforce_opportunity_facts
            GROUP BY stage_name, account_industry
            ORDER BY total_value DESC, stage_name ASC, account_industry ASC
        """,
    },
    # 8. Brex - Spending by department and expense category
    {
        "description": "Corporate spending breakdown by department and category",
        "message": "Calculate expenses by department and category from expense facts. Sum expense amounts and count transactions for each combination of department name and transaction category. Return department name, transaction category, total spend, and transaction count. Order by total spend descending, then department name ascending, then transaction category ascending.",
        "table_names": ["brex_enriched.int_brex_expense_facts"],
        "query_description": """
* The query should use brex_enriched.int_brex_expense_facts table
* The query should group by both department_name and transaction_category (GROUP BY department_name, transaction_category)
* The query should calculate total spend using SUM(expense_amount) or equivalent
* The query should count transactions using COUNT(*) or COUNT(expense_id) or equivalent
* The query should order by total spend descending, then department name ascending, then category ascending
* The query should include department_name, transaction_category, total_spend, and transaction_count columns
        """,
        "reference_query": """
            SELECT department_name,
                   transaction_category,
                   SUM(expense_amount) as total_spend,
                   COUNT(*) as transaction_count
            FROM brex_enriched.int_brex_expense_facts
            GROUP BY department_name, transaction_category
            ORDER BY total_spend DESC, department_name ASC, transaction_category ASC
        """,
    },
    # 9. Salesforce - Opportunities by owner and account segment
    {
        "description": "Sales rep performance by account segment",
        "message": "Calculate sales rep performance by account segment. Join opportunities to accounts on account id. Sum won opportunity amounts (where is_won is true) and count won opportunities for each combination of owner name and account segment. Return owner name, account segment, won value, and won count. Order by won value descending, then owner name ascending, then account segment ascending.",
        "table_names": [
            "salesforce_enriched.int_salesforce_opportunity_facts",
            "salesforce_enriched.int_salesforce_account_dim",
        ],
        "query_description": """
* The query should use salesforce_enriched.int_salesforce_opportunity_facts and salesforce_enriched.int_salesforce_account_dim tables
* The query should join opportunity_facts to account_dim on account_id
* The query should group by both owner_name and account_segment (GROUP BY o.owner_name, a.account_segment or similar)
* The query should calculate won value using SUM(CASE WHEN is_won THEN opportunity_amount ELSE 0 END) or equivalent
* The query should count won opportunities using COUNT(CASE WHEN is_won THEN 1 END) or equivalent
* The query should order by won value descending, then owner name ascending, then account segment ascending
* The query should include owner_name, account_segment, won_value, and won_count columns
        """,
        "reference_query": """
            SELECT o.owner_name,
                   a.account_segment,
                   SUM(CASE WHEN o.is_won THEN o.opportunity_amount ELSE 0 END) as won_value,
                   COUNT(CASE WHEN o.is_won THEN 1 END) as won_count
            FROM salesforce_enriched.int_salesforce_opportunity_facts o
            JOIN salesforce_enriched.int_salesforce_account_dim a ON o.account_id = a.account_id
            GROUP BY o.owner_name, a.account_segment
            ORDER BY won_value DESC, o.owner_name ASC, a.account_segment ASC
        """,
    },
]


# =============================================================================
# DIMENSION-ATTRIBUTE FILTERING
# =============================================================================
# Test cases that filter based on dimension table attributes not present in facts.
#
# Examples:
# - "Revenue from customers with lifetime orders > 10" → filter on customer_dim
# - "Opportunities from accounts with revenue > $1M" → filter on account_dim
# - "Candidates from experienced recruiters" → filter on user_dim attributes
#
# Business Domains: Shopify, Salesforce, Lever
# Expected Patterns: Fact-dimension join with WHERE clause on dimension attributes
# =============================================================================

dimension_attribute_filters = [
    # 10. Shopify - Orders from high-frequency customers
    {
        "description": "Orders from customers with high lifetime order count",
        "message": "Calculate revenue from high-frequency customers. Join orders to customers on customer id. Filter to customers with more than 10 lifetime orders. Sum order totals and count orders. Return total revenue and order count.",
        "table_names": ["shopify_enriched.int_shopify_order_facts", "shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
* The query should use shopify_enriched.int_shopify_order_facts and shopify_enriched.int_shopify_customer_dim tables
* The query should join order_facts to customer_dim on customer_id
* The query should filter where lifetime_orders > 10 (filtering on customer_dim attribute)
* The query should calculate total revenue using SUM(total_price) or equivalent
* The query should count orders using COUNT(order_id) or equivalent
* The query should include total_revenue and order_count columns in the result
        """,
        "reference_query": """
            SELECT SUM(o.total_price) as total_revenue,
                   COUNT(o.order_id) as order_count
            FROM shopify_enriched.int_shopify_order_facts o
            JOIN shopify_enriched.int_shopify_customer_dim c ON o.customer_id = c.customer_id
            WHERE c.lifetime_orders > 10
        """,
    },
    # 11. Salesforce - Opportunities from large accounts
    {
        "description": "Opportunities from accounts with high employee count",
        "message": "Calculate opportunity metrics from large accounts. Join opportunities to accounts on account id. Filter to accounts with more than 1000 employees. Count opportunities, sum amounts, and calculate average amount. Return opportunity count, total pipeline value, and average deal size.",
        "table_names": [
            "salesforce_enriched.int_salesforce_opportunity_facts",
            "salesforce_enriched.int_salesforce_account_dim",
        ],
        "query_description": """
* The query should use salesforce_enriched.int_salesforce_opportunity_facts and salesforce_enriched.int_salesforce_account_dim tables
* The query should join opportunity_facts to account_dim on account_id
* The query should filter where employee_count > 1000 (filtering on account_dim attribute)
* The query should calculate opportunity count using COUNT(opportunity_id) or equivalent
* The query should calculate total pipeline value using SUM(opportunity_amount) or equivalent
* The query should calculate average deal size using AVG(opportunity_amount) or equivalent
* The query should include opportunity_count, total_pipeline_value, and avg_deal_size columns in the result
        """,
        "reference_query": """
            SELECT COUNT(o.opportunity_id) as opportunity_count,
                   SUM(o.opportunity_amount) as total_pipeline_value,
                   AVG(o.opportunity_amount) as avg_deal_size
            FROM salesforce_enriched.int_salesforce_opportunity_facts o
            JOIN salesforce_enriched.int_salesforce_account_dim a ON o.account_id = a.account_id
            WHERE a.employee_count > 1000
        """,
    },
    # 12. Salesforce - High revenue accounts
    {
        "description": "Opportunities from accounts with high annual revenue",
        "message": "Calculate opportunity metrics for high-revenue accounts. Join opportunities to accounts on account id. Filter to accounts with annual revenue greater than 10 million. Count opportunities and sum won amounts (where is_won is true) for each account. Return account id, account name, annual revenue, opportunity count, and won value. Order by won value descending, using account id ascending as a tiebreaker.",
        "table_names": [
            "salesforce_enriched.int_salesforce_opportunity_facts",
            "salesforce_enriched.int_salesforce_account_dim",
        ],
        "query_description": """
* The query should use salesforce_enriched.int_salesforce_opportunity_facts and salesforce_enriched.int_salesforce_account_dim tables
* The query should LEFT JOIN accounts to opportunities on account_id (to include all high-revenue accounts even those without opportunities)
* The query should filter where annual_revenue > 10000000 (filtering on account_dim attribute)
* The query should group by account (GROUP BY account_id, account_name, annual_revenue or similar)
* The query should count opportunities using COUNT(opportunity_id) or equivalent (returns 0 for accounts without opportunities)
* The query should calculate won value using SUM(CASE WHEN is_won THEN opportunity_amount ELSE 0 END) or equivalent, with COALESCE to handle NULLs
* The query should order by won value descending, with account_id ascending as tiebreaker
* The query should include account_id, account_name, annual_revenue, opportunity_count, and won_value columns in the result
        """,
        "reference_query": """
            SELECT a.account_id,
                   a.account_name,
                   a.annual_revenue,
                   COUNT(o.opportunity_id) as opp_count,
                   COALESCE(SUM(CASE WHEN o.is_won THEN o.opportunity_amount ELSE 0 END), 0) as won_value
            FROM salesforce_enriched.int_salesforce_account_dim a
            LEFT JOIN salesforce_enriched.int_salesforce_opportunity_facts o ON a.account_id = o.account_id
            WHERE a.annual_revenue > 10000000
            GROUP BY a.account_id, a.account_name, a.annual_revenue
            ORDER BY won_value DESC, a.account_id ASC
        """,
    },
    # 13. Shopify - Revenue from VIP customers
    {
        "description": "Revenue from customers with high lifetime value",
        "message": "Calculate revenue from VIP customers. Join orders to customers on customer id. Filter to customers with lifetime value greater than 400. Count distinct customers, sum order totals, and count orders. Return VIP customer count, total revenue, and order count.",
        "table_names": ["shopify_enriched.int_shopify_order_facts", "shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
* The query should use shopify_enriched.int_shopify_order_facts and shopify_enriched.int_shopify_customer_dim tables
* The query should join order_facts to customer_dim on customer_id
* The query should filter where lifetime_value > 400 (filtering on customer_dim attribute)
* The query should calculate VIP customer count using COUNT(DISTINCT customer_id) or equivalent
* The query should calculate total revenue using SUM(total_price) or equivalent
* The query should count orders using COUNT(order_id) or equivalent
* The query should include vip_customer_count, total_revenue, and order_count columns in the result
        """,
        "reference_query": """
            SELECT COUNT(DISTINCT o.customer_id) as vip_customer_count,
                   SUM(o.total_price) as total_revenue,
                   COUNT(o.order_id) as order_count
            FROM shopify_enriched.int_shopify_order_facts o
            JOIN shopify_enriched.int_shopify_customer_dim c ON o.customer_id = c.customer_id
            WHERE c.lifetime_value > 400
        """,
    },
]


# =============================================================================
# AGGREGATION WITH DIMENSION ENRICHMENT
# =============================================================================
# Test cases where dimension tables provide enriched context for fact aggregations.
#
# Examples:
# - "Total revenue by customer value tier" -> customer_dim has value_tier
# - "Win rate by account size category" -> account_dim has company_size
# - "Churn by customer cohort" -> churn_fact may need customer_dim for cohort
#
# Business Domains: Shopify, Salesforce, Stripe
# Expected Patterns: Leveraging derived categorical fields from dimensions
# =============================================================================

dimension_enriched_aggregations = [
    # 14. Shopify - Order performance by value tier and segment
    {
        "description": "Order metrics using customer dimension categorizations",
        "message": "Calculate order metrics by value tier and segment. Join orders to customers on customer id. Count orders, calculate average order value, and sum totals for each combination of value tier and customer segment. Return value tier, customer segment, order count, average order value, and total revenue. Order by total revenue descending, then value tier ascending, then customer segment ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts", "shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
* The query should use shopify_enriched.int_shopify_order_facts and shopify_enriched.int_shopify_customer_dim tables
* The query should join order_facts to customer_dim on customer_id
* The query should group by both value_tier and customer_segment (GROUP BY c.value_tier, c.customer_segment or similar)
* The query should count orders using COUNT(order_id) or equivalent
* The query should calculate average order value using AVG(total_price) or equivalent
* The query should calculate total revenue using SUM(total_price) or equivalent
* The query should order by total revenue descending, then value tier ascending, then customer segment ascending
* The query should include value_tier, customer_segment, order_count, avg_order_value, and total_revenue columns
        """,
        "reference_query": """
            SELECT c.value_tier,
                   c.customer_segment,
                   COUNT(o.order_id) as order_count,
                   AVG(o.total_price) as avg_order_value,
                   SUM(o.total_price) as total_revenue
            FROM shopify_enriched.int_shopify_order_facts o
            JOIN shopify_enriched.int_shopify_customer_dim c ON o.customer_id = c.customer_id
            GROUP BY c.value_tier, c.customer_segment
            ORDER BY total_revenue DESC, c.value_tier ASC, c.customer_segment ASC
        """,
    },
    # 15. Salesforce - Opportunity metrics by pre-computed company size category
    {
        "description": "Opportunity metrics by pre-computed company size category",
        "message": "Calculate open pipeline by company size. Join opportunities to accounts on account id. Filter to only open opportunities (where is_closed is false). Count opportunities, sum amounts, and calculate average for each company size. Return company size, opportunity count, total pipeline value, and average deal size. Order by total pipeline value descending, using company size ascending as a tiebreaker.",
        "table_names": [
            "salesforce_enriched.int_salesforce_opportunity_facts",
            "salesforce_enriched.int_salesforce_account_dim",
        ],
        "query_description": """
* The query should use salesforce_enriched.int_salesforce_opportunity_facts and salesforce_enriched.int_salesforce_account_dim tables
* The query should join opportunity_facts to account_dim on account_id
* The query should filter for open opportunities (WHERE is_closed = false)
* The query should group by company_size (a pre-computed categorical field from account_dim)
* The query should count opportunities using COUNT(opportunity_id) or equivalent
* The query should calculate total pipeline value using SUM(opportunity_amount) or equivalent
* The query should calculate average deal size using AVG(opportunity_amount) or equivalent
* The query should order by total pipeline value descending, with company size ascending as tiebreaker
* The query should include company_size, opportunity_count, total_pipeline_value, and avg_deal_size columns
        """,
        "reference_query": """
            SELECT a.company_size,
                   COUNT(o.opportunity_id) as opportunity_count,
                   SUM(o.opportunity_amount) as total_pipeline_value,
                   AVG(o.opportunity_amount) as avg_deal_size
            FROM salesforce_enriched.int_salesforce_opportunity_facts o
            JOIN salesforce_enriched.int_salesforce_account_dim a ON o.account_id = a.account_id
            WHERE o.is_closed = false
            GROUP BY a.company_size
            ORDER BY total_pipeline_value DESC, a.company_size ASC
        """,
    },
    # 16. Stripe - Monthly recurring revenue by customer status category
    {
        "description": "Monthly recurring revenue by customer status category",
        "message": "Calculate monthly recurring revenue by customer status. Join monthly revenue to customers on customer id. Sum MRR amounts and count distinct customers for each customer status. Return customer status, total MRR, and customer count. Order by total MRR descending, using customer status ascending as a tiebreaker.",
        "table_names": [
            "stripe_enriched.int_stripe_monthly_revenue_fact",
            "stripe_enriched.int_stripe_customers_dim",
        ],
        "query_description": """
* The query should use stripe_enriched.int_stripe_monthly_revenue_fact and stripe_enriched.int_stripe_customers_dim tables
* The query should join monthly_revenue_fact to customers_dim on customer_id
* The query should group by customer_status (a pre-computed categorical field from customers_dim)
* The query should calculate total MRR using SUM(mrr_amount) or equivalent
* The query should count distinct customers using COUNT(DISTINCT customer_id) or equivalent
* The query should order by total MRR descending, with customer status ascending as tiebreaker
* The query should include customer_status, total_mrr, and customer_count columns
        """,
        "reference_query": """
            SELECT c.customer_status,
                   SUM(r.mrr_amount) as total_mrr,
                   COUNT(DISTINCT r.customer_id) as customer_count
            FROM stripe_enriched.int_stripe_monthly_revenue_fact r
            JOIN stripe_enriched.int_stripe_customers_dim c ON r.customer_id = c.customer_id
            GROUP BY c.customer_status
            ORDER BY total_mrr DESC, c.customer_status ASC
        """,
    },
]

# Export test data and metadata for benchmark creation
TEST_DATA = [
    *single_dimension_breakdowns,
    *multi_dimensional_breakdowns,
    *dimension_attribute_filters,
    *dimension_enriched_aggregations,
]
