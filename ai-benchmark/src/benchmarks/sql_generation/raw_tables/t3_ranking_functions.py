"""
Tier 3: Ranking/Window Functions SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
ranking and window functions:
- ROW_NUMBER, RANK, DENSE_RANK
- NTILE for percentile buckets
- Partition-based rankings
- Top N per group patterns
"""

# Test 1: Top 20% of customers by revenue (NTILE window function)
top_20_customers_by_revenue = {
    "description": "Top 20% of customers by revenue",
    "message": "Find the top 20% of Stripe customers by revenue. Join customer to invoice tables. Calculate total revenue as the sum of amount due per customer. Divide customers into 5 quintiles by revenue and filter to only include the top quintile. Return id, name, email, total revenue, and revenue quintile. Order by total revenue descending, using id ascending as a tiebreaker.",
    "table_names": ["stripe_data.customer", "stripe_data.invoice"],
    "query_description": """
* The query should use stripe_data.customer and stripe_data.invoice tables
* The query should join customer to invoice on customer.id = invoice.customer_id
* The query should group by customer (GROUP BY customer.id, and potentially customer.name, customer.email)
* The query should calculate total revenue per customer by summing invoice.amount_due
* The query should use NTILE(5) window function to divide customers into 5 quintiles based on total revenue descending
* The query should filter to only include customers in quintile 1 (top 20%)
* The query should order by total revenue descending, customer id ascending as tiebreaker
    """,
    "reference_query": """
WITH customer_revenue AS (
  SELECT
    c.id,
    c.name,
    c.email,
    SUM(i.amount_due) as total_revenue,
    NTILE(5) OVER (ORDER BY SUM(i.amount_due) DESC) as revenue_quintile
  FROM stripe_data.customer c
  JOIN stripe_data.invoice i ON c.id = i.customer_id
  GROUP BY c.id, c.name, c.email
)
SELECT *
FROM customer_revenue
WHERE revenue_quintile = 1
ORDER BY total_revenue DESC, id ASC
    """,
}

# Test 2: Sales rep rankings by opportunity value (RANK window function)
sales_rep_rankings_by_opportunity_value = {
    "description": "Sales rep rankings by opportunity value",
    "message": "Rank Salesforce sales reps by total opportunity value. Left join user to opportunity tables, including all users even those without opportunities. Calculate total opportunity value as the sum of amounts per rep. Rank them with ties receiving the same rank. Return user id, sales rep email, total opportunity value, and rank. Order by rank ascending, using user id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity", "salesforce_data.user"],
    "query_description": """
* The query should use salesforce_data.opportunity and salesforce_data.user tables
* The query should use LEFT JOIN to include all users, even those without opportunities
* The query should join user to opportunity on user.id = opportunity.owner_id
* The query should group by user (GROUP BY user.id, and potentially user.email)
* The query should calculate total opportunity value per sales rep by summing opportunity.amount (using COALESCE to handle NULLs)
* The query should use RANK() window function to rank sales reps by total opportunity value descending
* The query should order by rank ascending, user id ascending as tiebreaker
    """,
    "reference_query": """
SELECT
  u.id as user_id,
  u.email as sales_rep,
  COALESCE(SUM(o.amount), 0) as total_opportunity_value,
  RANK() OVER (ORDER BY COALESCE(SUM(o.amount), 0) DESC) as rank
FROM salesforce_data.user u
LEFT JOIN salesforce_data.opportunity o ON u.id = o.owner_id
GROUP BY u.id, u.email
ORDER BY rank ASC, u.id ASC
    """,
}

# Test 3: Product rankings by revenue without gaps (DENSE_RANK window function)
# NOTE: Changed from quantity to revenue due to massive ties in quantity data
product_rankings_by_revenue_dense = {
    "description": "Product rankings by revenue without gaps",
    "message": "Rank Shopify products by revenue using dense ranking (no gaps in rank numbers). Join product to order line tables. Calculate total revenue as the sum of price times quantity per product. Products with the same revenue should get the same rank, and the next rank should be the immediately following number. Return id, title, total revenue, and rank. Order by rank ascending, using id ascending as a tiebreaker.",
    "table_names": ["shopify_data.product", "shopify_data.order_line"],
    "query_description": """
* The query should use shopify_data.product and shopify_data.order_line tables
* The query should join product to order_line on product.id = order_line.product_id
* The query should group by product (GROUP BY product.id, and potentially product.title)
* The query should calculate total revenue per product by summing (order_line.price * order_line.quantity)
* The query should use DENSE_RANK() window function to rank products by total revenue descending
* DENSE_RANK ensures no gaps in ranking when there are ties
* The query should order by rank ascending, product id ascending as tiebreaker
    """,
    "reference_query": """
SELECT
  p.id,
  p.title,
  SUM(ol.price * ol.quantity) as total_revenue,
  DENSE_RANK() OVER (ORDER BY SUM(ol.price * ol.quantity) DESC) as rank
FROM shopify_data.product p
JOIN shopify_data.order_line ol ON p.id = ol.product_id
GROUP BY p.id, p.title
ORDER BY rank ASC, p.id ASC
    """,
}

# Test 4: Campaign performance sequential ranking (ROW_NUMBER)
campaign_rankings_by_impressions_unique = {
    "description": "Campaign rankings by impressions with unique ranks",
    "message": "Rank AdWords campaigns by impressions with unique sequential ranks (no ties). Join campaign to campaign stats tables. Calculate total impressions per campaign. Each campaign should get a unique rank number even if impressions are tied. Return id, name, total impressions, and rank. Order by rank ascending, using id ascending as a tiebreaker.",
    "table_names": ["google_adwords_data.campaign_stats", "google_adwords_data.campaign"],
    "query_description": """
* The query should use google_adwords_data.campaign and google_adwords_data.campaign_stats tables
* The query should join campaign to campaign_stats on campaign.id = campaign_stats.campaign_id
* The query should group by campaign (GROUP BY campaign.id, and potentially campaign.name)
* The query should calculate total impressions per campaign by summing campaign_stats.impressions
* The query should use ROW_NUMBER() window function to assign unique sequential ranks based on total impressions descending
* ROW_NUMBER ensures each campaign gets a unique rank even if there are ties in impressions
* The query should order by rank ascending, campaign id ascending as tiebreaker
    """,
    "reference_query": """
SELECT
  c.id,
  c.name,
  SUM(cs.impressions) as total_impressions,
  ROW_NUMBER() OVER (ORDER BY SUM(cs.impressions) DESC) as rank
FROM google_adwords_data.campaign c
JOIN google_adwords_data.campaign_stats cs ON c.id = cs.campaign_id
GROUP BY c.id, c.name
ORDER BY rank ASC, c.id ASC
    """,
}

# Test 5: Customer segmentation into quartiles (NTILE)
segment_customers_into_revenue_quartiles = {
    "description": "Segment customers into revenue quartiles",
    "message": "Segment Stripe customers into revenue quartiles. Join customer to invoice tables. Calculate total revenue as the sum of amount due per customer. Divide customers into 4 quartiles based on revenue descending. Return id, name, email, total revenue, and revenue quartile. Order by total revenue descending, using id ascending as a tiebreaker.",
    "table_names": ["stripe_data.customer", "stripe_data.invoice"],
    "query_description": """
* The query should use stripe_data.customer and stripe_data.invoice tables
* The query should join customer to invoice on customer.id = invoice.customer_id
* The query should group by customer (GROUP BY customer.id, and potentially customer.name, customer.email)
* The query should calculate total revenue per customer by summing invoice.amount_due
* The query should use NTILE(4) window function to divide customers into 4 quartiles based on total revenue descending
* The query should order by total revenue descending, customer id ascending as tiebreaker
    """,
    "reference_query": """
WITH customer_revenue AS (
  SELECT
    c.id,
    c.name,
    c.email,
    SUM(i.amount_due) as total_revenue,
    NTILE(4) OVER (ORDER BY SUM(i.amount_due) DESC) as revenue_quartile
  FROM stripe_data.customer c
  JOIN stripe_data.invoice i ON c.id = i.customer_id
  GROUP BY c.id, c.name, c.email
)
SELECT *
FROM customer_revenue
ORDER BY total_revenue DESC, id ASC
    """,
}

# Test 6: Rankings within partitions (RANK with PARTITION BY)
top_expense_by_category_within_department = {
    "description": "Top expense by category within each department",
    "message": "Rank Brex expenses within each department by amount. Join expense to department tables. For each department separately, rank expenses by amount descending. Ties should receive the same rank. Return expense id, amount, department id, department name, and rank in department. Order by department id ascending, then rank ascending, using expense id ascending as a tiebreaker.",
    "table_names": ["brex_data.expense", "brex_data.department"],
    "query_description": """
* The query should use brex_data.expense and brex_data.department tables
* The query should join expense to department on expense.department_id = department.id
* The query should use RANK() window function with PARTITION BY department_id
* The window function should rank expenses by amount descending within each department
* RANK allows ties (same rank for same amount) within each partition
* The query should order by department_id ascending, rank ascending, expense id ascending as tiebreaker
    """,
    "reference_query": """
SELECT
  e.id,
  e.amount,
  e.department_id,
  d.name as department_name,
  RANK() OVER (PARTITION BY e.department_id ORDER BY e.amount DESC) as rank_in_department
FROM brex_data.expense e
JOIN brex_data.department d ON e.department_id = d.id
ORDER BY e.department_id ASC, rank_in_department ASC, e.id ASC
    """,
}

# Test 7: Bottom performers identification (RANK with bottom N filter)
least_active_job_postings = {
    "description": "Least active job postings by application count",
    "message": "Find the 5 Lever job postings with the fewest applications. Left join posting to application tables to include postings with zero applications. Count applications per posting and rank them ascending so fewest applications rank first. Only include postings ranked 5 or better. Return id, posting title, application count, and rank. Order by rank ascending, using id ascending as a tiebreaker.",
    "table_names": ["lever_data.posting", "lever_data.application"],
    "query_description": """
* The query should use lever_data.posting and lever_data.application tables
* The query should LEFT JOIN posting to application on posting.id = application.posting_id (LEFT JOIN to include postings with 0 applications)
* The query should group by posting (GROUP BY posting.id, and potentially posting.text)
* The query should count applications per posting using COUNT(application.id)
* The query should use RANK() window function to rank postings by application count ascending
* The query should filter to only include postings where rank <= 5
* The query should order by rank ascending, posting id ascending as tiebreaker
    """,
    "reference_query": """
WITH posting_applications AS (
  SELECT
    p.id,
    p.text as posting_title,
    COUNT(a.id) as application_count,
    RANK() OVER (ORDER BY COUNT(a.id) ASC) as rank
  FROM lever_data.posting p
  LEFT JOIN lever_data.application a ON p.id = a.posting_id
  GROUP BY p.id, p.text
)
SELECT *
FROM posting_applications
WHERE rank <= 5
ORDER BY rank ASC, id ASC
    """,
}

# Test 8: Percentile ranking by total opportunity amount (PERCENT_RANK)
# NOTE: Changed from win rate to total amount due to binary win rate data (0% or 100% only)
opportunity_amount_percentile_by_sales_rep = {
    "description": "Opportunity amount percentile by sales rep",
    "message": "Calculate the percentile rank of Salesforce sales reps by total opportunity amount. Join opportunity to user tables. Calculate total amount per rep. Calculate each rep's percentile rank (a value between 0 and 1) based on total amount descending. Return user id, sales rep email, total amount, and percentile rank. Order by total amount descending, using user id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity", "salesforce_data.user"],
    "query_description": """
* The query should use salesforce_data.opportunity and salesforce_data.user tables
* The query should join opportunity to user on opportunity.owner_id = user.id
* The query should group by user (GROUP BY user.id, and potentially user.email)
* The query should calculate total opportunity amount per sales rep by summing opportunity.amount
* The query should use PERCENT_RANK() window function to calculate percentile rank based on total amount descending
* PERCENT_RANK returns a value between 0 and 1 representing the relative rank
* The query should order by total amount descending, user id ascending as tiebreaker
    """,
    "reference_query": """
WITH rep_amounts AS (
  SELECT
    u.id as user_id,
    u.email as sales_rep,
    SUM(o.amount) as total_amount,
    PERCENT_RANK() OVER (ORDER BY SUM(o.amount) DESC) as percentile_rank
  FROM salesforce_data.opportunity o
  JOIN salesforce_data.user u ON o.owner_id = u.id
  GROUP BY u.id, u.email
)
SELECT *
FROM rep_amounts
ORDER BY total_amount DESC, user_id ASC
    """,
}

# Test 9: Time period rankings (RANK for temporal analysis)
monthly_revenue_rankings = {
    "description": "Monthly revenue rankings across all months",
    "message": "Rank months by total Stripe revenue. Group by calendar month and calculate total revenue as sum of amount due. Rank months by total revenue descending. Return month, total revenue, and rank. Order by rank ascending, using month ascending as a tiebreaker.",
    "table_names": ["stripe_data.invoice"],
    "query_description": """
* The query should use stripe_data.invoice table
* The query should truncate invoice.created to month using DATE_TRUNC('month', created)
* The query should group by the truncated month
* The query should calculate total revenue per month by summing invoice.amount_due
* The query should use RANK() window function to rank months by total revenue descending
* The query should order by rank ascending, month ascending as tiebreaker
    """,
    "reference_query": """
WITH monthly_revenue AS (
  SELECT
    DATE_TRUNC('month', created) as month,
    SUM(amount_due) as total_revenue,
    RANK() OVER (ORDER BY SUM(amount_due) DESC) as rank
  FROM stripe_data.invoice
  GROUP BY DATE_TRUNC('month', created)
)
SELECT *
FROM monthly_revenue
ORDER BY rank ASC, month ASC
    """,
}

# Test 10: Multi-criteria ranking (RANK with multiple ORDER BY criteria)
account_rankings_by_opportunity_value_and_count = {
    "description": "Account rankings by opportunity value and count",
    "message": "Rank Salesforce accounts by opportunity value with count as a tiebreaker. Left join account to opportunity tables, including all accounts even those without opportunities. Calculate total opportunity value as sum of amounts and count opportunities per account. Rank by total value descending first, then by opportunity count descending as a tiebreaker. Return id, name, total opportunity value, opportunity count, and rank. Order by rank ascending, using id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.account", "salesforce_data.opportunity"],
    "query_description": """
* The query should use salesforce_data.account and salesforce_data.opportunity tables
* The query should use LEFT JOIN to include all accounts, even those without opportunities
* The query should join account to opportunity on account.id = opportunity.account_id
* The query should group by account (GROUP BY account.id, and potentially account.name)
* The query should calculate total opportunity value per account by summing opportunity.amount (using COALESCE to handle NULLs)
* The query should count opportunities per account using COUNT(opportunity.id)
* The query should use RANK() window function with multi-criteria ordering: ORDER BY total_opportunity_value DESC, opportunity_count DESC
* The query should order by rank ascending, account id ascending as tiebreaker
    """,
    "reference_query": """
SELECT
  a.id,
  a.name,
  COALESCE(SUM(o.amount), 0) as total_opportunity_value,
  COUNT(o.id) as opportunity_count,
  RANK() OVER (ORDER BY COALESCE(SUM(o.amount), 0) DESC, COUNT(o.id) DESC) as rank
FROM salesforce_data.account a
LEFT JOIN salesforce_data.opportunity o ON a.id = o.account_id
GROUP BY a.id, a.name
ORDER BY rank ASC, a.id ASC
    """,
}

# Export test data and metadata for benchmark creation
TEST_DATA = [
    top_20_customers_by_revenue,
    sales_rep_rankings_by_opportunity_value,
    product_rankings_by_revenue_dense,
    campaign_rankings_by_impressions_unique,
    segment_customers_into_revenue_quartiles,
    top_expense_by_category_within_department,
    least_active_job_postings,
    opportunity_amount_percentile_by_sales_rep,
    monthly_revenue_rankings,
    account_rankings_by_opportunity_value_and_count,
]
