"""
Tier 3: Multi-Fact Integration

This module tests the agent's ability to query across multiple fact tables
within the same data source using dict-based test data and centralized
test case building.
"""

TEST_DATA = [
    # =============================================================================
    # STRIPE: REVENUE + CHURN INTEGRATION
    # =============================================================================
    # Test 1: Side-by-side metrics from different facts
    {
        "description": "Monthly MRR and churn count together",
        "message": "Show monthly MRR and churn count side by side. Aggregate the total MRR by month from the revenue table, and count churned customers by month from the churn table. Combine both using a full outer join on the month so we see all months from either source. Return the month, total MRR, and churned customer count. Order by month ascending.",
        "table_names": [
            "stripe_enriched.int_stripe_monthly_revenue_fact",
            "stripe_enriched.int_stripe_churn_fact",
        ],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_monthly_revenue_fact and stripe_enriched.int_stripe_churn_fact tables
                * The query should calculate total MRR by month from the monthly_revenue_fact table using SUM(mrr_amount)
                * The query should count churned customers by month from the churn_fact table using COUNT(*)
                * The query should join or combine the two fact tables by month (month_start_date and churn_month)
                * The query should group by month
                * The query should order by month ascending
                * The query should include month, total MRR, and churned customer count columns
                """,
        "reference_query": """
                WITH monthly_mrr AS (
                    SELECT
                        month_start_date,
                        SUM(mrr_amount) as total_mrr
                    FROM stripe_enriched.int_stripe_monthly_revenue_fact
                    GROUP BY month_start_date
                ),
                monthly_churn AS (
                    SELECT
                        churn_month,
                        COUNT(*) as churned_customers
                    FROM stripe_enriched.int_stripe_churn_fact
                    WHERE churn_month IS NOT NULL
                    GROUP BY churn_month
                )
                SELECT
                    COALESCE(mr.month_start_date, mc.churn_month) as month,
                    mr.total_mrr,
                    mc.churned_customers
                FROM monthly_mrr mr
                FULL OUTER JOIN monthly_churn mc ON mr.month_start_date = mc.churn_month
                ORDER BY month ASC
                """,
    },
    # Test 2: Churn rate calculation using both facts
    {
        "description": "Churn rate from revenue and churn facts",
        "message": "Calculate monthly churn rate as a percentage. Count churned customers by month and count distinct active customers by month. Left join churn data to customer data by month. Calculate churn rate as churned divided by total customers, handling division by zero. Round to 2 decimal places. Order by month ascending.",
        "table_names": [
            "stripe_enriched.int_stripe_monthly_revenue_fact",
            "stripe_enriched.int_stripe_churn_fact",
        ],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_monthly_revenue_fact and stripe_enriched.int_stripe_churn_fact tables
                * The query should count total customers by month from monthly_revenue_fact table using COUNT(DISTINCT customer_id)
                * The query should count churned customers by month from churn_fact table using COUNT(*)
                * The query should calculate churn rate as (churned_customers / total_customers) * 100
                * The query should join or combine the two fact tables by month (month_start_date and churn_month)
                * The query should group by month
                * The query should order by month ascending
                * The query should include month, churned customers, total customers, and churn rate percentage columns
                """,
        "reference_query": """
                WITH monthly_churn AS (
                    SELECT
                        churn_month,
                        COUNT(*) as churned_customers
                    FROM stripe_enriched.int_stripe_churn_fact
                    WHERE churn_month IS NOT NULL
                    GROUP BY churn_month
                ),
                monthly_customers AS (
                    SELECT
                        month_start_date,
                        COUNT(DISTINCT customer_id) as total_customers
                    FROM stripe_enriched.int_stripe_monthly_revenue_fact
                    GROUP BY month_start_date
                )
                SELECT
                    mc.month_start_date as month,
                    COALESCE(ch.churned_customers, 0) as churned_customers,
                    mc.total_customers,
                    ROUND(
                        COALESCE(ch.churned_customers, 0)::numeric / NULLIF(mc.total_customers, 0)::numeric * 100,
                        2
                    ) as churn_rate_percent
                FROM monthly_customers mc
                LEFT JOIN monthly_churn ch ON mc.month_start_date = ch.churn_month
                ORDER BY mc.month_start_date ASC
                """,
    },
    # Test 3: Churned revenue impact
    {
        "description": "Total revenue lost to churn by month",
        "message": "Calculate monthly revenue lost to churned customers. Exclude records with null churn months. Group by churn month and count the number of churned customers and sum their total revenue generated. Return the churn month, churned customer count, and total revenue lost. Order by churn month ascending.",
        "table_names": ["stripe_enriched.int_stripe_churn_fact"],
        "query_description": """
                * The query should use stripe_enriched.int_stripe_churn_fact table
                * The query should group by churn_month
                * The query should calculate total revenue lost by summing total_revenue_generated
                * The query should filter WHERE churn_month IS NOT NULL
                * The query should order by churn_month ascending
                * The query should include churn_month and total revenue lost columns
                """,
        "reference_query": """
                SELECT
                    churn_month,
                    COUNT(*) as churned_customers,
                    SUM(total_revenue_generated) as total_revenue_lost
                FROM stripe_enriched.int_stripe_churn_fact
                WHERE churn_month IS NOT NULL
                GROUP BY churn_month
                ORDER BY churn_month ASC
                """,
    },
    # =============================================================================
    # SHOPIFY: ORDERS + REFUNDS + FULFILLMENT INTEGRATION
    # =============================================================================
    # Test 4: Net revenue calculation
    {
        "description": "Revenue minus refunds",
        "message": "Calculate monthly net revenue after refunds. Aggregate gross revenue by calendar month from the orders table, and aggregate refund amounts by calendar month from the refunds table. Combine both using a full outer join on month. Calculate net revenue as gross minus refunds. Order by month ascending.",
        "table_names": [
            "shopify_enriched.int_shopify_order_facts",
            "shopify_enriched.int_shopify_refund_facts",
        ],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_facts and shopify_enriched.int_shopify_refund_facts tables
                * The query should aggregate revenue by month from order_facts using SUM(total_price) or equivalent
                * The query should aggregate refunds by month from refund_facts using SUM(total_refund_amount) or equivalent
                * The query should calculate net revenue as (gross revenue - refunds)
                * The query should join or combine the two fact tables by month (using DATE_TRUNC or similar on order_created_at and refund_created_at)
                * The query should group by month
                * The query should order by month ascending
                * The query should include month, gross revenue, total refunds, and net revenue columns
                """,
        "reference_query": """
                WITH monthly_orders AS (
                    SELECT
                        DATE_TRUNC('month', order_created_at)::date as month,
                        SUM(total_price) as gross_revenue
                    FROM shopify_enriched.int_shopify_order_facts
                    GROUP BY month
                ),
                monthly_refunds AS (
                    SELECT
                        DATE_TRUNC('month', refund_created_at)::date as month,
                        SUM(total_refund_amount) as total_refunds
                    FROM shopify_enriched.int_shopify_refund_facts
                    GROUP BY month
                )
                SELECT
                    COALESCE(o.month, r.month) as month,
                    COALESCE(o.gross_revenue, 0) as gross_revenue,
                    COALESCE(r.total_refunds, 0) as total_refunds,
                    COALESCE(o.gross_revenue, 0) - COALESCE(r.total_refunds, 0) as net_revenue
                FROM monthly_orders o
                FULL OUTER JOIN monthly_refunds r ON o.month = r.month
                ORDER BY month ASC
                """,
    },
    # Test 5: Refund rate analysis
    {
        "description": "Percentage of orders with refunds",
        "message": "Calculate the overall refund rate for Shopify orders. Left join orders to refunds on order id to identify which orders have refunds. Calculate the refund rate as orders with refunds divided by total orders, expressed as a percentage. Round to 2 decimal places. Return total orders, orders with refunds, and refund rate percentage.",
        "table_names": [
            "shopify_enriched.int_shopify_order_facts",
            "shopify_enriched.int_shopify_refund_facts",
        ],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_facts and shopify_enriched.int_shopify_refund_facts tables
                * The query should join order_facts to refund_facts on order_id (LEFT JOIN to include all orders)
                * The query should count total orders using COUNT(*) or COUNT(DISTINCT order_id)
                * The query should count orders with refunds (either by checking refund_id IS NOT NULL or similar logic)
                * The query should calculate refund rate as (orders_with_refunds / total_orders) * 100
                * The query should return total orders, orders with refunds, and refund rate percentage
                """,
        "reference_query": """
                WITH order_refund_status AS (
                    SELECT
                        o.order_id,
                        CASE WHEN r.refund_id IS NOT NULL THEN 1 ELSE 0 END as has_refund
                    FROM shopify_enriched.int_shopify_order_facts o
                    LEFT JOIN shopify_enriched.int_shopify_refund_facts r ON o.order_id = r.order_id
                )
                SELECT
                    COUNT(*) as total_orders,
                    SUM(has_refund) as orders_with_refunds,
                    ROUND(SUM(has_refund)::numeric / COUNT(*)::numeric * 100, 2) as refund_rate_percent
                FROM order_refund_status
                """,
    },
    # Test 6: Fulfillment completion rate
    {
        "description": "Order fulfillment completion rate",
        "message": "Calculate the order fulfillment rate for Shopify. Count total orders and count orders where fulfillment status is 'fulfilled'. Calculate fulfillment rate as fulfilled orders divided by total orders, expressed as a percentage. Round to 2 decimal places. Return total orders, fulfilled orders, and fulfillment rate percentage.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use shopify_enriched.int_shopify_order_facts table
                * The query should count total orders using COUNT(*)
                * The query should count fulfilled orders by filtering or counting WHERE fulfillment_status = 'fulfilled'
                * The query should calculate fulfillment rate as (fulfilled_orders / total_orders) * 100
                * The query should return total orders, fulfilled orders, and fulfillment rate percentage
                """,
        "reference_query": """
                SELECT
                    COUNT(*) as total_orders,
                    COUNT(CASE WHEN fulfillment_status = 'fulfilled' THEN 1 END) as fulfilled_orders,
                    ROUND(
                        COUNT(CASE WHEN fulfillment_status = 'fulfilled' THEN 1 END)::numeric / COUNT(*)::numeric * 100,
                        2
                    ) as fulfillment_rate_percent
                FROM shopify_enriched.int_shopify_order_facts
                """,
    },
    # =============================================================================
    # SALESFORCE: OPPORTUNITIES + LEADS INTEGRATION
    # =============================================================================
    # Test 7: End-to-end pipeline metrics
    {
        "description": "Total leads vs. total opportunities",
        "message": "Compare total lead count versus total opportunity count in Salesforce. Count all leads from the lead conversion table and count all opportunities from the opportunity table. Combine the two counts into a single result. Return total leads and total opportunities.",
        "table_names": [
            "salesforce_enriched.int_salesforce_lead_conversion_facts",
            "salesforce_enriched.int_salesforce_opportunity_facts",
        ],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_lead_conversion_facts and salesforce_enriched.int_salesforce_opportunity_facts tables
                * The query should count total leads from lead_conversion_facts using COUNT(*)
                * The query should count total opportunities from opportunity_facts using COUNT(*)
                * The query should return both counts in a single result (can use UNION ALL, subqueries, or CTEs)
                * The query should show lead count and opportunity count for comparison
                """,
        "reference_query": """
                WITH lead_count AS (
                    SELECT COUNT(*) as total_leads
                    FROM salesforce_enriched.int_salesforce_lead_conversion_facts
                ),
                opportunity_count AS (
                    SELECT COUNT(*) as total_opportunities
                    FROM salesforce_enriched.int_salesforce_opportunity_facts
                )
                SELECT
                    l.total_leads,
                    o.total_opportunities
                FROM lead_count l, opportunity_count o
                """,
    },
    # Test 8: Pipeline value tracking
    {
        "description": "Pipeline value from converted leads",
        "message": "Calculate total Salesforce pipeline value. Count all opportunities, sum the opportunity amounts, and calculate the average opportunity value. Return total opportunities, total pipeline value, and average opportunity value.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should calculate total pipeline value by summing opportunity_amount
                * The query should count total opportunities using COUNT(*)
                * The query should include both total opportunity value and count of opportunities
                """,
        "reference_query": """
                SELECT
                    COUNT(*) as total_opportunities,
                    SUM(opportunity_amount) as total_pipeline_value,
                    AVG(opportunity_amount) as average_opportunity_value
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                """,
    },
    # Test 9: Win rate by lead source
    {
        "description": "Win rate by lead source",
        "message": "Calculate opportunity win rate by lead source. Exclude opportunities with null lead sources. Group by lead source and count total opportunities and won opportunities (where is_won is true). Calculate win rate as a percentage, rounded to 2 decimal places. Order by win rate descending, using lead source ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group by lead_source
                * The query should count total opportunities per lead source using COUNT(*)
                * The query should count won opportunities using COUNT(CASE WHEN is_won = true) or SUM(CASE WHEN is_won = true)
                * The query should calculate win rate as (won_opportunities / total_opportunities) * 100
                * The query should filter WHERE lead_source IS NOT NULL
                * The query should order by win_rate descending, lead_source ascending as tiebreaker
                * The query should include lead_source, total opportunities, won opportunities, and win rate percentage columns
                """,
        "reference_query": """
                SELECT
                    lead_source,
                    COUNT(*) as total_opportunities,
                    COUNT(CASE WHEN is_won = true THEN 1 END) as won_opportunities,
                    ROUND(COUNT(CASE WHEN is_won = true THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as win_rate_percent
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                WHERE lead_source IS NOT NULL
                GROUP BY lead_source
                ORDER BY win_rate_percent DESC, lead_source ASC
                """,
    },
    # =============================================================================
    # QUICKBOOKS: INVOICES + PAYMENTS INTEGRATION
    # =============================================================================
    # Test 10: Accounts receivable balance
    {
        "description": "Total outstanding invoices",
        "message": "Calculate total accounts receivable from QuickBooks invoices. Sum the invoice amounts, paid amounts, and outstanding balances. Count total invoices and count invoices with outstanding balance greater than zero. Return total invoiced, total paid, total accounts receivable, total invoices, and count of invoices outstanding.",
        "table_names": ["quickbooks_enriched.int_quickbooks_invoice_facts"],
        "query_description": """
                * The query should use quickbooks_enriched.int_quickbooks_invoice_facts table
                * The query should calculate total accounts receivable by summing outstanding_balance
                * The query should optionally include total invoiced amount and total paid amount for context
                * The query should return aggregate metrics (not grouped by any dimension)
                """,
        "reference_query": """
                SELECT
                    SUM(invoice_amount) as total_invoiced,
                    SUM(paid_amount) as total_paid,
                    SUM(outstanding_balance) as total_accounts_receivable,
                    COUNT(*) as total_invoices,
                    COUNT(CASE WHEN outstanding_balance > 0 THEN 1 END) as invoices_outstanding
                FROM quickbooks_enriched.int_quickbooks_invoice_facts
                """,
    },
    # Test 11: Invoice vs payment amounts by customer
    {
        "description": "Invoice vs payment amounts by customer",
        "message": "Compare invoice totals versus payment totals by QuickBooks customer. Aggregate invoices by customer id, and aggregate payments by customer id. Combine using a full outer join on customer id to include all customers from either table. Calculate the balance as invoiced minus payments. Return customer id, customer name, total invoiced, total payments, and balance. Order by customer id ascending.",
        "table_names": [
            "quickbooks_enriched.int_quickbooks_invoice_facts",
            "quickbooks_enriched.int_quickbooks_payment_facts",
        ],
        "query_description": """
                * The query should use quickbooks_enriched.int_quickbooks_invoice_facts and quickbooks_enriched.int_quickbooks_payment_facts tables
                * The query should aggregate invoices by customer using SUM(invoice_amount) grouped by customer_id
                * The query should aggregate payments by customer using SUM(payment_amount) grouped by customer_id
                * The query should join or combine the two fact tables by customer_id (FULL OUTER JOIN to include all customers)
                * The query should include customer_id, customer_name, total invoiced, and total payments columns
                * The query should optionally calculate balance (invoiced - payments)
                * The query should order by customer_id ascending
                """,
        "reference_query": """
                WITH customer_invoices AS (
                    SELECT
                        customer_id,
                        customer_name,
                        SUM(invoice_amount) as total_invoiced
                    FROM quickbooks_enriched.int_quickbooks_invoice_facts
                    GROUP BY customer_id, customer_name
                ),
                customer_payments AS (
                    SELECT
                        customer_id,
                        customer_name,
                        SUM(payment_amount) as total_payments
                    FROM quickbooks_enriched.int_quickbooks_payment_facts
                    GROUP BY customer_id, customer_name
                )
                SELECT
                    COALESCE(i.customer_id, p.customer_id) as customer_id,
                    COALESCE(i.customer_name, p.customer_name) as customer_name,
                    COALESCE(i.total_invoiced, 0) as total_invoiced,
                    COALESCE(p.total_payments, 0) as total_payments,
                    COALESCE(i.total_invoiced, 0) - COALESCE(p.total_payments, 0) as balance
                FROM customer_invoices i
                FULL OUTER JOIN customer_payments p ON i.customer_id = p.customer_id
                ORDER BY customer_id ASC
                """,
    },
    # =============================================================================
    # GOOGLE ADWORDS: MULTI-LEVEL PERFORMANCE INTEGRATION
    # =============================================================================
    # Test 12: Top keywords by campaign
    {
        "description": "Top keywords by campaign",
        "message": "Find the top 3 keywords by conversions within each campaign. Sum conversions per keyword, then rank keywords within each campaign by conversion count descending, using keyword id as a tiebreaker. Keep only the top 3 per campaign. Return campaign id, campaign name, keyword id, keyword text, and total conversions. Order by campaign id ascending, then by conversions descending, then by keyword id ascending.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should aggregate conversions by keyword within each campaign using SUM(conversions)
                * The query should group by campaign_id, campaign_name, keyword_id, and keyword_text
                * The query should use window function ROW_NUMBER() or RANK() partitioned by campaign_id
                * The query should order by conversions descending within each campaign partition
                * The query should use keyword_id as tiebreaker for deterministic ordering
                * The query should filter to show only top 3 keywords per campaign (WHERE rank <= 3)
                * The query should include campaign_id, campaign_name, keyword_id, keyword_text, and total conversions columns
                * The query should order final results by campaign_id ascending, conversions descending, keyword_id ascending
                """,
        "reference_query": """
                WITH keyword_totals AS (
                    SELECT
                        campaign_id,
                        campaign_name,
                        keyword_id,
                        keyword_text,
                        SUM(conversions) as total_conversions
                    FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                    GROUP BY campaign_id, campaign_name, keyword_id, keyword_text
                ),
                ranked_keywords AS (
                    SELECT
                        campaign_id,
                        campaign_name,
                        keyword_id,
                        keyword_text,
                        total_conversions,
                        ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY total_conversions DESC, keyword_id ASC) as rank
                    FROM keyword_totals
                )
                SELECT
                    campaign_id,
                    campaign_name,
                    keyword_id,
                    keyword_text,
                    total_conversions
                FROM ranked_keywords
                WHERE rank <= 3
                ORDER BY campaign_id ASC, total_conversions DESC, keyword_id ASC
                """,
    },
    # Test 13: Campaign-level vs keyword-level cost per click
    {
        "description": "Campaign-level vs keyword-level cost per click",
        "message": "Compare campaign-level CPC versus keyword-level CPC for each campaign. Calculate campaign CPC as total cost divided by total clicks, handling division by zero. Calculate average keyword CPC by averaging the cost per click values. Round both to 4 decimal places. Return campaign id, campaign name, campaign-level CPC, and average keyword CPC. Order by campaign id ascending.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should calculate campaign-level CPC as SUM(cost) / SUM(clicks) grouped by campaign
                * The query should calculate keyword-level CPC as AVG(cost_per_click) grouped by campaign
                * The query should group by campaign_id and campaign_name
                * The query should include both campaign-level CPC and average keyword-level CPC for comparison
                * The query should order by campaign_id ascending
                * The query should include campaign_id, campaign_name, campaign_level_cpc, and avg_keyword_cpc columns
                """,
        "reference_query": """
                WITH campaign_cpc AS (
                    SELECT
                        campaign_id,
                        campaign_name,
                        SUM(cost) / NULLIF(SUM(clicks), 0) as campaign_level_cpc
                    FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                    GROUP BY campaign_id, campaign_name
                ),
                keyword_cpc AS (
                    SELECT
                        campaign_id,
                        campaign_name,
                        AVG(cost_per_click) as avg_keyword_cpc
                    FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                    GROUP BY campaign_id, campaign_name
                )
                SELECT
                    c.campaign_id,
                    c.campaign_name,
                    ROUND(c.campaign_level_cpc, 4) as campaign_cpc,
                    ROUND(k.avg_keyword_cpc, 4) as avg_keyword_cpc
                FROM campaign_cpc c
                JOIN keyword_cpc k ON c.campaign_id = k.campaign_id
                ORDER BY c.campaign_id ASC
                """,
    },
    # =============================================================================
    # BREX: EXPENSES + SPENDING SUMMARIES INTEGRATION
    # =============================================================================
    # Test 14: Department total reconciliation
    {
        "description": "Validate department totals match detail expenses",
        "message": "Reconcile department expense totals. Get summary totals by department and month from the spending summary table, and aggregate detail totals by department and calendar month from the expense detail table. Combine using a full outer join on department id and month. Return department id, department name, month, summary total, detail total, summary count, and detail count. Order by department id ascending, then by month ascending.",
        "table_names": [
            "brex_enriched.int_brex_expense_facts",
            "brex_enriched.int_brex_spending_by_department_facts",
        ],
        "query_description": """
                * The query should use brex_enriched.int_brex_expense_facts and brex_enriched.int_brex_spending_by_department_facts tables
                * The query should aggregate detail expenses by department and month using SUM(expense_amount) from expense_facts
                * The query should get summary totals by department and month from spending_by_department_facts using total_expenses
                * The query should join or combine the two fact tables by department_id and month
                * The query should group by department_id, department_name, and month
                * The query should include month from both tables (using DATE_TRUNC or similar for expense_facts)
                * The query should order by department_id ascending, then by month ascending
                * The query should include department_id, department_name, month, summary_total, and detail_total columns
                """,
        "reference_query": """
                WITH summary AS (
                    SELECT
                        department_id,
                        department_name,
                        DATE_TRUNC('month', spending_month)::date as month,
                        total_expenses as summary_total,
                        expense_count as summary_count
                    FROM brex_enriched.int_brex_spending_by_department_facts
                ),
                detail AS (
                    SELECT
                        department_id,
                        department_name,
                        DATE_TRUNC('month', expense_created_date)::date as month,
                        SUM(expense_amount) as detail_total,
                        COUNT(*) as detail_count
                    FROM brex_enriched.int_brex_expense_facts
                    GROUP BY department_id, department_name, month
                )
                SELECT
                    COALESCE(s.department_id, d.department_id) as department_id,
                    COALESCE(s.department_name, d.department_name) as department_name,
                    COALESCE(s.month, d.month) as month,
                    s.summary_total,
                    d.detail_total,
                    s.summary_count,
                    d.detail_count
                FROM summary s
                FULL OUTER JOIN detail d ON s.department_id = d.department_id AND s.month = d.month
                ORDER BY department_id ASC, month ASC
                """,
    },
    # Test 15: Top spenders within each department
    {
        "description": "Top spenders within each department",
        "message": "Find the top 3 spenders within each Brex department. Exclude records with null department id or null user id. Sum expenses by department and user, then rank users within each department by total spend descending, using user id as a tiebreaker. Keep only the top 3 per department. Return department id, department name, user id, user name, total spend, and rank. Order by department id ascending, then by total spend descending, then by user id ascending.",
        "table_names": ["brex_enriched.int_brex_expense_facts"],
        "query_description": """
                * The query should use brex_enriched.int_brex_expense_facts table
                * The query should aggregate expenses by user within each department using SUM(expense_amount)
                * The query should group by department_id, department_name, user_id, and user_name
                * The query should use window function ROW_NUMBER() or RANK() partitioned by department_id
                * The query should order by total spend descending within each department partition
                * The query should use user_id as tiebreaker for deterministic ordering
                * The query should filter to show only top 3 users per department (WHERE rank <= 3)
                * The query should filter WHERE department_id IS NOT NULL AND user_id IS NOT NULL
                * The query should include department_id, department_name, user_id, user_name, and total spend columns
                * The query should order final results by department_id ascending, total spend descending, user_id ascending
                """,
        "reference_query": """
                WITH user_dept_spending AS (
                    SELECT
                        department_id,
                        department_name,
                        user_id,
                        user_name,
                        SUM(expense_amount) as total_spend
                    FROM brex_enriched.int_brex_expense_facts
                    WHERE department_id IS NOT NULL AND user_id IS NOT NULL
                    GROUP BY department_id, department_name, user_id, user_name
                ),
                ranked AS (
                    SELECT
                        department_id,
                        department_name,
                        user_id,
                        user_name,
                        total_spend,
                        ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY total_spend DESC, user_id ASC) as rank
                    FROM user_dept_spending
                )
                SELECT
                    department_id,
                    department_name,
                    user_id,
                    user_name,
                    total_spend,
                    rank
                FROM ranked
                WHERE rank <= 3
                ORDER BY department_id ASC, total_spend DESC, user_id ASC
                """,
    },
    # =============================================================================
    # CUSTOMER.IO: DELIVERY + ENGAGEMENT INTEGRATION
    # =============================================================================
    # Test 16: Complete email engagement metrics
    {
        "description": "Complete email engagement metrics",
        "message": "Calculate complete email engagement metrics. Count total emails delivered, count how many were opened, and count how many were clicked. Calculate open rate as opened divided by delivered, click rate as clicked divided by delivered, and click-through rate as clicked divided by opened. Express all rates as percentages rounded to 2 decimal places. Return total delivered, total opened, total clicked, open rate, click rate, and click-through rate.",
        "table_names": ["customerio_enriched.int_customerio_engagement_facts"],
        "query_description": """
                * The query should use customerio_enriched.int_customerio_engagement_facts table
                * The query should count total deliveries using COUNT(*)
                * The query should count total opens using SUM(CASE WHEN was_opened) or COUNT(CASE WHEN was_opened)
                * The query should count total clicks using SUM(CASE WHEN was_clicked) or COUNT(CASE WHEN was_clicked)
                * The query should calculate open rate as (opened / delivered) * 100
                * The query should calculate click rate as (clicked / delivered) * 100
                * The query should return overall aggregate metrics (not grouped by any dimension)
                * The query should include total_delivered, total_opened, total_clicked, open_rate_percent, and click_rate_percent columns
                """,
        "reference_query": """
                SELECT
                    COUNT(*) as total_delivered,
                    SUM(CASE WHEN was_opened THEN 1 ELSE 0 END) as total_opened,
                    SUM(CASE WHEN was_clicked THEN 1 ELSE 0 END) as total_clicked,
                    ROUND(SUM(CASE WHEN was_opened THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as open_rate_percent,
                    ROUND(SUM(CASE WHEN was_clicked THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as click_rate_percent,
                    ROUND(SUM(CASE WHEN was_clicked THEN 1 ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN was_opened THEN 1 ELSE 0 END), 0) * 100, 2) as click_through_rate
                FROM customerio_enriched.int_customerio_engagement_facts
                """,
    },
    # Test 17: Engagement rates by campaign
    {
        "description": "Engagement rates by campaign",
        "message": "Calculate email engagement metrics by campaign. Group by campaign id and count delivered emails, count opened emails, and count clicked emails. Calculate open rate as opened divided by delivered, and click rate as clicked divided by delivered. Express rates as percentages rounded to 2 decimal places. Return campaign id, total delivered, total opened, total clicked, open rate percentage, and click rate percentage. Order by campaign id ascending.",
        "table_names": ["customerio_enriched.int_customerio_engagement_facts"],
        "query_description": """
                * The query should use customerio_enriched.int_customerio_engagement_facts table
                * The query should group by campaign_id
                * The query should count total deliveries per campaign using COUNT(*)
                * The query should count total opens per campaign using SUM(CASE WHEN was_opened) or COUNT(CASE WHEN was_opened)
                * The query should count total clicks per campaign using SUM(CASE WHEN was_clicked) or COUNT(CASE WHEN was_clicked)
                * The query should calculate open rate as (opened / delivered) * 100
                * The query should calculate click rate as (clicked / delivered) * 100
                * The query should order by campaign_id ascending
                * The query should include campaign_id, total deliveries, total opens, total clicks, open_rate_percent, and click_rate_percent columns
                """,
        "reference_query": """
                SELECT
                    campaign_id,
                    COUNT(*) as total_delivered,
                    SUM(CASE WHEN was_opened THEN 1 ELSE 0 END) as total_opened,
                    SUM(CASE WHEN was_clicked THEN 1 ELSE 0 END) as total_clicked,
                    ROUND(SUM(CASE WHEN was_opened THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as open_rate_percent,
                    ROUND(SUM(CASE WHEN was_clicked THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as click_rate_percent
                FROM customerio_enriched.int_customerio_engagement_facts
                GROUP BY campaign_id
                ORDER BY campaign_id ASC
                """,
    },
    # =============================================================================
    # CALENDLY: BOOKING + CANCELLATION INTEGRATION
    # =============================================================================
    # Test 18: Bookings vs cancellations by event type
    {
        "description": "Bookings vs cancellations by event type",
        "message": "Compare bookings versus cancellations by event type. Sum total bookings by event type from the booking funnel table, and count cancellations by event type from the cancellation table. Combine using a full outer join on event type name to include all event types from either source. Return event type name, total bookings, and total cancellations. Order by event type name ascending.",
        "table_names": [
            "calendly_enriched.int_calendly_booking_funnel_facts",
            "calendly_enriched.int_calendly_cancellation_facts",
        ],
        "query_description": """
                * The query should use calendly_enriched.int_calendly_booking_funnel_facts and calendly_enriched.int_calendly_cancellation_facts tables
                * The query should aggregate total bookings by event type from booking_funnel_facts using SUM(total_bookings)
                * The query should count total cancellations by event type from cancellation_facts using COUNT(*)
                * The query should join or combine the two fact tables by event_type_name (FULL OUTER JOIN to include all event types)
                * The query should group by event_type_name
                * The query should order by event_type_name ascending
                * The query should include event_type_name, total_bookings, and total_cancellations columns
                """,
        "reference_query": """
                WITH bookings AS (
                    SELECT
                        event_type_name,
                        SUM(total_bookings) as total_bookings
                    FROM calendly_enriched.int_calendly_booking_funnel_facts
                    GROUP BY event_type_name
                ),
                cancellations AS (
                    SELECT
                        event_type_name,
                        COUNT(*) as total_cancellations
                    FROM calendly_enriched.int_calendly_cancellation_facts
                    GROUP BY event_type_name
                )
                SELECT
                    COALESCE(b.event_type_name, c.event_type_name) as event_type_name,
                    COALESCE(b.total_bookings, 0) as total_bookings,
                    COALESCE(c.total_cancellations, 0) as total_cancellations
                FROM bookings b
                FULL OUTER JOIN cancellations c ON b.event_type_name = c.event_type_name
                ORDER BY event_type_name ASC
                """,
    },
    # Test 19: Net meeting completion rate
    {
        "description": "Net meeting completion rate",
        "message": "Calculate the overall meeting completion rate. Sum total bookings, active bookings, and canceled bookings across all records. Calculate completion rate as active bookings divided by total bookings, handling division by zero. Express as a percentage rounded to 2 decimal places. Return total bookings, meetings completed, meetings canceled, and completion rate percentage.",
        "table_names": ["calendly_enriched.int_calendly_booking_funnel_facts"],
        "query_description": """
                * The query should use calendly_enriched.int_calendly_booking_funnel_facts table
                * The query should calculate total bookings using SUM(total_bookings)
                * The query should calculate meetings completed using SUM(active_bookings) or (total_bookings - canceled_bookings)
                * The query should calculate completion rate as (meetings_completed / total_bookings) * 100
                * The query should return overall aggregate metrics (not grouped by any dimension)
                * The query should include total_bookings, meetings_completed, and completion_rate_percent columns
                """,
        "reference_query": """
                SELECT
                    SUM(total_bookings) as total_bookings,
                    SUM(active_bookings) as meetings_completed,
                    SUM(canceled_bookings) as meetings_canceled,
                    ROUND(
                        SUM(active_bookings)::numeric / NULLIF(SUM(total_bookings), 0) * 100,
                        2
                    ) as completion_rate_percent
                FROM calendly_enriched.int_calendly_booking_funnel_facts
                """,
    },
]
