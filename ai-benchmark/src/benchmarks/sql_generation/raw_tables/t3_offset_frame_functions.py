"""
Tier 3: Window Offset and Frame Functions SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
offset and frame-based window functions:
- LAG/LEAD for comparing rows
- Running totals (cumulative SUM)
- Moving averages
- Frame specifications (ROWS BETWEEN)
"""

# Test 1: Running total (cumulative sum)
cumulative_revenue_by_month = {
    "description": "Cumulative revenue by month from Stripe",
    "message": "Calculate cumulative Stripe invoice revenue by month. Group by calendar month. Calculate monthly revenue as the sum of amount due, then calculate a running total of cumulative revenue. Return month, monthly revenue, and cumulative revenue. Order by month ascending.",
    "table_names": ["stripe_data.invoice"],
    "query_description": """
* The query should use the stripe_data.invoice table
* The query should aggregate revenue by month using DATE_TRUNC('month', created) or equivalent
* The query should calculate monthly revenue using SUM(amount_due)
* The query should calculate cumulative revenue using a window function with running total (SUM with ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW or equivalent)
* The query should order by month ascending
* The query should include month, monthly revenue, and cumulative revenue columns
    """,
    "reference_query": """
WITH monthly_revenue AS (
  SELECT
    DATE_TRUNC('month', created) as month,
    SUM(amount_due) as monthly_revenue
  FROM stripe_data.invoice
  GROUP BY DATE_TRUNC('month', created)
)
SELECT
  month,
  monthly_revenue,
  SUM(monthly_revenue) OVER (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as cumulative_revenue
FROM monthly_revenue
ORDER BY month
    """,
}

# Test 2: LAG function for period-over-period comparison
month_over_month_revenue_growth = {
    "description": "Month-over-month revenue growth percentage",
    "message": "Calculate month-over-month Stripe revenue growth. Group by calendar month and calculate monthly revenue as sum of amount due. Include the previous month's revenue and calculate growth percentage as the difference divided by the previous month, times 100, handling division by zero. Return month, monthly revenue, previous month revenue, and growth percentage. Order by month ascending.",
    "table_names": ["stripe_data.invoice"],
    "query_description": """
* The query should use the stripe_data.invoice table
* The query should aggregate revenue by month using DATE_TRUNC('month', created) or equivalent
* The query should calculate monthly revenue using SUM(amount_due)
* The query should use LAG window function to get previous month's revenue
* The query should calculate growth percentage as ((current - previous) / previous) * 100, handling division by zero with NULLIF
* The query should cast to numeric/decimal to avoid integer division issues
* The query should order by month ascending
* The query should include month, monthly revenue, previous month revenue, and growth percentage columns
    """,
    "reference_query": """
WITH monthly_revenue AS (
  SELECT
    DATE_TRUNC('month', created) as month,
    SUM(amount_due) as monthly_revenue
  FROM stripe_data.invoice
  GROUP BY DATE_TRUNC('month', created)
)
SELECT
  month,
  monthly_revenue,
  LAG(monthly_revenue, 1) OVER (ORDER BY month) as previous_month_revenue,
  ROUND(((monthly_revenue - LAG(monthly_revenue, 1) OVER (ORDER BY month))::numeric / NULLIF(LAG(monthly_revenue, 1) OVER (ORDER BY month), 0)::numeric) * 100, 2) as growth_percentage
FROM monthly_revenue
ORDER BY month
    """,
}

# Test 3: Moving average with ROWS BETWEEN frame
seven_day_moving_avg_daily_sales = {
    "description": "7-day moving average of daily sales by product",
    "message": "Calculate a 7-day moving average of daily sales for each Shopify product. Join product, order line, and order tables. Group by product and date. Calculate daily sales as price times quantity. For each product, calculate the moving average over the current day and the previous 6 days. Return product id, title, sale date, daily sales, and 7-day moving average. Order by product id ascending, then sale date ascending.",
    "table_names": ["shopify_data.order_line", "shopify_data.order", "shopify_data.product"],
    "query_description": """
* The query should use tables from shopify_data schema (product, order_line, and order are required)
* The query should join product, order_line, and order tables
* The query should calculate daily sales per product by grouping by product id and DATE(order.created_at)
* The query should calculate daily sales using SUM(price * quantity) or SUM(quantity * price)
* The query should calculate 7-day moving average using AVG window function with PARTITION BY product_id and frame specification ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
* The query should order by product_id ascending, then sale_date ascending
* The query should include product_id, product title, sale_date, daily_sales, and moving_avg_7_day columns
    """,
    "reference_query": """
WITH daily_product_sales AS (
  SELECT
    p.id as product_id,
    p.title,
    DATE(o.created_at) as sale_date,
    SUM(ol.price * ol.quantity) as daily_sales
  FROM shopify_data.product p
  JOIN shopify_data.order_line ol ON p.id = ol.product_id
  JOIN shopify_data.order o ON ol.order_id = o.id
  GROUP BY p.id, p.title, DATE(o.created_at)
)
SELECT
  product_id,
  title,
  sale_date,
  daily_sales,
  AVG(daily_sales) OVER (PARTITION BY product_id ORDER BY sale_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as moving_avg_7_day
FROM daily_product_sales
ORDER BY product_id, sale_date
    """,
}

# Test 4: LEAD function for forward-looking analysis
current_month_vs_next_month_revenue = {
    "description": "Compare current month revenue to next month",
    "message": "Compare current month Stripe revenue to next month's revenue. Group by calendar month and calculate monthly revenue as sum of amount due. Include the next month's revenue for comparison. Return month, monthly revenue, and next month revenue. Order by month ascending.",
    "table_names": ["stripe_data.invoice"],
    "query_description": """
* The query should use the stripe_data.invoice table
* The query should aggregate revenue by month using DATE_TRUNC('month', created) or equivalent
* The query should calculate monthly revenue using SUM(amount_due)
* The query should use LEAD window function to get next month's revenue (LEAD(monthly_revenue, 1) OVER (ORDER BY month))
* The query should order by month ascending
* The query should include month, monthly revenue, and next month revenue columns
    """,
    "reference_query": """
WITH monthly_revenue AS (
  SELECT
    DATE_TRUNC('month', created) as month,
    SUM(amount_due) as monthly_revenue
  FROM stripe_data.invoice
  GROUP BY DATE_TRUNC('month', created)
)
SELECT
  month,
  monthly_revenue,
  LEAD(monthly_revenue, 1) OVER (ORDER BY month) as next_month_revenue
FROM monthly_revenue
ORDER BY month
    """,
}

# Test 5: Year-over-year comparison with LAG
year_over_year_order_volume = {
    "description": "Year-over-year order volume comparison",
    "message": "Compare monthly Shopify order counts to the same month last year. Group by calendar month and count orders. Include the order count from 12 months prior for year-over-year comparison. For months without prior year data, show 0. Return month, order count, and same month last year. Order by month ascending.",
    "table_names": ["shopify_data.order"],
    "query_description": """
* The query should use the shopify_data.order table
* The query should aggregate orders by month using DATE_TRUNC('month', created_at) or equivalent
* The query should count orders per month using COUNT(*)
* The query should get same month last year using LAG window function with offset 12 or self-join on month + 1 year
* For months without prior year data, the same_month_last_year column should show 0
* The query should order by month ascending
* The query should include month, order count, and same month last year columns
    """,
    "reference_query": """
WITH monthly_orders AS (
  SELECT
    DATE_TRUNC('month', created_at) as month,
    COUNT(*) as order_count
  FROM shopify_data.order
  GROUP BY DATE_TRUNC('month', created_at)
)
SELECT
  month,
  order_count,
  COALESCE(LAG(order_count, 12) OVER (ORDER BY month), 0) as same_month_last_year
FROM monthly_orders
ORDER BY month
    """,
}

# Test 6: FIRST_VALUE for baseline comparison
customer_order_vs_first_order = {
    "description": "Compare each customer's orders to their first order value",
    "message": "Compare each customer's orders to their first order value. For each order, include the customer's first order amount based on order date. Return order id, customer id, created at, order amount (total price), and first order amount. Order by customer id ascending, then created at ascending.",
    "table_names": ["shopify_data.order"],
    "query_description": """
* The query should use the shopify_data.order table
* The query should use FIRST_VALUE window function to get each customer's first order amount (FIRST_VALUE(total_price) OVER (PARTITION BY customer_id ORDER BY created_at))
* The query should include proper frame specification (ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) or equivalent to ensure correct FIRST_VALUE calculation
* The query should order by customer_id ascending, then created_at ascending
* The query should include order id, customer_id, created_at, order amount, and first order amount columns
    """,
    "reference_query": """
SELECT
  o.id,
  o.customer_id,
  o.created_at,
  o.total_price as order_amount,
  FIRST_VALUE(o.total_price) OVER (PARTITION BY o.customer_id ORDER BY o.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as first_order_amount
FROM shopify_data.order o
ORDER BY o.customer_id, o.created_at
    """,
}

# Test 7: LAST_VALUE for most recent comparison
opportunity_with_account_most_recent_stage = {
    "description": "Show each opportunity with the account's most recent opportunity stage",
    "message": "Show each Salesforce opportunity alongside the account's most recent opportunity stage. For each opportunity, include the most recent stage name for that account based on close date. Use opportunity id ascending as a tiebreaker when multiple opportunities have the same close date. Return opportunity id, account id, close date, stage name, and most recent stage. Order by account id ascending, then close date ascending, then opportunity id ascending.",
    "table_names": ["salesforce_data.opportunity"],
    "query_description": """
* The query should use the salesforce_data.opportunity table
* The query should use LAST_VALUE window function to get each account's most recent opportunity stage
* The window should be ordered by close_date, with opportunity id ascending as a tiebreaker for ties
* The query should include proper frame specification (ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) or equivalent to ensure correct LAST_VALUE calculation
* The query should order by account_id ascending, then close_date ascending, then opportunity id ascending
* The query should include opportunity id, account_id, close_date, stage_name, and most recent stage columns
    """,
    "reference_query": """
SELECT
  o.id,
  o.account_id,
  o.close_date,
  o.stage_name,
  LAST_VALUE(o.stage_name) OVER (PARTITION BY o.account_id ORDER BY o.close_date, o.id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as most_recent_stage
FROM salesforce_data.opportunity o
ORDER BY o.account_id, o.close_date, o.id
    """,
}

# Test 8: Running count (cumulative customers)
cumulative_customer_count_by_signup_month = {
    "description": "Cumulative customer count by signup month",
    "message": "Calculate cumulative Stripe customer count by signup month. Group by the month customers were created and count new customers. Calculate a running total of cumulative customers over time. Return signup month, new customers, and cumulative customers. Order by signup month ascending.",
    "table_names": ["stripe_data.customer"],
    "query_description": """
* The query should use the stripe_data.customer table
* The query should aggregate customers by signup month using DATE_TRUNC('month', created) or equivalent
* The query should count new customers per month using COUNT(*)
* The query should calculate cumulative customer count using a window function with running total (SUM(new_customers) OVER (ORDER BY signup_month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) or equivalent)
* The query should order by signup_month ascending
* The query should include signup_month, new_customers, and cumulative_customers columns
    """,
    "reference_query": """
WITH monthly_signups AS (
  SELECT
    DATE_TRUNC('month', created) as signup_month,
    COUNT(*) as new_customers
  FROM stripe_data.customer
  GROUP BY DATE_TRUNC('month', created)
)
SELECT
  signup_month,
  new_customers,
  SUM(new_customers) OVER (ORDER BY signup_month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as cumulative_customers
FROM monthly_signups
ORDER BY signup_month
    """,
}

# Test 9: 30-day moving average for expenses
thirty_day_moving_avg_daily_expenses = {
    "description": "30-day moving average of daily expenses by department",
    "message": "Calculate a 30-day moving average of daily expenses for each Brex department. Join expense to department tables. Group by department and date. Calculate daily total expenses. For each department, calculate the moving average over the current day and the previous 29 days. Return department id, department name, expense date, daily total, and 30-day moving average. Order by department id ascending, then expense date ascending.",
    "table_names": ["brex_data.expense", "brex_data.department"],
    "query_description": """
* The query should use tables from brex_data schema (expense and department are required)
* The query should join expense and department tables on department_id
* The query should calculate daily expenses per department by grouping by department_id and DATE(created_at)
* The query should calculate daily total using SUM(amount)
* The query should calculate 30-day moving average using AVG window function with PARTITION BY department_id and frame specification ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
* The query should order by department_id ascending, then expense_date ascending
* The query should include department_id, department_name, expense_date, daily_total, and moving_avg_30_day columns
    """,
    "reference_query": """
WITH daily_department_expenses AS (
  SELECT
    e.department_id,
    d.name as department_name,
    DATE(e.created_at) as expense_date,
    SUM(e.amount) as daily_total
  FROM brex_data.expense e
  JOIN brex_data.department d ON e.department_id = d.id
  GROUP BY e.department_id, d.name, DATE(e.created_at)
)
SELECT
  department_id,
  department_name,
  expense_date,
  daily_total,
  AVG(daily_total) OVER (PARTITION BY department_id ORDER BY expense_date ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) as moving_avg_30_day
FROM daily_department_expenses
ORDER BY department_id, expense_date
    """,
}

# Test 10: Running min/max with frame window
running_max_opportunity_value = {
    "description": "Running maximum opportunity value by close date",
    "message": "Calculate the running maximum opportunity value over time. For each opportunity ordered by close date, show the largest amount seen so far. Return opportunity id, name, close date, amount, and running maximum. Order by close date ascending, using id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity"],
    "query_description": """
* The query should use the salesforce_data.opportunity table
* The query should select id, name, close_date, and amount columns
* The query should calculate running maximum using MAX window function with frame specification ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW or equivalent
* The window function should be ordered by close_date and id (for deterministic tiebreaking)
* The query should order results by close_date ascending, then id ascending
* The query should include opportunity id, name, close_date, amount, and running_max columns
    """,
    "reference_query": """
SELECT
  id,
  name,
  close_date,
  amount,
  MAX(amount) OVER (ORDER BY close_date, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as running_max
FROM salesforce_data.opportunity
ORDER BY close_date, id
    """,
}

# Export test data and metadata for benchmark creation
TEST_DATA = [
    cumulative_revenue_by_month,
    month_over_month_revenue_growth,
    seven_day_moving_avg_daily_sales,
    current_month_vs_next_month_revenue,
    year_over_year_order_volume,
    customer_order_vs_first_order,
    opportunity_with_account_most_recent_stage,
    cumulative_customer_count_by_signup_month,
    thirty_day_moving_avg_daily_expenses,
    running_max_opportunity_value,
]
