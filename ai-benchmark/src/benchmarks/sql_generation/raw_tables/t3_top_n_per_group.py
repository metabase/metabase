"""
Tier 3: Top N Per Group SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
window functions for top-N-per-group patterns:
- ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)
- Filtering to top N within each group
- Most recent/largest/first record per entity
- Multi-criteria ranking within partitions
"""

# Test 1: Most recent order per customer
most_recent_order_per_customer = {
    "description": "Most recent order for each customer",
    "message": "Get each Shopify customer's most recent order. Join customer to order tables. For each customer, find only their most recent order by date. Return customer id, email, first name, last name, order id, order date, and total price. Order by customer id ascending.",
    "table_names": ["shopify_data.customer", "shopify_data.order"],
    "query_description": """
* The query should use shopify_data.customer and shopify_data.order tables
* The query should join customer to order on customer.id = order.customer_id
* The query should use ROW_NUMBER() window function with PARTITION BY customer_id (or similar customer grouping)
* The window function should order by order.created_at DESC to get most recent order
* The query should filter WHERE row_number = 1 to get only the most recent order per customer
* The query should include customer information (id, email, name) and order information (id, date, amount)
* The query should order by customer_id ascending in the final output
    """,
    "reference_query": """
WITH ranked_orders AS (
  SELECT
    c.id as customer_id,
    c.email,
    c.first_name,
    c.last_name,
    o.id as order_id,
    o.created_at as order_date,
    o.total_price,
    ROW_NUMBER() OVER (PARTITION BY o.customer_id ORDER BY o.created_at DESC) as rn
  FROM shopify_data.customer c
  JOIN shopify_data.order o ON c.id = o.customer_id
)
SELECT
  customer_id,
  email,
  first_name,
  last_name,
  order_id,
  order_date,
  total_price
FROM ranked_orders
WHERE rn = 1
ORDER BY customer_id ASC
    """,
}

# Test 2: Top 3 products per category by revenue
top_3_products_per_category = {
    "description": "Top 3 best-selling products in each category",
    "message": "Find the top 3 Shopify products by revenue within each product type. Join product to order line tables. Calculate total revenue as sum of price times quantity per product. For each product type, rank products by revenue and only include the top 3. Use product id as a tiebreaker when revenues are equal. Return product type, product id, product name, and total revenue. Order by product type ascending, then total revenue descending, using product id ascending as a tiebreaker.",
    "table_names": ["shopify_data.product", "shopify_data.order_line"],
    "query_description": """
* The query should use shopify_data.product and shopify_data.order_line tables
* The query should join product to order_line on product.id = order_line.product_id
* The query should group by product (GROUP BY product.id, product.title, product.product_type)
* The query should calculate total revenue per product by summing (order_line.price * order_line.quantity)
* The query should use ROW_NUMBER() or RANK() window function with PARTITION BY product_type
* The window function should order by total_revenue DESC, product.id ASC to handle ties deterministically
* The query should filter WHERE row_number <= 3 to get top 3 products per product type
* The query should order by product_type ascending, total revenue descending, product id ascending in final output
    """,
    "reference_query": """
WITH product_revenue AS (
  SELECT
    p.id as product_id,
    p.title as product_name,
    p.product_type,
    SUM(ol.price * ol.quantity) as total_revenue
  FROM shopify_data.product p
  JOIN shopify_data.order_line ol ON p.id = ol.product_id
  GROUP BY p.id, p.title, p.product_type
),
ranked_products AS (
  SELECT
    product_id,
    product_name,
    product_type,
    total_revenue,
    ROW_NUMBER() OVER (PARTITION BY product_type ORDER BY total_revenue DESC, product_id ASC) as rn
  FROM product_revenue
)
SELECT
  product_type,
  product_id,
  product_name,
  total_revenue
FROM ranked_products
WHERE rn <= 3
ORDER BY product_type ASC, total_revenue DESC, product_id ASC
    """,
}

# Test 3: Most recent opportunity for each account
most_recent_opportunity_per_account = {
    "description": "Most recent opportunity for each account",
    "message": "Get each Salesforce account's most recent opportunity. Join account to opportunity tables. For each account, find only their most recent opportunity by close date. Use opportunity id ascending as a tiebreaker when dates are equal. Return account id, account name, opportunity id, opportunity name, close date, amount, and stage name. Order by account id ascending.",
    "table_names": ["salesforce_data.account", "salesforce_data.opportunity"],
    "query_description": """
* The query should use salesforce_data.account and salesforce_data.opportunity tables
* The query should join account to opportunity on account.id = opportunity.account_id
* The query should select one opportunity per account using ROW_NUMBER(), DISTINCT ON, or similar technique
* The selection should order by opportunity.close_date DESC, opportunity.id ASC to get most recent opportunity with lower ID as tiebreaker
* The query should include account information (id, name) and opportunity information (id, name, close_date, amount, stage_name)
* The query should order by account_id ascending in the final output
    """,
    "reference_query": """
WITH ranked_opps AS (
  SELECT
    a.id as account_id,
    a.name as account_name,
    o.id as opportunity_id,
    o.name as opportunity_name,
    o.close_date,
    o.amount,
    o.stage_name,
    ROW_NUMBER() OVER (PARTITION BY o.account_id ORDER BY o.close_date DESC, o.id ASC) as rn
  FROM salesforce_data.account a
  JOIN salesforce_data.opportunity o ON a.id = o.account_id
)
SELECT
  account_id,
  account_name,
  opportunity_id,
  opportunity_name,
  close_date,
  amount,
  stage_name
FROM ranked_opps
WHERE rn = 1
ORDER BY account_id ASC
    """,
}

# Test 4: Largest transaction for each merchant
largest_transaction_per_merchant = {
    "description": "Largest transaction for each merchant",
    "message": "Find the largest Brex transaction for each merchant. For each merchant, find only their highest value transaction by amount. Use transaction id as a tiebreaker. Return merchant name, transaction id, amount, currency, and posted at time. Order by merchant name ascending.",
    "table_names": ["brex_data.transaction"],
    "query_description": """
* The query should use brex_data.transaction table
* The query should use ROW_NUMBER() window function with PARTITION BY merchant_name
* The window function should order by amount DESC, transaction.id ASC to get highest value transaction with deterministic tiebreaker
* The query should filter WHERE row_number = 1 to get only the highest value transaction per merchant
* The query should include merchant_name, transaction id, amount, currency, and posted_at_time
* The query should order by merchant_name ascending in the final output
    """,
    "reference_query": """
WITH ranked_transactions AS (
  SELECT
    merchant_name,
    id as transaction_id,
    amount,
    currency,
    posted_at_time,
    ROW_NUMBER() OVER (PARTITION BY merchant_name ORDER BY amount DESC, id ASC) as rn
  FROM brex_data.transaction
)
SELECT
  merchant_name,
  transaction_id,
  amount,
  currency,
  posted_at_time
FROM ranked_transactions
WHERE rn = 1
ORDER BY merchant_name ASC
    """,
}

# Test 5: Most recent subscription for each customer
most_recent_subscription_per_customer = {
    "description": "Most recent subscription for each customer",
    "message": "Get each Stripe customer's most recent subscription. Join customer to subscription tables. For each customer, find only their most recent subscription by creation date. Return customer id, email, customer name, subscription id, created, status, current period start, and current period end. Order by customer id ascending.",
    "table_names": ["stripe_data.customer", "stripe_data.subscription"],
    "query_description": """
* The query should use stripe_data.customer and stripe_data.subscription tables
* The query should join customer to subscription on customer.id = subscription.customer_id
* The query should use ROW_NUMBER() window function with PARTITION BY customer_id (or similar customer grouping)
* The window function should order by subscription.created DESC to get most recent subscription
* The query should filter WHERE row_number = 1 to get only the most recent subscription per customer
* The query should include customer information (id, email, name) and subscription information (id, created, status, period dates)
* The query should order by customer_id ascending in the final output
    """,
    "reference_query": """
WITH ranked_subs AS (
  SELECT
    c.id as customer_id,
    c.email,
    c.name as customer_name,
    s.id as subscription_id,
    s.created,
    s.status,
    s.current_period_start,
    s.current_period_end,
    ROW_NUMBER() OVER (PARTITION BY s.customer_id ORDER BY s.created DESC) as rn
  FROM stripe_data.customer c
  JOIN stripe_data.subscription s ON c.id = s.customer_id
)
SELECT
  customer_id,
  email,
  customer_name,
  subscription_id,
  created,
  status,
  current_period_start,
  current_period_end
FROM ranked_subs
WHERE rn = 1
ORDER BY customer_id ASC
    """,
}

# Test 6: Top 5 campaigns per account by spend
top_5_campaigns_per_account = {
    "description": "Top 5 highest spending campaigns per AdWords account",
    "message": "Find the top 5 AdWords campaigns by cost within each account. Join campaign to campaign stats tables. Calculate total cost micros per campaign. For each account, rank campaigns by total cost and only include the top 5. Use campaign id as a tiebreaker. Return account id, campaign id, campaign name, and total cost micros. Order by account id ascending, then total cost micros descending, using campaign id ascending as a tiebreaker.",
    "table_names": ["google_adwords_data.campaign", "google_adwords_data.campaign_stats"],
    "query_description": """
* The query should use google_adwords_data.campaign and google_adwords_data.campaign_stats tables
* The query should join campaign to campaign_stats on campaign.id = campaign_stats.campaign_id
* The query should group by campaign (GROUP BY campaign.account_id, campaign.id, campaign.name)
* The query should calculate total cost per campaign by summing campaign_stats.cost_micros
* The query should use ROW_NUMBER() or RANK() window function with PARTITION BY account_id
* The window function should order by total_cost DESC, campaign.id ASC to handle ties deterministically
* The query should filter WHERE row_number <= 5 to get top 5 campaigns per account
* The query should order by account_id ascending, total cost descending, campaign id ascending in final output
    """,
    "reference_query": """
WITH campaign_spend AS (
  SELECT
    c.account_id,
    c.id as campaign_id,
    c.name as campaign_name,
    SUM(cs.cost_micros) as total_cost_micros
  FROM google_adwords_data.campaign c
  JOIN google_adwords_data.campaign_stats cs ON c.id = cs.campaign_id
  GROUP BY c.account_id, c.id, c.name
),
ranked_campaigns AS (
  SELECT
    account_id,
    campaign_id,
    campaign_name,
    total_cost_micros,
    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY total_cost_micros DESC, campaign_id ASC) as rn
  FROM campaign_spend
)
SELECT
  account_id,
  campaign_id,
  campaign_name,
  total_cost_micros
FROM ranked_campaigns
WHERE rn <= 5
ORDER BY account_id ASC, total_cost_micros DESC, campaign_id ASC
    """,
}

# Test 7: Earliest application for each job posting
earliest_application_per_posting = {
    "description": "Earliest application for each job posting",
    "message": "Find the earliest application for each Lever job posting. Join posting to application tables. For each posting, find only the first application by creation date. Use application id as a tiebreaker. Return posting id, posting title, application id, opportunity id, and created at. Order by posting id ascending.",
    "table_names": ["lever_data.posting", "lever_data.application"],
    "query_description": """
* The query should use lever_data.posting and lever_data.application tables
* The query should join posting to application on posting.id = application.posting_id
* The query should use ROW_NUMBER() window function with PARTITION BY posting_id (or similar posting grouping)
* The window function should order by application.created_at ASC, application.id ASC to get earliest application with deterministic tiebreaker
* The query should filter WHERE row_number = 1 to get only the first application per posting
* The query should include posting information (id, title/text) and application information (id, opportunity_id, created_at)
* The query should order by posting_id ascending in the final output
    """,
    "reference_query": """
WITH ranked_apps AS (
  SELECT
    p.id as posting_id,
    p.text as posting_title,
    a.id as application_id,
    a.opportunity_id,
    a.created_at,
    ROW_NUMBER() OVER (PARTITION BY a.posting_id ORDER BY a.created_at ASC, a.id ASC) as rn
  FROM lever_data.posting p
  JOIN lever_data.application a ON p.id = a.posting_id
)
SELECT
  posting_id,
  posting_title,
  application_id,
  opportunity_id,
  created_at
FROM ranked_apps
WHERE rn = 1
ORDER BY posting_id ASC
    """,
}

# Test 8: Highest invoice amount for each customer
highest_invoice_per_customer = {
    "description": "Highest invoice amount for each customer",
    "message": "Find each QuickBooks customer's highest invoice. Join customer to invoice tables. For each customer, find only their largest invoice by total amount. Use invoice id as a tiebreaker. Return customer id, customer name (display name), invoice id, doc number, total amount, and transaction date. Order by customer id ascending.",
    "table_names": ["quickbooks_data.customer", "quickbooks_data.invoice"],
    "query_description": """
* The query should use quickbooks_data.customer and quickbooks_data.invoice tables
* The query should join customer to invoice on customer.id = invoice.customer_ref_value
* The query should use ROW_NUMBER() window function with PARTITION BY customer_id (or customer_ref_value)
* The window function should order by invoice.total_amt DESC, invoice.id ASC to get highest invoice with deterministic tiebreaker
* The query should filter WHERE row_number = 1 to get only the largest invoice per customer
* The query should include customer information (id, display_name) and invoice information (id, doc_number, total_amt, txn_date)
* The query should order by customer_id ascending in the final output
    """,
    "reference_query": """
WITH ranked_invoices AS (
  SELECT
    c.id as customer_id,
    c.display_name as customer_name,
    i.id as invoice_id,
    i.doc_number,
    i.total_amt,
    i.txn_date,
    ROW_NUMBER() OVER (PARTITION BY i.customer_ref_value ORDER BY i.total_amt DESC, i.id ASC) as rn
  FROM quickbooks_data.customer c
  JOIN quickbooks_data.invoice i ON c.id = i.customer_ref_value
)
SELECT
  customer_id,
  customer_name,
  invoice_id,
  doc_number,
  total_amt,
  txn_date
FROM ranked_invoices
WHERE rn = 1
ORDER BY customer_id ASC
    """,
}

# Test 9: Latest email delivery for each customer
latest_email_delivery_per_customer = {
    "description": "Latest email delivery for each customer",
    "message": "Find each Customer.io customer's most recent email delivery. For each customer, find only their most recent delivery by creation date. Use delivery id as a tiebreaker. Return customer id, delivery id, and created at. Order by customer id ascending.",
    "table_names": ["customerio_data.deliveries"],
    "query_description": """
* The query should use customerio_data.deliveries table
* The query should use ROW_NUMBER() window function with PARTITION BY customer_id
* The window function should order by created_at DESC, delivery_id ASC to get most recent delivery with deterministic tiebreaker
* The query should filter WHERE row_number = 1 to get only the most recent delivery per customer
* The query should include customer_id, delivery_id, and created_at
* The query should order by customer_id ascending in the final output
    """,
    "reference_query": """
WITH ranked_deliveries AS (
  SELECT
    customer_id,
    delivery_id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC, delivery_id ASC) as rn
  FROM customerio_data.deliveries
)
SELECT
  customer_id,
  delivery_id,
  created_at
FROM ranked_deliveries
WHERE rn = 1
ORDER BY customer_id ASC
    """,
}

# Test 10: Top 2 largest expenses in each department
top_2_expenses_per_department = {
    "description": "Top 2 largest expenses in each department",
    "message": "Find the top 2 largest Brex expenses in each department. Join department to expense tables. For each department, rank expenses by amount and only include the top 2. Use expense id as a tiebreaker. Return department id, department name, expense id, amount, and created at. Order by department id ascending, then amount descending, using expense id ascending as a tiebreaker.",
    "table_names": ["brex_data.expense", "brex_data.department"],
    "query_description": """
* The query should use brex_data.department and brex_data.expense tables
* The query should join department to expense on department.id = expense.department_id
* The query should use ROW_NUMBER() or RANK() window function with PARTITION BY department_id (or expense.department_id)
* The window function should order by amount DESC, expense.id ASC to get highest expenses with deterministic tiebreaker
* The query should filter WHERE row_number <= 2 to get top 2 expenses per department
* The query should include department_id, department_name, expense_id, amount, and created_at
* The query should order by department_id ascending, amount descending, expense_id ascending in final output
    """,
    "reference_query": """
WITH ranked_expenses AS (
  SELECT
    d.id as department_id,
    d.name as department_name,
    e.id as expense_id,
    e.amount,
    e.created_at,
    ROW_NUMBER() OVER (PARTITION BY e.department_id ORDER BY e.amount DESC, e.id ASC) as rn
  FROM brex_data.department d
  JOIN brex_data.expense e ON d.id = e.department_id
)
SELECT
  department_id,
  department_name,
  expense_id,
  amount,
  created_at
FROM ranked_expenses
WHERE rn <= 2
ORDER BY department_id ASC, amount DESC, expense_id ASC
    """,
}

# Export test data and metadata for benchmark creation
TEST_DATA = [
    most_recent_order_per_customer,
    top_3_products_per_category,
    most_recent_opportunity_per_account,
    largest_transaction_per_merchant,
    most_recent_subscription_per_customer,
    top_5_campaigns_per_account,
    earliest_application_per_posting,
    highest_invoice_per_customer,
    latest_email_delivery_per_customer,
    top_2_expenses_per_department,
]
