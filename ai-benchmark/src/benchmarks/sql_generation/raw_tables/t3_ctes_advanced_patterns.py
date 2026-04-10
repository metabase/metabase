"""
Tier 3: Common Table Expressions (CTEs) and Advanced Pattern SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
CTEs and complex multi-step patterns:
- Common Table Expressions (WITH clauses)
- Multi-CTE chains
- Recursive patterns
- Complex analytical pipelines
- Cohort analysis
- Funnel analysis
"""

# NOTE: Test "Customers who received emails then placed orders within 7 days" (L15)
# was NOT ported due to data issue: There is no email overlap between Customer.io
# customers and Shopify customers in the benchmark database, so the query always
# returns 0 rows. This test needs to be redesigned or the data needs to be fixed.

# Test 1: Sales funnel conversion
sales_funnel_conversion = {
    "description": "Full sales funnel from leads to revenue",
    "message": "Build a full sales funnel showing the progression from leads to revenue. Include four stages: Total Leads (count all leads), Leads Converted (count converted leads), Opportunities Won (count and sum amounts for won opportunities), and Revenue Generated (count distinct paying customers and sum paid invoice amounts). For stages without amounts, show 0. Return stage, count, and amount. Order by funnel sequence from top to bottom.",
    "table_names": [
        "salesforce_data.lead",
        "salesforce_data.opportunity",
        "stripe_data.invoice",
    ],
    "query_description": """
* The query should use CTEs (WITH clauses) to create a funnel analysis
* The query should use salesforce_data.lead, salesforce_data.opportunity, and stripe_data.invoice tables
* The query should create separate stages for: Total Leads, Leads Converted, Opportunities Won, Revenue Generated
* The query should count total leads from salesforce_data.lead
* The query should count converted leads (WHERE is_converted = true)
* The query should count won opportunities (WHERE is_won = true) and sum their amounts
* The query should count distinct customers from paid invoices (WHERE paid = true) and sum amount_paid
* For stages without amounts (Total Leads, Leads Converted), the amount should be 0
* The query should combine all stages using UNION ALL
* The query should order the results by funnel stage sequence (Total Leads first, Revenue Generated last)
* The query should include stage name, count, and amount columns
    """,
    "reference_query": """
WITH funnel_stages AS (
  SELECT
    'Total Leads' AS stage,
    COUNT(*) AS count,
    0::numeric AS amount
  FROM salesforce_data.lead

  UNION ALL

  SELECT
    'Leads Converted' AS stage,
    COUNT(*) AS count,
    0::numeric AS amount
  FROM salesforce_data.lead
  WHERE is_converted = true

  UNION ALL

  SELECT
    'Opportunities Won' AS stage,
    COUNT(*) AS count,
    SUM(amount) AS amount
  FROM salesforce_data.opportunity
  WHERE is_won = true

  UNION ALL

  SELECT
    'Revenue Generated' AS stage,
    COUNT(DISTINCT customer_id) AS count,
    SUM(amount_paid) AS amount
  FROM stripe_data.invoice
  WHERE paid = true
)
SELECT stage, count, amount
FROM funnel_stages
ORDER BY
  CASE stage
    WHEN 'Total Leads' THEN 1
    WHEN 'Leads Converted' THEN 2
    WHEN 'Opportunities Won' THEN 3
    WHEN 'Revenue Generated' THEN 4
  END
    """,
}

# Test 2: Cohort retention analysis
cohort_retention_analysis = {
    "description": "Monthly subscription cohorts and retention",
    "message": "Analyze monthly subscription cohort retention. Join subscription to customer tables. Group subscriptions by the month they were created. For each cohort month, count total subscriptions, count those still active, and calculate the retention rate as a percentage. Return cohort month, total subscriptions, still active, and retention rate. Order by cohort month ascending.",
    "table_names": ["stripe_data.subscription", "stripe_data.customer"],
    "query_description": """
* The query should use CTEs (WITH clause) to organize the cohort analysis
* The query should use stripe_data.subscription and stripe_data.customer tables
* The query should join subscription to customer on customer_id
* The query should group subscriptions by cohort_month (DATE_TRUNC('month', created))
* The query should count total subscriptions per cohort
* The query should count active subscriptions per cohort (WHERE status = 'active')
* The query should calculate retention_rate as percentage of active subscriptions
* The query should order by cohort_month ascending
* The query should include cohort_month, total_subscriptions, still_active, and retention_rate columns
    """,
    "reference_query": """
WITH subscription_cohorts AS (
  SELECT
    s.customer_id,
    DATE_TRUNC('month', s.created) AS cohort_month,
    s.status,
    c.email,
    c.name AS customer_name
  FROM stripe_data.subscription s
  JOIN stripe_data.customer c ON s.customer_id = c.id
)
SELECT
  cohort_month,
  COUNT(*) AS total_subscriptions,
  COUNT(*) FILTER (WHERE status = 'active') AS still_active,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'active') / COUNT(*), 2) AS retention_rate
FROM subscription_cohorts
GROUP BY cohort_month
ORDER BY cohort_month
    """,
}

# NOTE: Test "Customers in both Stripe and Shopify" (L161) was NOT ported due to
# data issue: There is 0 email overlap between stripe_data.customer and
# shopify_data.customer in the benchmark database, so the query always returns
# 0 rows. This test needs data to be fixed before it can be ported.

# Test 3: Revenue breakdown by customer acquisition source
# NOTE: Data limitation - there is 0 email overlap between Stripe and Shopify
# customers in the benchmark database, so this query always returns only
# "Stripe Only" customers. However, the test still validates CTE patterns and
# multi-table join logic.
revenue_breakdown_by_source = {
    "description": "Revenue breakdown by customer acquisition source",
    "message": "Break down Stripe revenue by customer acquisition source. Left join Stripe customers to Shopify customers on email to classify them as 'Multi-Channel (Stripe + Shopify)' if they exist in both or 'Stripe Only' otherwise. Only include paid invoices. Calculate total revenue, customer count, invoice count, and average revenue per customer for each source. Return customer source, total revenue, customer count, invoice count, and average revenue per customer. Order by total revenue descending, using customer source ascending as a tiebreaker.",
    "table_names": ["stripe_data.customer", "stripe_data.invoice", "shopify_data.customer"],
    "query_description": """
* The query should use CTEs (WITH clauses) to organize the multi-stage analysis
* The query should use stripe_data.customer, stripe_data.invoice, and shopify_data.customer tables
* The query should classify Stripe customers by checking if their email exists in Shopify
* The query should join Stripe customers to Shopify customers on email (LEFT JOIN to include Stripe-only)
* The query should create customer_source categories like 'Multi-Channel (Stripe + Shopify)' and 'Stripe Only'
* The query should join invoices to customer classification on customer_id
* The query should filter for paid invoices (WHERE paid = true)
* The query should group by customer_source
* The query should calculate: total_revenue (SUM of amount_paid), customer_count (COUNT DISTINCT customer_id), invoice_count (COUNT of invoice id), avg_revenue_per_customer (total_revenue / customer_count)
* The query should order by total_revenue descending, customer_source ascending as tiebreaker
    """,
    "reference_query": """
WITH customer_classification AS (
  SELECT
    sc.id AS stripe_customer_id,
    sc.email,
    CASE
      WHEN shc.email IS NOT NULL THEN 'Multi-Channel (Stripe + Shopify)'
      ELSE 'Stripe Only'
    END AS customer_source
  FROM stripe_data.customer sc
  LEFT JOIN shopify_data.customer shc ON sc.email = shc.email
),
revenue_by_source AS (
  SELECT
    cc.customer_source,
    SUM(i.amount_paid) AS total_revenue,
    COUNT(DISTINCT i.customer_id) AS customer_count,
    COUNT(i.id) AS invoice_count
  FROM stripe_data.invoice i
  JOIN customer_classification cc ON i.customer_id = cc.stripe_customer_id
  WHERE i.paid = true
  GROUP BY cc.customer_source
)
SELECT
  customer_source,
  total_revenue,
  customer_count,
  invoice_count,
  ROUND(total_revenue::numeric / NULLIF(customer_count, 0), 2) AS avg_revenue_per_customer
FROM revenue_by_source
ORDER BY total_revenue DESC, customer_source ASC
    """,
}

# Test 4: Customer lifetime value with ranking
customer_lifetime_value_ranking = {
    "description": "Customer lifetime value with ranking",
    "message": "Calculate and rank Stripe customers by lifetime value. Left join customer to paid invoices. For each customer, calculate their lifetime value as the sum of amount paid (using zero for customers with no invoices) and count their invoices. Rank customers by lifetime value descending. Only show the top 10 customers by rank. Return rank, customer id, email, name, lifetime value, and invoice count. Order by rank ascending.",
    "table_names": ["stripe_data.customer", "stripe_data.invoice"],
    "query_description": """
* The query should use CTEs (WITH clauses) to organize the multi-stage calculation
* The query should use stripe_data.customer and stripe_data.invoice tables
* The query should join customers to invoices on customer_id (LEFT JOIN to include customers with no invoices)
* The query should filter for paid invoices (WHERE paid = true) in the join or aggregation
* The query should group by customer (customer.id, email, name, created)
* The query should calculate lifetime_value as SUM of amount_paid (using COALESCE for customers with no invoices)
* The query should count invoices per customer
* The query should use RANK() window function ordered by lifetime_value descending
* The query should filter to show only customers with rank <= 10
* The query should order by rank ascending
* The query should include columns: clv_rank, customer_id, email, name, lifetime_value, invoice_count
    """,
    "reference_query": """
WITH customer_lifetime_value AS (
  SELECT
    c.id AS customer_id,
    c.email,
    c.name,
    c.created,
    COALESCE(SUM(i.amount_paid), 0) AS lifetime_value,
    COUNT(i.id) AS invoice_count
  FROM stripe_data.customer c
  LEFT JOIN stripe_data.invoice i ON c.id = i.customer_id AND i.paid = true
  GROUP BY c.id, c.email, c.name, c.created
),
ranked_customers AS (
  SELECT
    customer_id,
    email,
    name,
    lifetime_value,
    invoice_count,
    RANK() OVER (ORDER BY lifetime_value DESC) AS clv_rank
  FROM customer_lifetime_value
)
SELECT
  clv_rank,
  customer_id,
  email,
  name,
  lifetime_value,
  invoice_count
FROM ranked_customers
WHERE clv_rank <= 10
ORDER BY clv_rank ASC
    """,
}

# Test 5: Product performance metrics with multiple stages
product_performance_metrics = {
    "description": "Product performance metrics with multiple stages",
    "message": "Show product performance metrics with percentage of total company revenue. First calculate the company's total revenue from all order lines. Then for each product, calculate its revenue as sum of price times quantity, count distinct orders, and count line items. Calculate each product's percentage of total revenue. Return product id, product name, product type, product revenue, order count, line item count, and percentage of total revenue. Order by product revenue descending, using product id ascending as a tiebreaker.",
    "table_names": ["shopify_data.product", "shopify_data.order_line"],
    "query_description": """
* The query should use CTEs (WITH clauses) to organize the multi-stage calculation
* The query should use shopify_data.product and shopify_data.order_line tables
* The query should join product to order_line on product.id = order_line.product_id
* The query should create a CTE to calculate total company revenue (SUM of price * quantity from all order_lines)
* The query should create a CTE to calculate per-product metrics (product revenue, order count, line item count)
* The query should group by product (product.id, product.title, product.product_type)
* The query should calculate product_revenue as SUM(price * quantity)
* The query should count distinct orders per product (COUNT DISTINCT order_id)
* The query should count line items per product (COUNT of order_line id)
* The query should calculate percentage of total revenue (product_revenue / company_total_revenue * 100)
* The query should use CROSS JOIN or similar to combine product metrics with company total
* The query should order by product_revenue descending, product_id ascending as tiebreaker
* The query should include columns: product_id, product_name, product_type, product_revenue, order_count, line_item_count, pct_of_total_revenue
    """,
    "reference_query": """
WITH total_revenue AS (
  SELECT SUM(price * quantity) AS company_total_revenue
  FROM shopify_data.order_line
),
product_performance AS (
  SELECT
    p.id AS product_id,
    p.title AS product_name,
    p.product_type,
    SUM(ol.price * ol.quantity) AS product_revenue,
    COUNT(DISTINCT ol.order_id) AS order_count,
    COUNT(ol.id) AS line_item_count
  FROM shopify_data.product p
  JOIN shopify_data.order_line ol ON p.id = ol.product_id
  GROUP BY p.id, p.title, p.product_type
)
SELECT
  product_id,
  product_name,
  product_type,
  product_revenue,
  order_count,
  line_item_count,
  ROUND(100.0 * product_revenue / tr.company_total_revenue, 2) AS pct_of_total_revenue
FROM product_performance pp
CROSS JOIN total_revenue tr
ORDER BY product_revenue DESC, product_id ASC
    """,
}

# Test 6: Find orphaned records across related tables
# NOTE: Data quality - the benchmark database has no orphaned opportunities
# (all opportunity.account_id values reference valid accounts), so this query
# returns 0 rows. However, the test is still valuable for validating the SQL
# pattern (LEFT JOIN with WHERE IS NULL for finding orphaned records).
find_orphaned_opportunities = {
    "description": "Find orphaned records across related tables",
    "message": "Find orphaned Salesforce opportunities that reference non-existent accounts. Left join opportunity to account tables and filter for records where no matching account exists. Return opportunity id, opportunity name, the missing account id value, stage name, amount, and close date. Order by created date descending.",
    "table_names": ["salesforce_data.opportunity", "salesforce_data.account"],
    "query_description": """
* The query should use CTEs (WITH clause) to organize the data quality check
* The query should use salesforce_data.opportunity and salesforce_data.account tables
* The query should use LEFT JOIN from opportunity to account on account_id
* The query should filter for orphaned records (WHERE account.id IS NULL)
* The query should include opportunity details: opportunity_id, opportunity_name, account_id (the missing one), stage_name, amount, close_date
* The query should order by created_date descending
    """,
    "reference_query": """
WITH orphaned_opportunities AS (
  SELECT
    o.id AS opportunity_id,
    o.name AS opportunity_name,
    o.account_id,
    o.stage_name,
    o.amount,
    o.close_date,
    o.created_date
  FROM salesforce_data.opportunity o
  LEFT JOIN salesforce_data.account a ON o.account_id = a.id
  WHERE a.id IS NULL
)
SELECT
  opportunity_id,
  opportunity_name,
  account_id AS missing_account_id,
  stage_name,
  amount,
  close_date
FROM orphaned_opportunities
ORDER BY created_date DESC
    """,
}

# Test 7: Department expense analysis with multiple calculation stages
department_expense_analysis = {
    "description": "Department expense analysis with multiple calculation stages",
    "message": "Analyze department expenses compared to company averages. First calculate the company-wide average expense and total expenses. Then for each department, calculate total expenses, average expense, and expense count. Left join to include departments with no expenses. Calculate each department's difference from the company average and percentage of total expenses. Return department name, total expenses, average expense, expense count, company average expense, difference from company average, and percentage of total expenses. Order by total expenses descending.",
    "table_names": ["brex_data.department", "brex_data.expense"],
    "query_description": """
* The query should use CTEs (WITH clauses) to organize the multi-stage calculation
* The query should use brex_data.department and brex_data.expense tables
* The query should create a CTE to calculate company-wide averages (average expense amount, total expenses)
* The query should create a CTE to calculate per-department metrics by joining department to expense
* The query should use LEFT JOIN from department to expense to include departments with no expenses
* The query should group by department (department.id, department.name)
* The query should calculate per-department: total_expenses (SUM of amount), avg_expense (AVG of amount), expense_count (COUNT of expenses)
* The query should use CROSS JOIN or similar to combine department metrics with company averages
* The query should calculate comparison metrics: difference from company average, percentage of total expenses
* The query should order by total_expenses descending
* The query should include columns: department_name, total_expenses, avg_expense, expense_count, company_avg_expense, diff_from_company_avg, pct_of_total_expenses
    """,
    "reference_query": """
WITH company_averages AS (
  SELECT
    AVG(amount) AS company_avg_expense,
    SUM(amount) AS company_total_expenses
  FROM brex_data.expense
),
department_expenses AS (
  SELECT
    d.id AS department_id,
    d.name AS department_name,
    SUM(e.amount) AS total_expenses,
    AVG(e.amount) AS avg_expense,
    COUNT(e.id) AS expense_count
  FROM brex_data.department d
  LEFT JOIN brex_data.expense e ON d.id = e.department_id
  GROUP BY d.id, d.name
)
SELECT
  de.department_name,
  de.total_expenses,
  de.avg_expense,
  de.expense_count,
  ca.company_avg_expense,
  ROUND(de.avg_expense - ca.company_avg_expense, 2) AS diff_from_company_avg,
  ROUND(100.0 * de.total_expenses / NULLIF(ca.company_total_expenses, 0), 2) AS pct_of_total_expenses
FROM department_expenses de
CROSS JOIN company_averages ca
ORDER BY de.total_expenses DESC
    """,
}

# Test 8: Monthly customer cohorts with purchase retention
monthly_cohorts_purchase_retention = {
    "description": "Monthly customer cohorts with purchase retention",
    "message": "Analyze customer repeat purchase behavior by monthly cohorts. First identify each customer's first order date and assign them to a monthly cohort. Then count each customer's subsequent orders after their first purchase. Finally, for each cohort month calculate total customers, customers with repeat purchases (those with at least one subsequent order), and the repeat purchase rate as a percentage. Return cohort month, total customers, customers with repeat purchases, and repeat purchase rate. Order by cohort month ascending.",
    "table_names": ["shopify_data.customer", "shopify_data.order"],
    "query_description": """
* The query should use CTEs (WITH clauses) to organize the cohort analysis
* The query should use shopify_data.customer and shopify_data.order tables
* The query should create a CTE to identify each customer's first order date and cohort month
* The query should join customer to order on customer_id
* The query should use DATE_TRUNC('month', ...) to group customers into monthly cohorts based on first order
* The query should create a CTE to count subsequent orders (orders after the first order)
* The query should use COUNT with FILTER or CASE to count customers with repeat purchases (subsequent_order_count > 0)
* The query should group by cohort_month in the final aggregation
* The query should calculate: total_customers (COUNT per cohort), customers_with_repeat_purchases (COUNT with filter), repeat_purchase_rate (percentage)
* The query should order by cohort_month ascending
* The query should include columns: cohort_month, total_customers, customers_with_repeat_purchases, repeat_purchase_rate
    """,
    "reference_query": """
WITH customer_first_order AS (
  SELECT
    c.id AS customer_id,
    c.email,
    DATE_TRUNC('month', MIN(o.created_at)) AS cohort_month,
    MIN(o.created_at) AS first_order_date
  FROM shopify_data.customer c
  JOIN shopify_data."order" o ON c.id = o.customer_id
  GROUP BY c.id, c.email
),
repeat_purchases AS (
  SELECT
    cfo.customer_id,
    cfo.cohort_month,
    COUNT(o.id) FILTER (WHERE o.created_at > cfo.first_order_date) AS subsequent_order_count
  FROM customer_first_order cfo
  JOIN shopify_data."order" o ON cfo.customer_id = o.customer_id
  GROUP BY cfo.customer_id, cfo.cohort_month
)
SELECT
  cohort_month,
  COUNT(*) AS total_customers,
  COUNT(*) FILTER (WHERE subsequent_order_count > 0) AS customers_with_repeat_purchases,
  ROUND(100.0 * COUNT(*) FILTER (WHERE subsequent_order_count > 0) / COUNT(*), 2) AS repeat_purchase_rate
FROM repeat_purchases
GROUP BY cohort_month
ORDER BY cohort_month
    """,
}

# Test 9: Lead-to-opportunity conversion funnel by source
# NOTE: Data quality issue - converted_opportunity_id values in lead table do not
# match any id values in opportunity table (referential integrity bug in benchmark data).
# As a result, all total_opp_value and avg_opp_amount will be 0. However, the test
# is still valuable for validating CTE patterns, multi-stage aggregation, and funnel
# analysis logic.
lead_opportunity_conversion_by_source = {
    "description": "Lead-to-opportunity conversion funnel by source",
    "message": "Analyze lead-to-opportunity conversion by source. First calculate lead statistics by source: count total leads and count those with a converted opportunity id. Only include leads where source is not null. Then join leads to opportunities to calculate total opportunity value and average amount per source. Combine lead and opportunity statistics. Calculate conversion rate as a percentage. Use zero for sources with no opportunity values. Only include sources with at least 5 total leads. Return source, total leads, converted to opportunity count, conversion rate percentage, total opportunity value, and average opportunity amount. Order by converted to opportunity count descending.",
    "table_names": ["salesforce_data.lead", "salesforce_data.opportunity"],
    "query_description": """
* The query should use CTEs (WITH clauses) to organize the multi-stage funnel analysis
* The query should use salesforce_data.lead and salesforce_data.opportunity tables
* The query should create a CTE to calculate lead-level statistics by source (total leads, converted leads)
* The query should filter WHERE source IS NOT NULL when calculating lead stats
* The query should group by source in the lead stats CTE
* The query should count total leads (COUNT(*)) and converted leads (COUNT(converted_opportunity_id))
* The query should create a CTE to calculate opportunity-level statistics by joining lead to opportunity
* The query should join lead to opportunity on converted_opportunity_id = opportunity.id
* The query should calculate opportunity metrics: count, total amount, average amount
* The query should combine lead and opportunity statistics (LEFT JOIN to include sources with no converted opportunities)
* The query should calculate conversion_rate_pct as percentage (100.0 * converted / total)
* The query should filter for sources with total_leads >= 5 in the final WHERE clause
* The query should order by converted_to_opp descending
* The query should include columns: source, total_leads, converted_to_opp, conversion_rate_pct, total_opp_value, avg_opp_amount
    """,
    "reference_query": """
WITH lead_stats AS (
    SELECT
        source,
        COUNT(*) as total_leads,
        COUNT(converted_opportunity_id) as converted_to_opp
    FROM salesforce_data.lead
    WHERE source IS NOT NULL
    GROUP BY source
),
opp_stats AS (
    SELECT
        l.source,
        COUNT(o.id) as opp_count,
        SUM(o.amount) as total_value,
        AVG(o.amount) as avg_amount
    FROM salesforce_data.lead l
    INNER JOIN salesforce_data.opportunity o ON l.converted_opportunity_id = o.id
    WHERE l.source IS NOT NULL
    GROUP BY l.source
)
SELECT
    ls.source,
    ls.total_leads,
    ls.converted_to_opp,
    ROUND(100.0 * ls.converted_to_opp / ls.total_leads, 2) as conversion_rate_pct,
    COALESCE(os.total_value, 0) as total_opp_value,
    ROUND(COALESCE(os.avg_amount, 0), 2) as avg_opp_amount
FROM lead_stats ls
LEFT JOIN opp_stats os ON ls.source = os.source
WHERE ls.total_leads >= 5
ORDER BY ls.converted_to_opp DESC
    """,
}

# Export test data and metadata for benchmark creation
TEST_DATA = [
    sales_funnel_conversion,
    cohort_retention_analysis,
    revenue_breakdown_by_source,
    customer_lifetime_value_ranking,
    product_performance_metrics,
    find_orphaned_opportunities,
    department_expense_analysis,
    monthly_cohorts_purchase_retention,
    lead_opportunity_conversion_by_source,
]
