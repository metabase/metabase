"""
Tier 2: Date/Time Operations SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
date and time operations, including date arithmetic, DATE_TRUNC, EXTRACT,
and temporal filtering.
"""

# Export test data and metadata for benchmark creation
TEST_DATA = [
    # Test: Relative date filter (last 30 days)
    {
        "description": "Google AdWords daily spend for last 30 days",
        "message": "Show daily AdWords spend for the last 30 days. Only include dates within the past 30 days. Convert cost micros to dollars by dividing by one million. Group by date. Return date and total spend in dollars. Order by date descending.",
        "table_names": ["google_adwords_data.campaign_stats"],
        "query_description": """
* The query should use google_adwords_data.campaign_stats table
* The query should filter for dates in the last 30 days (date >= CURRENT_DATE - INTERVAL '30 days' or equivalent)
* The query should aggregate spending by day (GROUP BY date)
* The query should calculate total spend by converting cost_micros to dollars (divide by 1000000)
* The query should order by date descending
* The query should include date and total spend columns
        """,
        "reference_query": """
SELECT date,
       SUM(cost_micros / 1000000.0) as total_spend
FROM google_adwords_data.campaign_stats
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC
        """,
    },
    # Test: Relative date filter with join
    {
        "description": "Stripe customers who canceled in last 90 days",
        "message": "Which Stripe customers had subscriptions canceled in the last 90 days? Join subscription to customer tables. Only include subscriptions that have been canceled and where the cancelation happened within the past 90 days. Return customer details and cancelation date. Order by cancelation date descending, using customer id ascending as a tiebreaker.",
        "table_names": ["stripe_data.subscription", "stripe_data.customer"],
        "query_description": """
* The query should use stripe_data.subscription and stripe_data.customer tables
* The query should join subscription to customer on customer_id
* The query should filter for subscriptions where canceled_at is within the last 90 days (canceled_at >= CURRENT_DATE - INTERVAL '90 days' or equivalent relative date filter)
* The query should filter for subscriptions where canceled_at IS NOT NULL
* The query should order by canceled_at descending, with customer id ascending as tiebreaker
* The query should include customer information (id, email, name, etc.) and canceled_at timestamp
        """,
        "reference_query": """
SELECT c.id,
       c.email,
       c.name,
       c.description,
       c.created,
       c.balance,
       c.currency,
       c.delinquent,
       c.default_source,
       s.canceled_at
FROM stripe_data.subscription s
JOIN stripe_data.customer c ON s.customer_id = c.id
WHERE s.canceled_at >= CURRENT_DATE - INTERVAL '90 days'
  AND s.canceled_at IS NOT NULL
ORDER BY s.canceled_at DESC, c.id ASC
        """,
    },
    # Test: Date arithmetic (time between events)
    {
        "description": "Average time to first contact with Salesforce contacts",
        "message": "What is the average time to first contact for Salesforce contacts? Join task to contact tables. Only include tasks created at or after the contact was created. Calculate the time difference in days between task creation and contact creation. Return the average time in days as a single value.",
        "table_names": ["salesforce_data.contact", "salesforce_data.task"],
        "query_description": """
* The query should use salesforce_data.contact and salesforce_data.task tables
* The query should join task to contact on who_id (task.who_id = contact.id)
* The query should calculate the time difference between task.created_date and contact.created_date
* The query should filter to ensure task was created after or at the same time as the contact (task.created_date >= contact.created_date)
* The query should calculate the average of these time differences in days
* The query should return a single row with the average days value
        """,
        "reference_query": """
SELECT AVG(EXTRACT(EPOCH FROM (t.created_date - c.created_date)) / 86400) as avg_days_to_first_contact
FROM salesforce_data.contact c
JOIN salesforce_data.task t ON c.id = t.who_id
WHERE t.created_date >= c.created_date
        """,
    },
    # Test: Quarterly revenue grouping
    {
        "description": "Stripe revenue by quarter",
        "message": "What is the Stripe invoice revenue by quarter? Extract year and quarter from the created timestamp. Sum amount paid per quarter. Return year, quarter, and total revenue. Order by year ascending, then quarter ascending.",
        "table_names": ["stripe_data.invoice"],
        "query_description": """
* The query should use stripe_data.invoice table
* The query should extract year and quarter from the created timestamp
* The query should sum the amount_paid column to calculate total revenue
* The query should group by year and quarter
* The query should order by year ascending, quarter ascending
* The query should include year, quarter, and total_revenue columns
        """,
        "reference_query": """
SELECT EXTRACT(YEAR FROM created) as year,
       EXTRACT(QUARTER FROM created) as quarter,
       SUM(amount_paid) as total_revenue
FROM stripe_data.invoice
GROUP BY EXTRACT(YEAR FROM created), EXTRACT(QUARTER FROM created)
ORDER BY year ASC, quarter ASC
        """,
    },
    # Test: Year-over-year comparison
    {
        "description": "Shopify order volume by year",
        "message": "What is the Shopify order volume by year? Extract the year from the created at timestamp. Count orders per year. Return year and order count. Order by year ascending.",
        "table_names": ["shopify_data.order"],
        "query_description": """
* The query should use shopify_data.order table
* The query should extract year from the created_at timestamp
* The query should count the total number of orders per year
* The query should group by year
* The query should order by year ascending
* The query should include year and order_count columns
        """,
        "reference_query": """
SELECT EXTRACT(YEAR FROM created_at) as year,
       COUNT(*) as order_count
FROM shopify_data.order
GROUP BY EXTRACT(YEAR FROM created_at)
ORDER BY year ASC
        """,
    },
    # Test: Day of week analysis
    {
        "description": "Customer.io email deliveries by day of week",
        "message": "How many Customer.io email deliveries happen on each day of the week? Get the day name and count deliveries per day. Return day name and delivery count. Order by day of week numerically with Sunday first.",
        "table_names": ["customerio_data.deliveries"],
        "query_description": """
* The query should use customerio_data.deliveries table
* The query should extract day of week from created_at timestamp
* The query should count deliveries per day of week
* The query should group by day of week
* The query should order by day of week numerically (Sunday=0, Monday=1, ..., Saturday=6)
* The query should include day_of_week name and delivery_count columns
        """,
        "reference_query": """
SELECT TO_CHAR(created_at, 'Day') as day_of_week,
       COUNT(*) as delivery_count
FROM customerio_data.deliveries
GROUP BY TO_CHAR(created_at, 'Day'), EXTRACT(DOW FROM created_at)
ORDER BY EXTRACT(DOW FROM created_at)
        """,
    },
    # Test: Age calculation
    {
        "description": "Open opportunities by age in days",
        "message": "Show open Salesforce opportunities with their age in days. Only include opportunities that are not closed. Calculate age as the number of days since the opportunity was created. Return id, name, and age in days. Order by age descending, using id ascending as a tiebreaker.",
        "table_names": ["salesforce_data.opportunity"],
        "query_description": """
* The query should use salesforce_data.opportunity table
* The query should filter for open opportunities (is_closed = false)
* The query should calculate age in days as the difference between current date and created_date
* The query should order by age_in_days descending, with opportunity id ascending as tiebreaker
* The query should include opportunity id, name, and age_in_days columns
        """,
        "reference_query": """
SELECT id,
       name,
       CURRENT_DATE - created_date::date as age_in_days
FROM salesforce_data.opportunity
WHERE is_closed = false
ORDER BY age_in_days DESC, id ASC
        """,
    },
    # Test: Current month filtering with fixed date context
    {
        "description": "Brex transactions for current month",
        "message": "Show Brex transactions from the current month (November 2024). Only include transactions posted in the current calendar month. Return all columns. Order by posted time descending, using id ascending as a tiebreaker.",
        "table_names": ["brex_data.transaction"],
        "context": {
            "user_is_viewing": [],
            "current_time_with_timezone": "2024-11-15T12:00:00+00:00",
            "capabilities": [
                "frontend_navigate_user_v1",
                "permission_write_sql_query",
                "permission_save_questions",
            ],
        },
        "query_description": """
* The query should use brex_data.transaction table
* The query should filter for transactions in the current month (November 2024 based on context)
* The query should use DATE_TRUNC('month', posted_at_time) to match the current month, or equivalent relative date logic
* The query should order by posted_at_time descending, with transaction id ascending as tiebreaker
* The query should include all columns from the transaction table
        """,
        "reference_query": """
SELECT *
FROM brex_data.transaction
WHERE DATE_TRUNC('month', posted_at_time) = DATE_TRUNC('month', '2024-11-15'::date)
ORDER BY posted_at_time DESC, id ASC
        """,
    },
]
