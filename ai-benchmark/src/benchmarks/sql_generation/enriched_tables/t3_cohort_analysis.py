"""
Tier 3: Cohort Analysis

This module tests the agent's ability to perform cohort-based analysis, including:
- Grouping entities by time-based cohorts (signup month, acquisition quarter, etc.)
- Calculating cohort-specific metrics (retention rates, lifetime value, conversion rates)
- Comparing performance across different cohorts
"""

TEST_DATA = [
    # Test 1: Customer count by signup month cohort
    {
        "description": "Count of customers grouped by signup month cohort",
        "message": "Count Stripe customers by signup month cohort. Group customers by the calendar month they were created. Count the number of customers in each cohort. Return signup month and customer count. Order by signup month ascending.",
        "table_names": ["stripe_enriched.int_stripe_customers_dim"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_customers_dim table
                * The query should group by signup month (using DATE_TRUNC('month', customer_created_at) or equivalent)
                * The query should count customers in each signup month using COUNT(*)
                * The query should order by signup month chronologically (ascending)
                * The query should include the signup month and customer count columns
                """,
        "reference_query": """
                SELECT DATE_TRUNC('month', customer_created_at)::date as signup_month,
                       COUNT(*) as customer_count
                FROM stripe_enriched.int_stripe_customers_dim
                GROUP BY signup_month
                ORDER BY signup_month ASC
                """,
    },
    # Test 2: Churned customer count by churn cohort
    {
        "description": "Churned customer count by churn cohort category",
        "message": "Count churned customers by churn cohort category. Group by the churn cohort field and count customers in each cohort. Return churn cohort and churned customer count. Order by churn cohort ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_churn_fact table
                * The query should group by churn_cohort field
                * The query should count churned customers in each cohort using COUNT(*)
                * The query should order by churn_cohort alphabetically (ascending)
                * The query should include the churn cohort and customer count columns
                """,
        "reference_query": """
                SELECT churn_cohort,
                       COUNT(*) as churned_customer_count
                FROM stripe_enriched.int_stripe_churn_fact
                GROUP BY churn_cohort
                ORDER BY churn_cohort ASC
                """,
    },
    # Test 3: Lead creation cohorts by month
    {
        "description": "Lead creation cohorts by month",
        "message": "Count Salesforce leads by creation month cohort. Group leads by the calendar month they were created. Count the number of leads in each cohort. Return creation month and lead count. Order by creation month ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_lead_conversion_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_lead_conversion_facts table
                * The query should group by creation month (using DATE_TRUNC('month', lead_created_date) or equivalent)
                * The query should count leads in each creation month using COUNT(*)
                * The query should order by creation month chronologically (ascending)
                * The query should include the creation month and lead count columns
                """,
        "reference_query": """
                SELECT DATE_TRUNC('month', lead_created_date)::date as creation_month,
                       COUNT(*) as lead_count
                FROM salesforce_enriched.int_salesforce_lead_conversion_facts
                GROUP BY creation_month
                ORDER BY creation_month ASC
                """,
    },
    # Test 4: Customer acquisition cohorts by quarter
    {
        "description": "Customer acquisition cohorts by quarter",
        "message": "Count Shopify customers by acquisition quarter cohort. Group customers by the calendar quarter they were created. Count the number of customers in each cohort. Return acquisition quarter and customer count. Order by acquisition quarter ascending.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_customer_dim table
                * The query should group by acquisition quarter (using DATE_TRUNC('quarter', customer_created_at) or equivalent)
                * The query should count customers in each acquisition quarter using COUNT(*)
                * The query should order by acquisition quarter chronologically (ascending)
                * The query should include the acquisition quarter and customer count columns
                """,
        "reference_query": """
                SELECT DATE_TRUNC('quarter', customer_created_at)::date as acquisition_quarter,
                       COUNT(*) as customer_count
                FROM shopify_enriched.int_shopify_customer_dim
                GROUP BY acquisition_quarter
                ORDER BY acquisition_quarter ASC
                """,
    },
    # Test 5: Retention rate for each signup month cohort
    {
        "description": "Retention rate for each signup month cohort",
        "message": "Calculate retention rate by signup month cohort. Group customers by the month they signed up. For each customer, find their most recent subscription status. Count how many customers in each signup cohort are still active versus the total in that cohort. Calculate retention rate as a percentage. Order by signup month ascending.",
        "table_names": [
            "stripe_enriched.int_stripe_monthly_revenue_fact",
            "stripe_enriched.int_stripe_customers_dim",
        ],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_monthly_revenue_fact and stripe_enriched.int_stripe_customers_dim tables
                * The query should join monthly_revenue_fact to customers_dim on customer_id
                * The query should group by signup month (using DATE_TRUNC('month', customer_created_at) or equivalent)
                * The query should calculate retention rate as percentage of customers with active subscription status
                * The query should use the most recent subscription status for each customer (latest month_start_date)
                * The query should order by signup month chronologically (ascending)
                * The query should include signup month, total customers, active customers, and retention rate
                """,
        "reference_query": """
                WITH signup_cohorts AS (
                  SELECT
                    customer_id,
                    DATE_TRUNC('month', customer_created_at)::date as signup_month
                  FROM stripe_enriched.int_stripe_customers_dim
                ),
                latest_status AS (
                  SELECT DISTINCT ON (customer_id)
                    customer_id,
                    subscription_status,
                    month_start_date
                  FROM stripe_enriched.int_stripe_monthly_revenue_fact
                  ORDER BY customer_id, month_start_date DESC
                )
                SELECT
                  sc.signup_month,
                  COUNT(*) as total_customers,
                  COUNT(CASE WHEN ls.subscription_status = 'active' THEN 1 END) as active_customers,
                  ROUND(100.0 * COUNT(CASE WHEN ls.subscription_status = 'active' THEN 1 END) / COUNT(*), 2) as retention_rate
                FROM signup_cohorts sc
                LEFT JOIN latest_status ls ON sc.customer_id = ls.customer_id
                GROUP BY sc.signup_month
                ORDER BY sc.signup_month ASC
                """,
    },
    # Test 6: Repeat purchase rate by acquisition cohort
    {
        "description": "Percentage of customers with repeat purchases by acquisition cohort",
        "message": "Calculate repeat purchase rate by acquisition quarter cohort. Group customers by the calendar quarter they were created. Count total customers and count customers with more than one lifetime order as repeat customers. Calculate repeat purchase rate as a percentage. Return acquisition quarter, total customers, repeat customers, and repeat purchase rate. Order by acquisition quarter ascending.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_customer_dim table
                * The query should group by acquisition quarter (using DATE_TRUNC('quarter', customer_created_at) or equivalent)
                * The query should define repeat customers as those with lifetime_orders > 1
                * The query should calculate repeat purchase rate as percentage of customers with repeat purchases
                * The query should order by acquisition quarter chronologically (ascending)
                * The query should include acquisition quarter, total customers, repeat customers, and repeat purchase rate
                """,
        "reference_query": """
                SELECT
                  DATE_TRUNC('quarter', customer_created_at)::date as acquisition_quarter,
                  COUNT(*) as total_customers,
                  COUNT(CASE WHEN lifetime_orders > 1 THEN 1 END) as repeat_customers,
                  ROUND(100.0 * COUNT(CASE WHEN lifetime_orders > 1 THEN 1 END) / COUNT(*), 2) as repeat_purchase_rate
                FROM shopify_enriched.int_shopify_customer_dim
                GROUP BY acquisition_quarter
                ORDER BY acquisition_quarter ASC
                """,
    },
    # Test 7: Distribution of churn timing across cohorts
    {
        "description": "Distribution of churn timing across cohorts",
        "message": "Analyze average customer lifetime by churn cohort. Group by the churn cohort field. Calculate the average lifetime in days and count customers for each cohort. Return churn cohort, average lifetime days, and customer count. Order by churn cohort ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_churn_fact table
                * The query should group by churn_cohort field
                * The query should calculate average lifetime_days for each churn cohort
                * The query should count customers in each churn cohort using COUNT(*)
                * The query should order by churn_cohort alphabetically (ascending)
                * The query should include churn cohort, average lifetime days, and customer count columns
                """,
        "reference_query": """
                SELECT
                  churn_cohort,
                  AVG(lifetime_days) as avg_lifetime_days,
                  COUNT(*) as customer_count
                FROM stripe_enriched.int_stripe_churn_fact
                GROUP BY churn_cohort
                ORDER BY churn_cohort ASC
                """,
    },
    # Test 8: Average lifetime revenue by churn cohort
    {
        "description": "Average lifetime revenue by churn cohort",
        "message": "Calculate average lifetime revenue by churn cohort. Group by the churn cohort field. Calculate the average total revenue generated and count customers for each cohort. Return churn cohort, average revenue, and customer count. Order by churn cohort ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_churn_fact table
                * The query should group by churn_cohort field
                * The query should calculate average total_revenue_generated for each churn cohort using AVG()
                * The query should count customers in each churn cohort using COUNT(*)
                * The query should order by churn_cohort alphabetically (ascending)
                * The query should include churn cohort, average revenue, and customer count columns
                """,
        "reference_query": """
                SELECT
                  churn_cohort,
                  AVG(total_revenue_generated) as avg_revenue,
                  COUNT(*) as customer_count
                FROM stripe_enriched.int_stripe_churn_fact
                GROUP BY churn_cohort
                ORDER BY churn_cohort ASC
                """,
    },
    # Test 9: Average lifetime in days by churn cohort
    {
        "description": "Average lifetime in days by churn cohort",
        "message": "Calculate average customer lifetime in days by churn cohort. Group by the churn cohort field. Calculate the average lifetime days and count customers for each cohort. Return churn cohort, average lifetime days, and customer count. Order by churn cohort ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_churn_fact table
                * The query should group by churn_cohort field
                * The query should calculate average lifetime_days for each churn cohort using AVG()
                * The query should count customers in each churn cohort using COUNT(*)
                * The query should order by churn_cohort alphabetically (ascending)
                * The query should include churn cohort, average lifetime days, and customer count columns
                """,
        "reference_query": """
                SELECT
                  churn_cohort,
                  AVG(lifetime_days) as avg_lifetime_days,
                  COUNT(*) as customer_count
                FROM stripe_enriched.int_stripe_churn_fact
                GROUP BY churn_cohort
                ORDER BY churn_cohort ASC
                """,
    },
    # Test 10: Average customer lifetime value by signup cohort
    {
        "description": "Average customer lifetime value by signup cohort",
        "message": "Calculate average customer lifetime value by acquisition quarter cohort. Group customers by the calendar quarter they were created. Calculate the average lifetime value and count customers for each cohort. Return acquisition quarter, average lifetime value, and customer count. Order by acquisition quarter ascending.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_customer_dim table
                * The query should group by acquisition quarter (using DATE_TRUNC('quarter', customer_created_at) or equivalent)
                * The query should calculate average lifetime_value for each acquisition quarter using AVG()
                * The query should count customers in each acquisition quarter using COUNT(*)
                * The query should order by acquisition quarter chronologically (ascending)
                * The query should include acquisition quarter, average lifetime value, and customer count columns
                """,
        "reference_query": """
                SELECT
                  DATE_TRUNC('quarter', customer_created_at)::date as acquisition_quarter,
                  AVG(lifetime_value) as avg_lifetime_value,
                  COUNT(*) as customer_count
                FROM shopify_enriched.int_shopify_customer_dim
                GROUP BY acquisition_quarter
                ORDER BY acquisition_quarter ASC
                """,
    },
    # Test 11: Total revenue by signup month cohort
    {
        "description": "Total revenue by signup month cohort",
        "message": "Calculate total revenue by signup month cohort. Group churned customers by the calendar month their subscription started. Sum the total revenue generated and count customers for each cohort. Return signup month, total revenue, and customer count. Order by signup month ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_churn_fact table
                * The query should group by signup month (using DATE_TRUNC('month', subscription_start_date) or equivalent)
                * The query should calculate total revenue contribution using SUM(total_revenue_generated)
                * The query should count customers in each cohort using COUNT(*)
                * The query should order by signup month chronologically (ascending)
                * The query should include signup month, total revenue, and customer count columns
                """,
        "reference_query": """
                SELECT DATE_TRUNC('month', subscription_start_date)::date as signup_month,
                       SUM(total_revenue_generated) as total_revenue,
                       COUNT(*) as customer_count
                FROM stripe_enriched.int_stripe_churn_fact
                GROUP BY signup_month
                ORDER BY signup_month ASC
                """,
    },
    # Test 12: Revenue comparison across churn cohorts
    {
        "description": "Revenue comparison across churn cohorts",
        "message": "Compare average revenue across churn cohorts. Group by the churn cohort field. Calculate the average total revenue generated and count customers for each cohort. Return churn cohort, average revenue, and customer count. Order by churn cohort ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_churn_fact table
                * The query should group by churn_cohort field
                * The query should calculate average revenue generated using AVG(total_revenue_generated)
                * The query should count customers in each churn cohort using COUNT(*)
                * The query should order by churn_cohort alphabetically (ascending)
                * The query should include churn cohort, average revenue, and customer count columns
                """,
        "reference_query": """
                SELECT churn_cohort,
                       AVG(total_revenue_generated) as avg_revenue,
                       COUNT(*) as customer_count
                FROM stripe_enriched.int_stripe_churn_fact
                GROUP BY churn_cohort
                ORDER BY churn_cohort ASC
                """,
    },
    # Test 13: Identify highest LTV acquisition cohort
    {
        "description": "Identify highest LTV acquisition cohort",
        "message": "Find acquisition cohorts ranked by average lifetime value. Group customers by the calendar quarter they were created. Calculate the average lifetime value and count customers for each cohort. Return acquisition quarter, average lifetime value, and customer count. Order by average lifetime value descending, using acquisition quarter ascending as a tiebreaker.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_customer_dim table
                * The query should group by acquisition quarter (using DATE_TRUNC('quarter', customer_created_at) or equivalent)
                * The query should calculate average lifetime_value for each acquisition quarter using AVG()
                * The query should count customers in each acquisition quarter using COUNT(*)
                * The query should order by average lifetime value descending, with acquisition quarter ascending as tiebreaker
                * The query should include acquisition quarter, average lifetime value, and customer count columns
                """,
        "reference_query": """
                SELECT
                  DATE_TRUNC('quarter', customer_created_at)::date as acquisition_quarter,
                  AVG(lifetime_value) as avg_lifetime_value,
                  COUNT(*) as customer_count
                FROM shopify_enriched.int_shopify_customer_dim
                GROUP BY acquisition_quarter
                ORDER BY avg_lifetime_value DESC, acquisition_quarter ASC
                """,
    },
    # Test 14: Compare retention rates across monthly cohorts
    {
        "description": "Compare retention rates across monthly cohorts",
        "message": "Compare retention rates across monthly signup cohorts. Group customers by the month they signed up. For each customer, find their most recent subscription status. Count how many customers in each signup cohort are still active versus the total in that cohort. Calculate retention rate as a percentage. Order by signup month ascending.",
        "table_names": [
            "stripe_enriched.int_stripe_monthly_revenue_fact",
            "stripe_enriched.int_stripe_customers_dim",
        ],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_monthly_revenue_fact and stripe_enriched.int_stripe_customers_dim tables
                * The query should join monthly_revenue_fact to customers_dim on customer_id
                * The query should group by signup month (using DATE_TRUNC('month', customer_created_at) or equivalent)
                * The query should calculate retention rate as percentage of customers with subscription_status = 'active'
                * The query should use the most recent subscription status for each customer (latest month_start_date)
                * The query should order by signup month chronologically (ascending)
                * The query should include signup month, total customers, active customers, and retention rate
                """,
        "reference_query": """
                WITH signup_cohorts AS (
                  SELECT
                    customer_id,
                    DATE_TRUNC('month', customer_created_at)::date as signup_month
                  FROM stripe_enriched.int_stripe_customers_dim
                ),
                latest_status AS (
                  SELECT DISTINCT ON (customer_id)
                    customer_id,
                    subscription_status,
                    month_start_date
                  FROM stripe_enriched.int_stripe_monthly_revenue_fact
                  ORDER BY customer_id, month_start_date DESC
                )
                SELECT
                  sc.signup_month,
                  COUNT(*) as total_customers,
                  COUNT(CASE WHEN ls.subscription_status = 'active' THEN 1 END) as active_customers,
                  ROUND(100.0 * COUNT(CASE WHEN ls.subscription_status = 'active' THEN 1 END) / COUNT(*), 2) as retention_rate
                FROM signup_cohorts sc
                LEFT JOIN latest_status ls ON sc.customer_id = ls.customer_id
                GROUP BY sc.signup_month
                ORDER BY sc.signup_month ASC
                """,
    },
    # Test 15: Lead conversion by cohort
    {
        "description": "Conversion rates by lead creation cohort",
        "message": "Calculate lead conversion rate by creation month cohort. Group leads by the calendar month they were created. Count total leads and count converted leads (where is_converted is true). Calculate conversion rate as a percentage. Return creation month, total leads, converted leads, and conversion rate. Order by creation month ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_lead_conversion_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_lead_conversion_facts table
                * The query should group by creation month (using DATE_TRUNC('month', lead_created_date) or equivalent)
                * The query should count total leads in each cohort using COUNT(*)
                * The query should count converted leads using COUNT(CASE WHEN is_converted = true THEN 1 END) or equivalent
                * The query should calculate conversion rate as percentage of leads that were converted
                * The query should order by creation month chronologically (ascending)
                * The query should include creation month, total leads, converted leads, and conversion rate columns
                """,
        "reference_query": """
                SELECT
                  DATE_TRUNC('month', lead_created_date)::date as creation_month,
                  COUNT(*) as total_leads,
                  COUNT(CASE WHEN is_converted = true THEN 1 END) as converted_leads,
                  ROUND(100.0 * COUNT(CASE WHEN is_converted = true THEN 1 END) / COUNT(*), 2) as conversion_rate
                FROM salesforce_enriched.int_salesforce_lead_conversion_facts
                GROUP BY creation_month
                ORDER BY creation_month ASC
                """,
    },
    # Test 16: Lifetime value by acquisition cohort and customer segment
    {
        "description": "Lifetime value by acquisition cohort and customer segment",
        "message": "Calculate average lifetime value by acquisition quarter and customer segment. Group customers by the calendar quarter they were created and by customer segment. Calculate the average lifetime value and count customers for each cohort-segment combination. Return acquisition quarter, customer segment, average lifetime value, and customer count. Order by acquisition quarter ascending, then customer segment ascending.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_customer_dim table
                * The query should group by both acquisition quarter (using DATE_TRUNC('quarter', customer_created_at) or equivalent) and customer_segment
                * The query should calculate average lifetime_value for each cohort-segment combination using AVG()
                * The query should count customers in each cohort-segment combination using COUNT(*)
                * The query should order by acquisition quarter chronologically (ascending), then by customer_segment alphabetically
                * The query should include acquisition quarter, customer segment, average lifetime value, and customer count columns
                """,
        "reference_query": """
                SELECT
                  DATE_TRUNC('quarter', customer_created_at)::date as acquisition_quarter,
                  customer_segment,
                  AVG(lifetime_value) as avg_lifetime_value,
                  COUNT(*) as customer_count
                FROM shopify_enriched.int_shopify_customer_dim
                GROUP BY acquisition_quarter, customer_segment
                ORDER BY acquisition_quarter ASC, customer_segment ASC
                """,
    },
    # Test 17: Revenue by signup cohort and churn timing
    {
        "description": "Revenue analysis by signup cohort and churn timing",
        "message": "Analyze average revenue by signup month and churn cohort. Group by the calendar month the subscription started and by churn cohort. Calculate the average total revenue generated and count customers for each combination. Return signup month, churn cohort, average revenue, and customer count. Order by signup month ascending, then churn cohort ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_churn_fact table
                * The query should group by both signup month (using DATE_TRUNC('month', subscription_start_date) or equivalent) and churn_cohort
                * The query should calculate average revenue using AVG(total_revenue_generated)
                * The query should count customers in each cohort-category combination using COUNT(*)
                * The query should order by signup month chronologically (ascending), then by churn_cohort alphabetically
                * The query should include signup month, churn cohort, average revenue, and customer count columns
                """,
        "reference_query": """
                SELECT DATE_TRUNC('month', subscription_start_date)::date as signup_month,
                       churn_cohort,
                       AVG(total_revenue_generated) as avg_revenue,
                       COUNT(*) as customer_count
                FROM stripe_enriched.int_stripe_churn_fact
                GROUP BY signup_month, churn_cohort
                ORDER BY signup_month ASC, churn_cohort ASC
                """,
    },
    # Test 18: Value tier composition of each acquisition cohort
    {
        "description": "Value tier composition of each acquisition cohort",
        "message": "Calculate value tier distribution within each acquisition quarter cohort. Group customers by the calendar quarter they were created and by value tier. Count customers in each combination and calculate the percentage within each cohort (so percentages sum to 100% within each quarter). Return acquisition quarter, value tier, customer count, and percentage. Order by acquisition quarter ascending, then value tier ascending.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_customer_dim table
                * The query should group by both acquisition quarter (using DATE_TRUNC('quarter', customer_created_at) or equivalent) and value_tier
                * The query should count customers in each cohort-tier combination using COUNT(*)
                * The query should calculate percentage of customers in each tier within the cohort (percentage should sum to 100% within each quarter)
                * The query should order by acquisition quarter chronologically (ascending), then by value_tier alphabetically
                * The query should include acquisition quarter, value tier, customer count, and percentage columns
                """,
        "reference_query": """
                SELECT DATE_TRUNC('quarter', customer_created_at)::date as acquisition_quarter,
                       value_tier,
                       COUNT(*) as customer_count,
                       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY DATE_TRUNC('quarter', customer_created_at)::date), 2) as percentage
                FROM shopify_enriched.int_shopify_customer_dim
                GROUP BY acquisition_quarter, value_tier
                ORDER BY acquisition_quarter ASC, value_tier ASC
                """,
    },
]
