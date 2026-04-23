"""
Tier 3: Subquery SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
subqueries:
- Scalar subqueries in SELECT
- Subqueries in WHERE (IN, EXISTS, comparisons)
- Correlated subqueries
- Derived tables in FROM
"""

# Test 1: Above-average spenders (scalar subquery in WHERE with HAVING)
stripe_customers_spending_above_average = {
    "description": "Stripe customers spending above average",
    "message": "Find Stripe customers who spent more than the average customer. Left join customer to invoice tables. Calculate total spent as sum of amount paid per customer, treating customers with no invoices as having spent zero. Use a subquery to find the average total spent across all customers (including those with zero spending), then filter to only include customers whose total exceeds that average. Return id, name, email, and total spent. Order by total spent descending, using id ascending as a tiebreaker.",
    "table_names": ["stripe_data.customer", "stripe_data.invoice"],
    "query_description": """
* The query should use stripe_data.customer and stripe_data.invoice tables
* The query should use LEFT JOIN from customer to invoice on customer.id = invoice.customer_id
* The query should group by customer (GROUP BY customer.id, customer.name, customer.email)
* The query should calculate total amount spent per customer using SUM(invoice.amount_paid), with COALESCE to treat NULL as 0
* The query should use a subquery to calculate the average total spent across ALL customers, including those with zero spending
* The query should filter using HAVING clause to only include customers whose total exceeds the average
* The query should order by total spent descending, customer id ascending as tiebreaker
    """,
    "reference_query": """
SELECT
  c.id,
  c.name,
  c.email,
  COALESCE(SUM(i.amount_paid), 0) AS total_spent
FROM stripe_data.customer c
LEFT JOIN stripe_data.invoice i ON c.id = i.customer_id
GROUP BY c.id, c.name, c.email
HAVING COALESCE(SUM(i.amount_paid), 0) > (
  SELECT AVG(customer_total)
  FROM (
    SELECT COALESCE(SUM(i2.amount_paid), 0) AS customer_total
    FROM stripe_data.customer c2
    LEFT JOIN stripe_data.invoice i2 ON c2.id = i2.customer_id
    GROUP BY c2.id
  ) AS customer_totals
)
ORDER BY total_spent DESC, c.id ASC
    """,
}

# Test 2: Products never sold (NOT EXISTS)
shopify_products_never_in_order = {
    "description": "Shopify products never in an order",
    "message": "Find Shopify products that have never been ordered. Check for products that don't exist in any order line. Return id, title, product type, and vendor. Order by id ascending.",
    "table_names": ["shopify_data.product", "shopify_data.order_line"],
    "query_description": """
* The query should use shopify_data.product table
* The query should use a NOT EXISTS subquery to check for products not in shopify_data.order_line
* The subquery should check if order_line.product_id matches product.id
* The query should return product details (id, title, product_type, vendor)
* The query should order by product id ascending
    """,
    "reference_query": """
SELECT
  p.id,
  p.title,
  p.product_type,
  p.vendor
FROM shopify_data.product p
WHERE NOT EXISTS (
  SELECT 1
  FROM shopify_data.order_line ol
  WHERE ol.product_id = p.id
)
ORDER BY p.id ASC
    """,
}

# Test 3: Accounts with opportunities (EXISTS)
salesforce_accounts_with_opportunities = {
    "description": "Salesforce accounts that have at least one opportunity",
    "message": "Find Salesforce accounts that have at least one opportunity. Check for accounts that have any associated opportunities. Return id, name, industry, and annual revenue. Order by id ascending.",
    "table_names": ["salesforce_data.account", "salesforce_data.opportunity"],
    "query_description": """
* The query should use salesforce_data.account table
* The query should use an EXISTS subquery to check for accounts with opportunities
* The subquery should check salesforce_data.opportunity where opportunity.account_id matches account.id
* The query should return account details (id, name, industry, annual_revenue)
* The query should order by account id ascending
    """,
    "reference_query": """
SELECT
  a.id,
  a.name,
  a.industry,
  a.annual_revenue
FROM salesforce_data.account a
WHERE EXISTS (
  SELECT 1
  FROM salesforce_data.opportunity o
  WHERE o.account_id = a.id
)
ORDER BY a.id ASC
    """,
}

# Test 4: Customers who bought specific products (IN subquery)
shopify_customers_who_purchased_apparel = {
    "description": "Customers who purchased products from a specific category",
    "message": "Find Shopify customers who purchased Apparel products. Use a subquery to identify customers who have orders containing products with product type 'Apparel'. Return distinct id, first name, last name, and email. Order by id ascending.",
    "table_names": [
        "shopify_data.customer",
        "shopify_data.order",
        "shopify_data.order_line",
        "shopify_data.product",
    ],
    "query_description": """
* The query should use shopify_data.customer table as the main source
* The query should use a subquery (IN or EXISTS) to find customers who ordered Apparel products
* The subquery should join shopify_data.order, shopify_data.order_line, and shopify_data.product tables
* The subquery should filter where product.product_type = 'Apparel'
* The query should return distinct customer details (id, first_name, last_name, email)
* The query should order by customer id ascending
    """,
    "reference_query": """
SELECT DISTINCT
  c.id,
  c.first_name,
  c.last_name,
  c.email
FROM shopify_data.customer c
WHERE c.id IN (
  SELECT DISTINCT o.customer_id
  FROM shopify_data.order o
  JOIN shopify_data.order_line ol ON o.id = ol.order_id
  JOIN shopify_data.product p ON ol.product_id = p.id
  WHERE p.product_type = 'Apparel'
)
ORDER BY c.id ASC
    """,
}

# Test 5: Leads without opportunities (NOT IN or NOT EXISTS)
salesforce_leads_never_converted = {
    "description": "Salesforce leads that were never converted to opportunities",
    "message": "Find Salesforce leads that were never converted to opportunities. Include leads where the converted opportunity id is null or where no matching opportunity exists. Return id, first name, last name, email, company, and status. Order by id ascending.",
    "table_names": ["salesforce_data.lead", "salesforce_data.opportunity"],
    "query_description": """
* The query should use salesforce_data.lead table
* The query should filter for leads without associated opportunities
* This can be achieved by checking if converted_opportunity_id IS NULL or using NOT EXISTS to verify the opportunity doesn't exist
* The query should return lead details (id, first_name, last_name, email, company, status)
* The query should order by lead id ascending
    """,
    "reference_query": """
SELECT
  l.id,
  l.first_name,
  l.last_name,
  l.email,
  l.company,
  l.status
FROM salesforce_data.lead l
WHERE l.converted_opportunity_id IS NULL
  OR NOT EXISTS (
    SELECT 1
    FROM salesforce_data.opportunity o
    WHERE o.id = l.converted_opportunity_id
  )
ORDER BY l.id ASC
    """,
}

# Test 6: Correlated subquery - invoices above customer average
stripe_invoices_above_customer_average = {
    "description": "Stripe invoices above that customer's average",
    "message": "Find Stripe invoices that exceed the customer's own average invoice amount. Join invoice to customer tables. For each invoice, compare its amount due to that specific customer's average amount due. Only include invoices where the amount exceeds their customer's average. Return invoice id, customer id, customer name, amount due, and created. Order by id ascending.",
    "table_names": ["stripe_data.invoice", "stripe_data.customer"],
    "query_description": """
* The query should use stripe_data.invoice and stripe_data.customer tables
* The query should join invoice to customer on invoice.customer_id = customer.id
* The query should use a correlated subquery to calculate average amount_due per customer
* The query should filter using WHERE clause to only include invoices where amount_due exceeds that customer's average
* The query should return invoice details (id, customer_id, customer name, amount_due, created)
* The query should order by invoice id ascending
    """,
    "reference_query": """
SELECT
  i.id,
  i.customer_id,
  c.name AS customer_name,
  i.amount_due,
  i.created
FROM stripe_data.invoice i
JOIN stripe_data.customer c ON i.customer_id = c.id
WHERE i.amount_due > (
  SELECT AVG(i2.amount_due)
  FROM stripe_data.invoice i2
  WHERE i2.customer_id = i.customer_id
)
ORDER BY i.id ASC
    """,
}

# Test 7: Subquery in SELECT clause
shopify_customers_with_order_count = {
    "description": "Customers with their total order count included",
    "message": "List all Shopify customers with their total order count. For each customer, include a count of their orders calculated via a subquery. Return id, first name, last name, email, and total orders. Order by id ascending.",
    "table_names": ["shopify_data.customer", "shopify_data.order"],
    "query_description": """
* The query should use shopify_data.customer table as the main source
* The query should use a scalar subquery in the SELECT clause to count orders per customer
* The subquery should COUNT orders from shopify_data.order where order.customer_id matches customer.id
* The query should return customer details (id, first_name, last_name, email) plus total_orders count
* The query should order by customer id ascending
    """,
    "reference_query": """
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  (SELECT COUNT(*)
   FROM shopify_data.order o
   WHERE o.customer_id = c.id) AS total_orders
FROM shopify_data.customer c
ORDER BY c.id ASC
    """,
}

# Test 8: Departments with above-average expense totals
brex_departments_above_average_expenses = {
    "description": "Departments spending more than the average department",
    "message": "Find Brex departments that spend more than the average department. Join department to expense tables. Calculate total expenses per department. Use a subquery to find the average total expenses across all departments, then filter to only include departments that exceed that average. Return id, name, and total expenses. Order by total expenses descending, using id ascending as a tiebreaker.",
    "table_names": ["brex_data.department", "brex_data.expense"],
    "query_description": """
* The query should use brex_data.department and brex_data.expense tables
* The query should join department to expense on department.id = expense.department_id
* The query should group by department (GROUP BY department.id, department.name)
* The query should calculate total expenses per department using SUM(expense.amount)
* The query should use a subquery to calculate the average total expenses across all departments
* The query should filter using HAVING clause to only include departments whose total exceeds the average
* The query should order by total expenses descending, department id ascending as tiebreaker
    """,
    "reference_query": """
SELECT
  d.id,
  d.name,
  SUM(e.amount) AS total_expenses
FROM brex_data.department d
JOIN brex_data.expense e ON d.id = e.department_id
GROUP BY d.id, d.name
HAVING SUM(e.amount) > (
  SELECT AVG(dept_total)
  FROM (
    SELECT SUM(amount) AS dept_total
    FROM brex_data.expense
    GROUP BY department_id
  ) AS dept_totals
)
ORDER BY total_expenses DESC, d.id ASC
    """,
}

# Test 9: Campaigns with highest cost per click in their account
google_adwords_campaigns_highest_cpc_in_account = {
    "description": "Campaigns with the highest CPC in their account",
    "message": "Find the AdWords campaign with the highest cost per click within each account. Join campaign to campaign stats tables. Calculate CPC as total cost micros divided by total clicks (handling zero clicks). For each account, only include the campaign(s) with the maximum CPC. Return campaign id, name, account id, and CPC. Order by campaign id ascending, using account id ascending as a tiebreaker.",
    "table_names": ["google_adwords_data.campaign", "google_adwords_data.campaign_stats"],
    "query_description": """
* The query should use google_adwords_data.campaign and google_adwords_data.campaign_stats tables
* The query should use a CTE or derived table to calculate CPC (cost per click) for each campaign
* CPC should be calculated as: total cost_micros / total clicks (with handling for zero clicks)
* The query should group by campaign (campaign.id, name, account_id)
* The query should use a correlated subquery to find the maximum CPC within each account
* The query should filter to only include campaigns where their CPC equals the max CPC for their account
* The query should return campaign details (campaign_id, name, account_id, cpc)
* The query should order by campaign id ascending, account id ascending as secondary tiebreaker
    """,
    "reference_query": """
WITH campaign_cpc AS (
  SELECT
    c.id AS campaign_id,
    c.name,
    c.account_id,
    CASE
      WHEN SUM(cs.clicks) = 0 THEN 0
      ELSE SUM(cs.cost_micros)::NUMERIC / NULLIF(SUM(cs.clicks), 0)
    END AS cpc
  FROM google_adwords_data.campaign c
  JOIN google_adwords_data.campaign_stats cs ON c.id = cs.campaign_id
  GROUP BY c.id, c.name, c.account_id
)
SELECT
  cc.campaign_id,
  cc.name,
  cc.account_id,
  cc.cpc
FROM campaign_cpc cc
WHERE cc.cpc = (
  SELECT MAX(cc2.cpc)
  FROM campaign_cpc cc2
  WHERE cc2.account_id = cc.account_id
)
ORDER BY cc.campaign_id ASC, cc.account_id ASC
    """,
}

# Test 10: Job postings with at-or-above-average application counts
lever_job_postings_above_average_applications = {
    "description": "Job postings with at-or-above-average application counts",
    "message": "Find Lever job postings with at least the average number of applications. Left join posting to application tables. Count applications per posting. Use a subquery to find the average application count across all postings, then filter to only include postings with at least that many applications. Return id, job title, and application count. Order by application count descending, using id ascending as a tiebreaker.",
    "table_names": ["lever_data.posting", "lever_data.application"],
    "query_description": """
* The query should use lever_data.posting and lever_data.application tables
* The query should join posting to application on posting.id = application.posting_id
* The query should group by posting (GROUP BY posting.id, posting.text)
* The query should count applications per posting using COUNT(application.id)
* The query should use a subquery to calculate the average application count across all postings
* The query should filter using HAVING clause to only include postings whose count is >= the average
* The query should order by application count descending, posting id ascending as tiebreaker
    """,
    "reference_query": """
SELECT
  p.id,
  p.text AS job_title,
  COUNT(a.id) AS application_count
FROM lever_data.posting p
LEFT JOIN lever_data.application a ON p.id = a.posting_id
GROUP BY p.id, p.text
HAVING COUNT(a.id) >= (
  SELECT AVG(app_count)
  FROM (
    SELECT COUNT(*) AS app_count
    FROM lever_data.application
    GROUP BY posting_id
  ) AS posting_app_counts
)
ORDER BY application_count DESC, p.id ASC
    """,
}

# Export test data and metadata for benchmark creation
TEST_DATA = [
    stripe_customers_spending_above_average,
    shopify_products_never_in_order,
    salesforce_accounts_with_opportunities,
    shopify_customers_who_purchased_apparel,
    salesforce_leads_never_converted,
    stripe_invoices_above_customer_average,
    shopify_customers_with_order_count,
    brex_departments_above_average_expenses,
    google_adwords_campaigns_highest_cpc_in_account,
    lever_job_postings_above_average_applications,
]
