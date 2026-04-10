"""
Tier 2: CASE Statement and Conditional Logic SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
conditional logic:
- CASE WHEN statements for categorization
- Conditional aggregation (SUM/COUNT with CASE)
- Multi-condition classification
- Tier/bucket assignments
"""

# Test 1: Customer value segmentation
customer_value_segmentation = {
    "description": "Segment Stripe customers by spending tier",
    "message": "Segment Stripe customers by spending tier: High for over $10,000, Medium for $1,000 to $10,000, Low for under $1,000. Join customer to invoice tables. Sum invoice amounts per customer. Return customer details, total invoiced, and tier. Order by total descending, using customer id ascending as a tiebreaker.",
    "table_names": ["stripe_data.customer", "stripe_data.invoice"],
    "query_description": """
* The query should use stripe_data.customer and stripe_data.invoice tables
* The query should join customer to invoice on customer.id = invoice.customer_id
* The query should group by customer (GROUP BY customer.id, and optionally customer.name and customer.email)
* The query should calculate total invoice amounts per customer using SUM(amount_due)
* The query should use CASE statement to categorize customers into tiers:
  - High: total > 10000
  - Medium: total >= 1000 and <= 10000
  - Low: total < 1000
* The query should order by total invoiced descending, with customer id ascending as tiebreaker
* The query should include customer id, customer name, email, total invoiced, and value tier columns
    """,
    "reference_query": """
SELECT
  c.id as customer_id,
  c.name as customer_name,
  c.email,
  SUM(i.amount_due) as total_invoiced,
  CASE
    WHEN SUM(i.amount_due) > 10000 THEN 'High'
    WHEN SUM(i.amount_due) >= 1000 THEN 'Medium'
    ELSE 'Low'
  END as value_tier
FROM stripe_data.customer c
JOIN stripe_data.invoice i ON c.id = i.customer_id
GROUP BY c.id, c.name, c.email
ORDER BY total_invoiced DESC, c.id ASC
    """,
}

# Test 2: Deal size categorization
deal_size_categorization = {
    "description": "Categorize Salesforce opportunities by deal size",
    "message": "Categorize Salesforce opportunities by deal size: Enterprise for over $100K, Mid-Market for $10K to $100K, SMB for under $10K. Return opportunity details, amount, and size category. Order by amount descending, using opportunity id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity"],
    "query_description": """
* The query should use salesforce_data.opportunity table
* The query should use CASE statement to categorize opportunities by amount:
  - Enterprise: amount > 100000
  - Mid-Market: amount >= 10000 and <= 100000
  - SMB: amount < 10000
* The query should order by amount descending, with opportunity id ascending as tiebreaker
* The query should include opportunity id, name, amount, and deal size category columns
    """,
    "reference_query": """
SELECT
  id,
  name,
  amount,
  CASE
    WHEN amount > 100000 THEN 'Enterprise'
    WHEN amount >= 10000 THEN 'Mid-Market'
    ELSE 'SMB'
  END as deal_size
FROM salesforce_data.opportunity
ORDER BY amount DESC, id ASC
    """,
}

# Test 3: Lead scoring
lead_scoring = {
    "description": "Score Salesforce leads based on multiple criteria",
    "message": "Score Salesforce leads based on multiple criteria: 10 points if converted, 5 points if status is Qualified, 3 points if created within the last 30 days. Sum the points for each lead. Return lead details and calculated score. Order by score descending, using lead id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.lead"],
    "query_description": """
* The query should use salesforce_data.lead table
* The query should calculate a lead score using multiple CASE statements or a single expression:
  - Add 10 points if is_converted = true
  - Add 5 points if status = 'Qualified'
  - Add 3 points if created_date >= CURRENT_DATE - INTERVAL '30 days' (or within last 30 days)
* The query should order by lead score descending, with lead id ascending as tiebreaker
* The query should include lead id, first name, last name, email, status, is_converted, created_date, and lead score columns
    """,
    "reference_query": """
SELECT
  id,
  first_name,
  last_name,
  email,
  status,
  is_converted,
  created_date,
  (CASE WHEN is_converted = true THEN 10 ELSE 0 END +
   CASE WHEN status = 'Qualified' THEN 5 ELSE 0 END +
   CASE WHEN created_date >= CURRENT_DATE - INTERVAL '30 days' THEN 3 ELSE 0 END) as lead_score
FROM salesforce_data.lead
ORDER BY lead_score DESC, id ASC
    """,
}

# Test 4: Order fulfillment status
order_fulfillment_status = {
    "description": "Classify Shopify orders by fulfillment",
    "message": "How many Shopify orders are in each fulfillment status? Group by fulfillment status. Return status and order count. Order by count descending, using fulfillment status ascending as a tiebreaker.",
    "table_names": ["shopify_data.order"],
    "query_description": """
* The query should use shopify_data.order table
* The query should group by fulfillment_status
* The query should count orders per fulfillment status using COUNT(*)
* The query should order by order count descending, with fulfillment_status ascending as tiebreaker
* The query should include fulfillment_status and order count columns
    """,
    "reference_query": """
SELECT
  fulfillment_status,
  COUNT(*) as order_count
FROM shopify_data.order
GROUP BY fulfillment_status
ORDER BY order_count DESC, fulfillment_status ASC
    """,
}

# Test 5: Conditional revenue recognition
conditional_revenue_recognition = {
    "description": "Calculate recognized revenue based on invoice status",
    "message": "Calculate recognized revenue based on Stripe invoice status: paid invoices at 100% of amount due, open invoices at 50% of amount due, other statuses at 0. Return invoice details and recognized revenue. Order by recognized revenue descending, using invoice id ascending as a tiebreaker.",
    "table_names": ["stripe_data.invoice"],
    "query_description": """
* The query should use stripe_data.invoice table
* The query should use CASE statement to calculate recognized revenue:
  - When status = 'paid': amount_due * 1.0 (100%)
  - When status = 'open': amount_due * 0.5 (50%)
  - Otherwise: 0
* The query should order by recognized revenue descending, with invoice id ascending as tiebreaker
* The query should include invoice id, customer_id, status, amount_due, and recognized_revenue columns
    """,
    "reference_query": """
SELECT
  id,
  customer_id,
  status,
  amount_due,
  CASE
    WHEN status = 'paid' THEN amount_due * 1.0
    WHEN status = 'open' THEN amount_due * 0.5
    ELSE 0
  END as recognized_revenue
FROM stripe_data.invoice
ORDER BY recognized_revenue DESC, id ASC
    """,
}

# Test 6: Expense categorization
expense_categorization = {
    "description": "Classify Brex expenses by amount",
    "message": "Classify Brex expenses by size: Large for over $1,000, Medium for $250 to $1,000, Small for under $250. Return expense details and size category. Order by amount descending, using expense id ascending as a tiebreaker.",
    "table_names": ["brex_data.expense"],
    "query_description": """
* The query should use brex_data.expense table
* The query should use CASE statement to categorize expenses by amount:
  - Large: amount > 1000
  - Medium: amount >= 250 and <= 1000
  - Small: amount < 250
* The query should order by amount descending, with expense id ascending as tiebreaker
* The query should include expense id, amount, department_id, and expense size category columns
    """,
    "reference_query": """
SELECT
  id,
  amount,
  department_id,
  CASE
    WHEN amount > 1000 THEN 'Large'
    WHEN amount >= 250 THEN 'Medium'
    ELSE 'Small'
  END as expense_size
FROM brex_data.expense
ORDER BY amount DESC, id ASC
    """,
}

# Test 7: Opportunity stage grouping
opportunity_stage_grouping = {
    "description": "Group opportunities by sales stage phase",
    "message": "Group Salesforce opportunities by sales phase: Early Stage for Prospecting, Qualification, or Value Proposition; Middle Stage for Needs Analysis or Proposal/Price Quote; Late Stage for Negotiation/Review, Closed Won, or Closed Lost; Other for remaining stages. Return opportunity details, stage name, and phase. Order by stage name ascending, using opportunity id ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity"],
    "query_description": """
* The query should use salesforce_data.opportunity table
* The query should use CASE statement to categorize opportunities by stage_name:
  - Early Stage: stage_name IN ('Prospecting', 'Qualification', 'Value Proposition')
  - Middle Stage: stage_name IN ('Needs Analysis', 'Proposal/Price Quote')
  - Late Stage: stage_name IN ('Negotiation/Review', 'Closed Won', 'Closed Lost')
  - Other: any other stage_name values
* The query should order by stage_name ascending, with opportunity id ascending as tiebreaker
* The query should include opportunity id, name, stage_name, and stage_phase columns
    """,
    "reference_query": """
SELECT
  id,
  name,
  stage_name,
  CASE
    WHEN stage_name IN ('Prospecting', 'Qualification', 'Value Proposition') THEN 'Early Stage'
    WHEN stage_name IN ('Needs Analysis', 'Proposal/Price Quote') THEN 'Middle Stage'
    WHEN stage_name IN ('Negotiation/Review', 'Closed Won', 'Closed Lost') THEN 'Late Stage'
    ELSE 'Other'
  END as stage_phase
FROM salesforce_data.opportunity
ORDER BY stage_name ASC, id ASC
    """,
}

# Test 8: Subscription health status
subscription_health_status = {
    "description": "Classify subscriptions by health status",
    "message": "Classify Stripe subscriptions by health status: Active for active status, Canceled for canceled status, Trialing for trialing status, Other for remaining. Return subscription details and health status. Order by status ascending, using subscription id ascending as a tiebreaker.",
    "table_names": ["stripe_data.subscription"],
    "query_description": """
* The query should use stripe_data.subscription table
* The query should use CASE statement to categorize subscriptions by status:
  - Active: status = 'active'
  - Canceled: status = 'canceled'
  - Trialing: status = 'trialing'
  - Other: any other status values
* The query should order by status ascending, with subscription id ascending as tiebreaker
* The query should include subscription id, customer_id, status, and health_status columns
    """,
    "reference_query": """
SELECT
  id,
  customer_id,
  status,
  CASE
    WHEN status = 'active' THEN 'Active'
    WHEN status = 'canceled' THEN 'Canceled'
    WHEN status = 'trialing' THEN 'Trialing'
    ELSE 'Other'
  END as health_status
FROM stripe_data.subscription
ORDER BY status ASC, id ASC
    """,
}

# Export test data and metadata for benchmark creation
TEST_DATA = [
    customer_value_segmentation,
    deal_size_categorization,
    lead_scoring,
    order_fulfillment_status,
    conditional_revenue_recognition,
    expense_categorization,
    opportunity_stage_grouping,
    subscription_health_status,
]
