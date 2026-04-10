"""
Tier 2: Aggregation with HAVING Clause SQL Generation Tests

This module tests the agent's ability to construct SQL queries using
HAVING clauses to filter aggregated results.
"""

# Shopify (E-commerce)
shopify_customers_with_more_than_3_orders = {
    "description": "Customers with more than 3 orders",
    "message": "Which customers have placed more than 3 orders? Join customer to order tables. Group by customer and only include those with more than 3 orders. Return customer details and order count. Order by order count descending, using customer id ascending as a tiebreaker.",
    "table_names": ["shopify_data.customer", "shopify_data.order"],
    "query_description": """
* The query should use tables from shopify_data schema (customer and order are required)
* The query should join customer and order tables on customer_id
* The query should aggregate by customer (GROUP BY customer id)
* The query should count orders using COUNT(order.id) or COUNT(*)
* The query should filter groups using HAVING COUNT(*) > 3 or equivalent
* The query should order by order count descending, with customer id ascending as tiebreaker
* The query should include customer id, email, and order count columns
    """,
    "reference_query": """
SELECT c.id,
       c.email,
       COUNT(o.id) as order_count
FROM shopify_data.customer c
JOIN shopify_data.order o ON c.id = o.customer_id
GROUP BY c.id, c.email
HAVING COUNT(o.id) > 3
ORDER BY order_count DESC, c.id ASC
    """,
}

shopify_product_titles_in_more_than_70_orders = {
    "description": "Product titles appearing in more than 70 orders",
    "message": "Which product titles appear in more than 70 distinct orders? Join product to order line tables. Group by product title and count distinct orders for each title. Only include titles appearing in more than 70 orders. Return product title and order count. Order by order count descending, using product title ascending as a tiebreaker.",
    "table_names": ["shopify_data.product", "shopify_data.order_line"],
    "query_description": """
* The query should use tables from shopify_data schema (product and order_line are required)
* The query should join product and order_line tables on product_id
* The query should aggregate by product title only (GROUP BY p.title), not by product id
* The query should count distinct orders using COUNT(DISTINCT order_id)
* The query should filter groups using HAVING COUNT(DISTINCT order_id) > 70 or equivalent
* The query should order by order count descending, with product title ascending as tiebreaker
* The query should include product title and order count columns
    """,
    "reference_query": """
SELECT p.title,
       COUNT(DISTINCT ol.order_id) as order_count
FROM shopify_data.product p
JOIN shopify_data.order_line ol ON p.id = ol.product_id
GROUP BY p.title
HAVING COUNT(DISTINCT ol.order_id) > 70
ORDER BY order_count DESC, p.title ASC
    """,
}

# Google AdWords (Search Advertising)
google_adwords_campaigns_spending_over_1000 = {
    "description": "Google AdWords campaigns spending over $1,000",
    "message": "Which AdWords campaigns have spent over $1,000? Join campaign to campaign stats tables. Convert cost micros to dollars by dividing by one million. Group by campaign and only include those with total spend over 1000. Return campaign details and total spend in dollars. Order by spend descending, using campaign id ascending as a tiebreaker.",
    "table_names": ["google_adwords_data.campaign", "google_adwords_data.campaign_stats"],
    "query_description": """
* The query should use tables from google_adwords_data schema (campaign and campaign_stats are required)
* The query should join campaign and campaign_stats tables on campaign_id
* The query should aggregate by campaign (GROUP BY campaign id)
* The query should calculate total spend by converting cost_micros to dollars using SUM(cost_micros / 1000000.0) or equivalent
* The query should filter groups using HAVING with total spend > 1000 or equivalent
* The query should order by total spend descending, with campaign id ascending as tiebreaker
* The query should include campaign id, name, and total spend columns
    """,
    "reference_query": """
SELECT c.id,
       c.name,
       SUM(cs.cost_micros / 1000000.0) as total_spend
FROM google_adwords_data.campaign c
JOIN google_adwords_data.campaign_stats cs ON c.id = cs.campaign_id
GROUP BY c.id, c.name
HAVING SUM(cs.cost_micros / 1000000.0) > 1000
ORDER BY total_spend DESC, c.id ASC
    """,
}

# Salesforce (CRM)
salesforce_sales_reps_with_pipeline_over_470000 = {
    "description": "Sales reps with pipeline over $470,000",
    "message": "Which sales reps have an opportunity pipeline over $470,000? Join opportunity to user tables. Sum opportunity amounts per rep and only include those with total pipeline over 470000. Return rep details and total pipeline value. Order by pipeline value descending, using user id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity", "salesforce_data.user"],
    "query_description": """
* The query should use tables from salesforce_data schema (opportunity and user are required)
* The query should join opportunity and user tables on owner_id = user.id
* The query should aggregate by user (GROUP BY user id)
* The query should calculate total pipeline value using SUM(amount)
* The query should filter groups using HAVING SUM(amount) > 470000 or equivalent
* The query should order by total pipeline value descending, with user id ascending as tiebreaker
* The query should include user id, rep name (as first_name and last_name columns, or concatenated), and total pipeline value columns
    """,
    "reference_query": """
SELECT u.id,
       u.first_name,
       u.last_name,
       SUM(o.amount) as total_pipeline_value
FROM salesforce_data.opportunity o
JOIN salesforce_data.user u ON o.owner_id = u.id
GROUP BY u.id, u.first_name, u.last_name
HAVING SUM(o.amount) > 470000
ORDER BY total_pipeline_value DESC, u.id ASC
    """,
}

# Brex (Corporate Expense Management)
brex_cards_with_more_than_10_transactions = {
    "description": "Brex cards with more than 10 transactions",
    "message": "Which Brex cards have more than 10 transactions? Group by card id and only include those with more than 10 transactions. Return card id and transaction count. Order by transaction count descending, using card id ascending as a tiebreaker.",
    "table_names": ["brex_data.transaction"],
    "query_description": """
* The query should use the brex_data.transaction table
* The query should aggregate by card_id (GROUP BY card_id)
* The query should count transactions using COUNT(*) or COUNT(id)
* The query should filter groups using HAVING COUNT(*) > 10 or equivalent
* The query should order by transaction count descending, with card_id ascending as tiebreaker
* The query should include card_id and transaction count columns
    """,
    "reference_query": """
SELECT card_id,
       COUNT(*) as transaction_count
FROM brex_data.transaction
GROUP BY card_id
HAVING COUNT(*) > 10
ORDER BY transaction_count DESC, card_id ASC
    """,
}

# Lever (Recruiting/ATS)
lever_candidates_with_more_than_1_interview = {
    "description": "Candidates with more than 1 interview",
    "message": "Which candidates have had more than 1 interview? Join opportunity to interview tables. Count interviews per candidate and only include those with more than 1 interview. Return candidate details and interview count. Order by interview count descending, using opportunity id ascending as a tiebreaker.",
    "table_names": ["lever_data.opportunity", "lever_data.interview"],
    "query_description": """
* The query should use tables from lever_data schema (opportunity and interview are required)
* The query should join opportunity and interview tables on opportunity_id
* The query should aggregate by candidate/opportunity (GROUP BY opportunity id)
* The query should count interviews using COUNT(interview.id) or COUNT(*)
* The query should filter groups using HAVING COUNT(*) > 1 or equivalent
* The query should order by interview count descending, with candidate/opportunity id ascending as tiebreaker
* The query should include candidate/opportunity id, name, and interview count columns
    """,
    "reference_query": """
SELECT o.id,
       o.name as candidate_name,
       COUNT(i.id) as interview_count
FROM lever_data.opportunity o
JOIN lever_data.interview i ON o.id = i.opportunity_id
GROUP BY o.id, o.name
HAVING COUNT(i.id) > 1
ORDER BY interview_count DESC, o.id ASC
    """,
}

# Stripe (Subscription Billing)
stripe_customers_with_more_than_10_invoices = {
    "description": "Stripe customers with more than 10 invoices",
    "message": "Which Stripe customers have more than 10 invoices? Join customer to invoice tables. Count invoices per customer and only include those with more than 10 invoices. Return customer details and invoice count. Order by invoice count descending, using customer id ascending as a tiebreaker.",
    "table_names": ["stripe_data.customer", "stripe_data.invoice"],
    "query_description": """
* The query should use tables from stripe_data schema (customer and invoice are required)
* The query should join customer and invoice tables on customer_id
* The query should aggregate by customer (GROUP BY customer id)
* The query should count invoices using COUNT(invoice.id) or COUNT(*)
* The query should filter groups using HAVING COUNT(*) > 10 or equivalent
* The query should order by invoice count descending, with customer id ascending as tiebreaker
* The query should include customer id, email, and invoice count columns
    """,
    "reference_query": """
SELECT c.id,
       c.email,
       COUNT(i.id) as invoice_count
FROM stripe_data.customer c
JOIN stripe_data.invoice i ON c.id = i.customer_id
GROUP BY c.id, c.email
HAVING COUNT(i.id) > 10
ORDER BY invoice_count DESC, c.id ASC
    """,
}

# QuickBooks (Accounting)
quickbooks_customers_with_unpaid_balances_over_1000 = {
    "description": "QuickBooks customers with unpaid balances over $1,000",
    "message": "Which QuickBooks customers have unpaid invoice balances over $1,000? Join invoice to customer tables. Sum invoice balances per customer and only include those with total balance over 1000. Return customer details and total unpaid amount. Order by total unpaid descending, using customer id ascending as a tiebreaker.",
    "table_names": ["quickbooks_data.invoice", "quickbooks_data.customer"],
    "query_description": """
* The query should use tables from quickbooks_data schema (invoice and customer are required)
* The query should join invoice and customer tables on customer_ref_value = customer.id
* The query should aggregate by customer (GROUP BY customer id)
* The query should sum invoice balances using SUM(balance)
* The query should filter groups using HAVING SUM(balance) > 1000 or equivalent
* The query should order by total unpaid descending, with customer id ascending as tiebreaker
* The query should include customer id, display_name, and total unpaid columns
    """,
    "reference_query": """
SELECT c.id,
       c.display_name,
       SUM(i.balance) as total_unpaid
FROM quickbooks_data.invoice i
JOIN quickbooks_data.customer c ON i.customer_ref_value = c.id
GROUP BY c.id, c.display_name
HAVING SUM(i.balance) > 1000
ORDER BY total_unpaid DESC, c.id ASC
    """,
}

# Export test data and metadata for benchmark creation
TEST_DATA = [
    shopify_customers_with_more_than_3_orders,
    shopify_product_titles_in_more_than_70_orders,
    google_adwords_campaigns_spending_over_1000,
    salesforce_sales_reps_with_pipeline_over_470000,
    brex_cards_with_more_than_10_transactions,
    lever_candidates_with_more_than_1_interview,
    stripe_customers_with_more_than_10_invoices,
    quickbooks_customers_with_unpaid_balances_over_1000,
]
