"""
Tier 2: Multi-Table Join SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
joins across three or more tables from raw data sources.
"""

# Shopify (E-commerce)
shopify_tests = [
    {
        "description": "Top 15 products by total revenue",
        "message": "What are the top 15 products by total revenue? Calculate revenue as the sum of quantity times price. Return product details and revenue. Order by revenue descending, using product id ascending as a tiebreaker. Limit to 15.",
        "table_names": ["shopify_data.order_line", "shopify_data.product"],
        "query_description": """
* The query should use tables from shopify_data schema (order_line and product are required)
* The query should join product and order_line tables
* The query should aggregate by product (GROUP BY product id and/or title)
* The query should calculate total revenue using SUM(quantity * price) or equivalent
* The query should order by total revenue descending, with product id ascending as tiebreaker
* The query should limit results to 15 rows
* The query should include product id, product title, and total revenue columns
        """,
        "reference_query": """
SELECT p.id,
       p.title,
       SUM(ol.quantity * ol.price) as total_revenue
FROM shopify_data.order_line ol
JOIN shopify_data.product p ON ol.product_id = p.id
GROUP BY p.id, p.title
ORDER BY total_revenue DESC, p.id ASC
LIMIT 15
        """,
    },
    {
        "description": "Total revenue for each product",
        "message": "What is the total revenue for each product? Calculate revenue as the sum of quantity times price. Return product details and revenue. Order by revenue descending, using product id ascending as a tiebreaker.",
        "table_names": ["shopify_data.order_line", "shopify_data.product"],
        "query_description": """
* The query should use tables from shopify_data schema (order_line and product are required)
* The query should join product and order_line tables
* The query should aggregate by product (GROUP BY product id and/or title)
* The query should calculate total revenue using SUM(quantity * price) or SUM(price * quantity)
* The query should include product id, product title, and total revenue columns
        """,
        "reference_query": """
SELECT p.id,
       p.title,
       SUM(ol.price * ol.quantity) as total_revenue
FROM shopify_data.order_line ol
JOIN shopify_data.product p ON ol.product_id = p.id
GROUP BY p.id, p.title
ORDER BY total_revenue DESC, p.id ASC
        """,
    },
    {
        "description": "Customer lifetime value with order details",
        "message": "Show customer lifetime value for customers with orders. Join customer to order and order line tables. Count distinct orders per customer and sum total spent as price times quantity. Only include customers who have placed orders. Return customer details, order count, and total spent. Order by total spent descending, using customer id ascending as a tiebreaker.",
        "table_names": ["shopify_data.customer", "shopify_data.order", "shopify_data.order_line"],
        "query_description": """
* The query should use tables from shopify_data schema (customer, order, and order_line are required)
* The query should join customer, order, and order_line tables
* The query should aggregate by customer (GROUP BY customer id)
* The query should calculate total spending using SUM(price * quantity) or equivalent
* The query should calculate number of orders using COUNT(DISTINCT order_id)
* The query should only include customers who have placed orders (INNER JOIN, not LEFT JOIN)
* The query should include customer id, customer identifying information, order count, and total spending columns
        """,
        "reference_query": """
SELECT c.id,
       c.email,
       c.first_name,
       c.last_name,
       COUNT(DISTINCT o.id) as order_count,
       SUM(ol.price * ol.quantity) as total_spent
FROM shopify_data.customer c
JOIN shopify_data.order o ON c.id = o.customer_id
JOIN shopify_data.order_line ol ON o.id = ol.order_id
GROUP BY c.id, c.email, c.first_name, c.last_name
ORDER BY total_spent DESC, c.id ASC
        """,
    },
]


# Brex (Corporate Expense Management)
brex_tests = [
    {
        "description": "Total Brex transaction spending by department",
        "message": "What is the total transaction spending by department? Join transaction to expense, and expense to department tables. Return department details and total spending. Order by spending descending, using department id ascending as a tiebreaker.",
        "table_names": ["brex_data.transaction", "brex_data.expense", "brex_data.department"],
        "query_description": """
* The query should use tables from brex_data schema (transaction, expense, and department are required)
* The query should join transaction to expense on transaction_id, and expense to department on department_id
* The query should aggregate by department (GROUP BY department id)
* The query should calculate total spending using SUM(transaction.amount)
* The query should order by total spending descending, with department id ascending as tiebreaker
* The query should include department id, department name, and total spending columns
        """,
        "reference_query": """
SELECT d.id,
       d.name as department_name,
       SUM(t.amount) as total_spending
FROM brex_data.transaction t
JOIN brex_data.expense e ON t.id = e.transaction_id
JOIN brex_data.department d ON e.department_id = d.id
GROUP BY d.id, d.name
ORDER BY total_spending DESC, d.id ASC
        """,
    },
    {
        "description": "Employee spending with card details",
        "message": "Show employee spending with card details. Join user to card, and card to transaction tables. Count distinct cards and transactions per user. Return employee details, card count, transaction count, and total spending. Order by spending descending, using user id ascending as a tiebreaker.",
        "table_names": ["brex_data.transaction", "brex_data.card", "brex_data.user"],
        "query_description": """
* The query should use tables from brex_data schema (transaction, card, and user are required)
* The query should join user to card on owner_user_id, and card to transaction on card_id
* The query should aggregate by user (GROUP BY user id)
* The query should calculate total spending using SUM(transaction.amount)
* The query should count distinct cards using COUNT(DISTINCT card.id)
* The query should count transactions using COUNT(transaction.id) or COUNT(*)
* The query should include user id, employee name (first_name and/or last_name), card count, transaction count, and total spending columns
        """,
        "reference_query": """
SELECT u.id,
       u.first_name,
       u.last_name,
       COUNT(DISTINCT c.id) as card_count,
       COUNT(t.id) as transaction_count,
       SUM(t.amount) as total_spending
FROM brex_data.user u
JOIN brex_data.card c ON u.id = c.owner_user_id
JOIN brex_data.transaction t ON c.id = t.card_id
GROUP BY u.id, u.first_name, u.last_name
ORDER BY total_spending DESC, u.id ASC
        """,
    },
    {
        "description": "Top merchants by transaction volume",
        "message": "Show top merchants by transaction volume. Join transaction to card, and card to user tables. Group by merchant name. Return merchant name, unique cardholders, transaction count, and total amount. Order by amount descending, using merchant name ascending as a tiebreaker.",
        "table_names": ["brex_data.transaction", "brex_data.card", "brex_data.user"],
        "query_description": """
* The query should use tables from brex_data schema (transaction, card, and user are required)
* The query should join transaction to card on card_id, and card to user on owner_user_id
* The query should aggregate by merchant name (GROUP BY merchant_name)
* The query should calculate total spending using SUM(transaction.amount)
* The query should count distinct cardholders using COUNT(DISTINCT user.id)
* The query should count transactions using COUNT(transaction.id) or COUNT(*)
* The query should order by total spending descending
* The query should include merchant name, unique cardholder count, transaction count, and total amount columns
        """,
        "reference_query": """
SELECT t.merchant_name,
       COUNT(DISTINCT u.id) as unique_cardholders,
       COUNT(t.id) as transaction_count,
       SUM(t.amount) as total_amount
FROM brex_data.transaction t
JOIN brex_data.card c ON t.card_id = c.id
JOIN brex_data.user u ON c.owner_user_id = u.id
GROUP BY t.merchant_name
ORDER BY total_amount DESC, t.merchant_name ASC
        """,
    },
]


# Salesforce (CRM)
salesforce_tests = [
    {
        "description": "Sales rep opportunity performance with account counts",
        "message": "Show sales rep opportunity performance. Join opportunity to account, and opportunity to user tables. Count distinct accounts and opportunities per rep. Return rep details, accounts managed, opportunity count, and total opportunity value. Order by value descending, using user id ascending as a tiebreaker.",
        "table_names": ["salesforce_data.opportunity", "salesforce_data.account", "salesforce_data.user"],
        "query_description": """
* The query should use tables from salesforce_data schema (opportunity, account, and user are required)
* The query should join opportunity to account on account_id, and opportunity to user on owner_id
* The query should aggregate by user/sales rep (GROUP BY user id)
* The query should calculate total opportunity value using SUM(opportunity.amount)
* The query should count distinct accounts using COUNT(DISTINCT account.id)
* The query should count opportunities using COUNT(opportunity.id) or COUNT(*)
* The query should include user id, rep name (first_name and/or last_name), account count, opportunity count, and total value columns
        """,
        "reference_query": """
SELECT u.id,
       u.first_name || ' ' || u.last_name as rep_name,
       COUNT(DISTINCT a.id) as accounts_managed,
       COUNT(o.id) as opportunity_count,
       SUM(o.amount) as total_opportunity_value
FROM salesforce_data.user u
JOIN salesforce_data.opportunity o ON u.id = o.owner_id
JOIN salesforce_data.account a ON o.account_id = a.id
GROUP BY u.id, u.first_name, u.last_name
ORDER BY total_opportunity_value DESC, u.id ASC
        """,
    },
    {
        "description": "Won deals by industry with sales rep names",
        "message": "Show won deals by industry with sales rep details. Only include won opportunities. Join opportunity to account, and opportunity to user tables. Return industry, deal count, total won value, sales rep count, and aggregated rep names. Order by won value descending, using industry ascending as a tiebreaker.",
        "table_names": ["salesforce_data.opportunity", "salesforce_data.account", "salesforce_data.user"],
        "query_description": """
* The query should use tables from salesforce_data schema (opportunity, account, and user are required)
* The query should join opportunity to account on account_id, and opportunity to user on owner_id
* The query should filter for won opportunities (is_won = true)
* The query should aggregate by industry (GROUP BY account.industry)
* The query should calculate total won value using SUM(opportunity.amount)
* The query should count won deals using COUNT(opportunity.id) or COUNT(*)
* The query should count distinct sales reps using COUNT(DISTINCT user.id)
* The query should include or aggregate sales rep names (using STRING_AGG or similar)
* The query should include industry, won deal count, total won value, rep count, and rep names columns
        """,
        "reference_query": """
SELECT a.industry,
       COUNT(o.id) as won_deal_count,
       SUM(o.amount) as total_won_value,
       COUNT(DISTINCT u.id) as sales_rep_count,
       STRING_AGG(DISTINCT u.first_name || ' ' || u.last_name, ', ' ORDER BY u.first_name || ' ' || u.last_name) as rep_names
FROM salesforce_data.opportunity o
JOIN salesforce_data.account a ON o.account_id = a.id
JOIN salesforce_data.user u ON o.owner_id = u.id
WHERE o.is_won = true
GROUP BY a.industry
ORDER BY total_won_value DESC, a.industry ASC
        """,
    },
    {
        "description": "Lead conversion analysis with contact and account details",
        "message": "Analyze lead conversion by source. Use left joins from lead to contact and lead to account to include unconverted leads. Return lead source, total leads, converted leads (where converted contact id is not null), unique contact titles, and unique industries. Order by total leads descending, using lead source ascending as a tiebreaker.",
        "table_names": ["salesforce_data.lead", "salesforce_data.contact", "salesforce_data.account"],
        "query_description": """
* The query should use tables from salesforce_data schema (lead, contact, and account are required)
* The query should join lead to contact using converted_contact_id, and lead to account using converted_account_id
* The query should use LEFT JOINs to include unconverted leads in the counts
* The query should aggregate by lead source (GROUP BY lead.source)
* The query should count total leads
* The query should count converted leads (where converted_contact_id is not null)
* The query should count distinct contact titles from the contact table
* The query should count distinct industries from the account table
* The query should include lead source, total leads, converted leads, unique titles, and unique industries columns
        """,
        "reference_query": """
SELECT l.source as lead_source,
       COUNT(l.id) as total_leads,
       COUNT(l.converted_contact_id) as converted_leads,
       COUNT(DISTINCT c.title) as unique_contact_titles,
       COUNT(DISTINCT a.industry) as unique_industries
FROM salesforce_data.lead l
LEFT JOIN salesforce_data.contact c ON l.converted_contact_id = c.id
LEFT JOIN salesforce_data.account a ON l.converted_account_id = a.id
GROUP BY l.source
ORDER BY total_leads DESC, l.source ASC
        """,
    },
]


# Stripe (Subscription Billing)
stripe_tests = [
    {
        "description": "Subscription details with customer and item information",
        "message": "Show subscription details with customer and item information. Join subscription to customer, and subscription to subscription item tables. Return customer email, customer id, subscription id, status, and quantity. Order by email ascending, using subscription id ascending as a tiebreaker.",
        "table_names": ["stripe_data.subscription", "stripe_data.customer", "stripe_data.subscription_item"],
        "query_description": """
* The query should use tables from stripe_data schema (subscription, customer, and subscription_item are required)
* The query should join subscription to customer on customer_id, and subscription to subscription_item on subscription_id
* The query should include customer email, customer id, subscription id, subscription status, and quantity columns
* The query should order by customer email ascending, then subscription id ascending
        """,
        "reference_query": """
SELECT c.email,
       c.id as customer_id,
       s.id as subscription_id,
       s.status,
       si.quantity
FROM stripe_data.subscription s
JOIN stripe_data.customer c ON s.customer_id = c.id
JOIN stripe_data.subscription_item si ON s.id = si.subscription_id
ORDER BY c.email ASC, s.id ASC
        """,
    },
    {
        "description": "Failed payment analysis by customer",
        "message": "Analyze failed payments by customer. Only include failed charges. Join charge to customer tables. Left join subscription to customer filtering for active subscriptions only. Return customer details, failed charge count, failed amount, and active subscription count. Order by failed count descending, using customer id ascending as a tiebreaker.",
        "table_names": ["stripe_data.charge", "stripe_data.customer", "stripe_data.subscription"],
        "query_description": """
* The query should use tables from stripe_data schema (charge, customer, and subscription are required)
* The query should join charge to customer on customer_id
* The query should LEFT JOIN subscription to customer, filtering for active subscriptions only (status = 'active')
* The query should filter charges where status = 'failed'
* The query should aggregate by customer (GROUP BY customer id)
* The query should count failed charges using COUNT(charge.id) or COUNT(*)
* The query should sum failed amounts using SUM(charge.amount)
* The query should count distinct active subscriptions using COUNT(DISTINCT subscription.id)
* The query should order by failed charge count descending, with customer id ascending as tiebreaker
* The query should include customer id, email, name, failed charge count, failed amount, and active subscription count columns
        """,
        "reference_query": """
SELECT c.id,
       c.email,
       c.name,
       COUNT(ch.id) as failed_charge_count,
       SUM(ch.amount) as failed_amount,
       COUNT(DISTINCT s.id) as active_subscriptions
FROM stripe_data.charge ch
JOIN stripe_data.customer c ON ch.customer_id = c.id
LEFT JOIN stripe_data.subscription s ON c.id = s.customer_id AND s.status = 'active'
WHERE ch.status = 'failed'
GROUP BY c.id, c.email, c.name
ORDER BY failed_charge_count DESC, c.id ASC
        """,
    },
    {
        "description": "Invoice payment status with subscription details",
        "message": "Show unpaid Stripe invoices with customer and subscription details. Only include unpaid invoices. Join invoice to customer tables. Left join invoice to subscription (some invoices may not have subscriptions). Return invoice details, customer info, subscription info, amounts, and due date. Order by due date ascending, using invoice id ascending as a tiebreaker.",
        "table_names": ["stripe_data.invoice", "stripe_data.customer", "stripe_data.subscription"],
        "query_description": """
* The query should use tables from stripe_data schema (invoice, customer, and subscription are required)
* The query should join invoice to customer on customer_id
* The query should LEFT JOIN invoice to subscription on subscription_id (some invoices may not have subscriptions)
* The query should filter for unpaid invoices (paid = false)
* The query should order by due date ascending
* The query should include invoice id, customer email, customer name, subscription id, subscription status, amount due, amount remaining, and due date columns
        """,
        "reference_query": """
SELECT i.id as invoice_id,
       c.email,
       c.name as customer_name,
       s.id as subscription_id,
       s.status as subscription_status,
       i.amount_due,
       i.amount_remaining,
       i.due_date
FROM stripe_data.invoice i
JOIN stripe_data.customer c ON i.customer_id = c.id
LEFT JOIN stripe_data.subscription s ON i.subscription_id = s.id
WHERE i.paid = false
ORDER BY i.due_date ASC, i.id ASC
        """,
    },
]


# QuickBooks (Accounting)
quickbooks_tests = [
    {
        "description": "QuickBooks invoice line items with customer names",
        "message": "Show QuickBooks invoice line items with customer details. Join invoice line to invoice, and invoice to customer tables. Return invoice details, line item details, transaction date, and customer name. Order by invoice id ascending, using line index ascending as a tiebreaker.",
        "table_names": ["quickbooks_data.invoice_line", "quickbooks_data.invoice", "quickbooks_data.customer"],
        "query_description": """
* The query should use tables from quickbooks_data schema (invoice_line, invoice, and customer are required)
* The query should join invoice_line to invoice on invoice_id, and invoice to customer on customer_ref_value
* The query should include invoice id, line item fields (description, amount, quantity, unit price), invoice transaction date, and customer display_name columns
* The query should order by invoice id ascending, then line index ascending
        """,
        "reference_query": """
SELECT il.invoice_id,
       il.index,
       il.description,
       il.amount,
       il.sales_item_quantity,
       il.sales_item_unit_price,
       i.txn_date,
       c.display_name as customer_name
FROM quickbooks_data.invoice_line il
JOIN quickbooks_data.invoice i ON il.invoice_id = i.id
JOIN quickbooks_data.customer c ON i.customer_ref_value = c.id
ORDER BY il.invoice_id ASC, il.index ASC
        """,
    },
    {
        "description": "Accounts receivable aging by customer",
        "message": "Show QuickBooks accounts receivable aging by customer. Only include invoices with outstanding balance greater than zero. Join invoice to customer tables. Left join payment to customer to count payments. Return customer details, invoice count, total invoiced, outstanding balance, and payment count. Order by outstanding balance descending, using customer id ascending as a tiebreaker.",
        "table_names": ["quickbooks_data.invoice", "quickbooks_data.customer", "quickbooks_data.payment"],
        "query_description": """
* The query should use tables from quickbooks_data schema (invoice, customer, and payment are required)
* The query should join invoice to customer on customer_ref_value
* The query should LEFT JOIN payment to customer on customer_ref_value (to count payments per customer)
* The query should filter for invoices where balance > 0
* The query should aggregate by customer (GROUP BY customer id)
* The query should count invoices using COUNT(invoice.id)
* The query should sum total invoiced using SUM(invoice.total_amt)
* The query should sum outstanding balance using SUM(invoice.balance)
* The query should count distinct payments using COUNT(DISTINCT payment.id)
* The query should order by outstanding balance descending, with customer id ascending as tiebreaker
* The query should include customer id, display name, invoice count, total invoiced, outstanding balance, and payment count columns
        """,
        "reference_query": """
SELECT c.id,
       c.display_name as customer_name,
       COUNT(i.id) as invoice_count,
       SUM(i.total_amt) as total_invoiced,
       SUM(i.balance) as outstanding_balance,
       COUNT(DISTINCT p.id) as payment_count
FROM quickbooks_data.customer c
JOIN quickbooks_data.invoice i ON c.id = i.customer_ref_value
LEFT JOIN quickbooks_data.payment p ON c.id = p.customer_ref_value
WHERE i.balance > 0
GROUP BY c.id, c.display_name
ORDER BY outstanding_balance DESC, c.id ASC
        """,
    },
    {
        "description": "Vendor payables with bill details",
        "message": "Show QuickBooks vendor payables. Only include bills with outstanding balance greater than zero. Join bill to vendor tables. Return vendor details, bill count, total billed, outstanding balance, and earliest due date. Order by outstanding balance descending, using vendor id ascending as a tiebreaker.",
        "table_names": ["quickbooks_data.bill", "quickbooks_data.vendor"],
        "query_description": """
* The query should use tables from quickbooks_data schema (bill and vendor are required)
* The query should join bill to vendor on vendor_ref_value
* The query should filter for bills where balance > 0
* The query should aggregate by vendor (GROUP BY vendor id)
* The query should count bills using COUNT(bill.id)
* The query should sum total billed using SUM(bill.total_amt)
* The query should sum outstanding balance using SUM(bill.balance)
* The query should get earliest due date using MIN(bill.due_date)
* The query should order by outstanding balance descending, with vendor id ascending as tiebreaker
* The query should include vendor id, display name, bill count, total billed, outstanding balance, and earliest due date columns
        """,
        "reference_query": """
SELECT v.id,
       v.display_name as vendor_name,
       COUNT(b.id) as bill_count,
       SUM(b.total_amt) as total_billed,
       SUM(b.balance) as outstanding_balance,
       MIN(b.due_date) as earliest_due_date
FROM quickbooks_data.bill b
JOIN quickbooks_data.vendor v ON b.vendor_ref_value = v.id
WHERE b.balance > 0
GROUP BY v.id, v.display_name
ORDER BY outstanding_balance DESC, v.id ASC
        """,
    },
]


# Lever (Recruiting/ATS)
lever_tests = [
    {
        "description": "Applications by job posting with candidate count",
        "message": "How many candidates are there per job posting? Join posting to application, and application to opportunity tables. Count distinct opportunities per posting. Return posting details and candidate count. Order by candidate count descending, using posting id ascending as a tiebreaker.",
        "table_names": ["lever_data.application", "lever_data.posting", "lever_data.opportunity"],
        "query_description": """
* The query should use tables from lever_data schema (application, posting, and opportunity are required)
* The query should join posting to application on posting_id, and application to opportunity on opportunity_id
* The query should aggregate by posting (GROUP BY posting id)
* The query should count distinct opportunities/candidates using COUNT(DISTINCT opportunity.id)
* The query should order by candidate count descending, with posting id ascending as tiebreaker
* The query should include posting id, posting title (text), and candidate count columns
        """,
        "reference_query": """
SELECT p.id,
       p.text as posting_title,
       COUNT(DISTINCT o.id) as candidate_count
FROM lever_data.posting p
JOIN lever_data.application a ON p.id = a.posting_id
JOIN lever_data.opportunity o ON a.opportunity_id = o.id
GROUP BY p.id, p.text
ORDER BY candidate_count DESC, p.id ASC
        """,
    },
    {
        "description": "Interview feedback by candidate",
        "message": "Show interview feedback by candidate. Join opportunity to interview tables. Left join interview to feedback (some interviews may not have feedback). Count distinct interviews and total feedback per candidate. Return candidate details, interview count, and feedback count. Order by feedback count descending, then interview count descending, using opportunity id ascending as a tiebreaker.",
        "table_names": ["lever_data.feedback", "lever_data.interview", "lever_data.opportunity"],
        "query_description": """
* The query should use tables from lever_data schema (feedback, interview, and opportunity are required)
* The query should join opportunity to interview on opportunity_id
* The query should LEFT JOIN interview to feedback on interview_id (some interviews may not have feedback)
* The query should aggregate by candidate/opportunity (GROUP BY opportunity id)
* The query should count distinct interviews using COUNT(DISTINCT interview.id)
* The query should count feedback using COUNT(feedback.id) or COUNT(feedback.*)
* The query should order by feedback count descending, then interview count descending, with opportunity id ascending as tiebreaker
* The query should include opportunity id, candidate name, headline, interview count, and feedback count columns
        """,
        "reference_query": """
SELECT o.id,
       o.name as candidate_name,
       o.headline,
       COUNT(DISTINCT i.id) as interview_count,
       COUNT(f.id) as feedback_count
FROM lever_data.opportunity o
JOIN lever_data.interview i ON o.id = i.opportunity_id
LEFT JOIN lever_data.feedback f ON i.id = f.interview_id
GROUP BY o.id, o.name, o.headline
ORDER BY feedback_count DESC, interview_count DESC, o.id ASC
        """,
    },
    {
        "description": "Hiring pipeline stage analysis by application type",
        "message": "Analyze hiring pipeline by stage and application type. Only include active candidates (not archived). Join opportunity to stage, and opportunity to application tables. Return stage name, application type, and candidate count. Order by candidate count descending, then stage name ascending, using application type ascending as a tiebreaker.",
        "table_names": ["lever_data.opportunity", "lever_data.stage", "lever_data.application"],
        "query_description": """
* The query should use tables from lever_data schema (opportunity, stage, and application are required)
* The query should join opportunity to stage on stage_id
* The query should join opportunity to application on opportunity_id
* The query should filter for non-archived opportunities (archived_at IS NULL)
* The query should aggregate by stage name and application type (GROUP BY stage.text, application.type)
* The query should count distinct candidates/opportunities using COUNT(DISTINCT opportunity.id)
* The query should order by candidate count descending, then stage name ascending, with application type ascending as tiebreaker
* The query should include stage name (text), application type, and candidate count columns
        """,
        "reference_query": """
SELECT s.text as stage_name,
       a.type as application_type,
       COUNT(DISTINCT o.id) as candidate_count
FROM lever_data.opportunity o
JOIN lever_data.stage s ON o.stage_id = s.id
JOIN lever_data.application a ON o.id = a.opportunity_id
WHERE o.archived_at IS NULL
GROUP BY s.text, a.type
ORDER BY candidate_count DESC, s.text ASC, a.type ASC
        """,
    },
]


# Calendly (Meeting Scheduling)
calendly_tests = [
    {
        "description": "Calendly meeting counts by event type",
        "message": "How many Calendly meetings are there by event type? Join event to event type tables. Return event type name and meeting count. Order by count descending, using event type name ascending as a tiebreaker.",
        "table_names": ["calendly_data.event", "calendly_data.event_type"],
        "query_description": """
* The query should use tables from calendly_data schema (event and event_type are required)
* The query should join event to event_type on event_type_uri
* The query should aggregate by event type (GROUP BY event_type name or uri)
* The query should count meetings using COUNT(event.uri) or COUNT(DISTINCT event.uri) or COUNT(*)
* The query should order by meeting count descending, with event type name ascending as tiebreaker
* The query should include event type name and meeting count columns
        """,
        "reference_query": """
SELECT et.name as event_type_name,
       COUNT(e.uri) as meeting_count
FROM calendly_data.event e
JOIN calendly_data.event_type et ON e.event_type_uri = et.uri
GROUP BY et.name
ORDER BY meeting_count DESC, et.name ASC
        """,
    },
    {
        "description": "Meeting invitee counts by event type and status",
        "message": "How many Calendly meeting invitees are there by event type and status? Return event type, invitee status, invitee count, and event count. Order by event type ascending.",
        "table_names": ["calendly_data.invitee", "calendly_data.event", "calendly_data.event_type"],
        "query_description": """
* The query should use tables from calendly_data schema (invitee, event, and event_type are required)
* The query should join invitee to event on event_uri, and event to event_type on event_type_uri
* The query should aggregate by event type name and invitee status (GROUP BY event_type.name, invitee.status)
* The query should count invitees using COUNT(invitee.uri) or COUNT(*)
* The query should count distinct events using COUNT(DISTINCT event.uri)
* The query should order by event type name ascending, then invitee count descending
* The query should include event type name, invitee status, invitee count, and event count columns
        """,
        "reference_query": """
SELECT et.name as event_type,
       i.status,
       COUNT(i.uri) as invitee_count,
       COUNT(DISTINCT e.uri) as event_count
FROM calendly_data.invitee i
JOIN calendly_data.event e ON i.event_uri = e.uri
JOIN calendly_data.event_type et ON e.event_type_uri = et.uri
GROUP BY et.name, i.status
ORDER BY et.name ASC, invitee_count DESC
        """,
    },
    {
        "description": "User booking activity with event membership",
        "message": "Show Calendly user booking activity. Join user to event membership, and event membership to event tables. Count distinct events per user. Return user name, email, and events hosted. Order by events hosted descending, using user email ascending as a tiebreaker.",
        "table_names": ["calendly_data.user", "calendly_data.event_membership", "calendly_data.event"],
        "query_description": """
* The query should use tables from calendly_data schema (user, event_membership, and event are required)
* The query should join user to event_membership on user_uri, and event_membership to event on event_uri
* The query should aggregate by user (GROUP BY user uri or user name and email)
* The query should count distinct events using COUNT(DISTINCT event.uri) or COUNT(event.uri)
* The query should order by events hosted descending, with user email ascending as tiebreaker
* The query should include user name, user email, and events hosted count columns
        """,
        "reference_query": """
SELECT u.name as user_name,
       u.email,
       COUNT(DISTINCT e.uri) as events_hosted
FROM calendly_data.user u
JOIN calendly_data.event_membership em ON u.uri = em.user_uri
JOIN calendly_data.event e ON em.event_uri = e.uri
GROUP BY u.uri, u.name, u.email
ORDER BY events_hosted DESC, u.email ASC
        """,
    },
]


# Google AdWords (Search Advertising)
google_adwords_tests = [
    {
        "description": "Google AdWords keyword performance by campaign",
        "message": "Show Google AdWords keyword performance by campaign. Join keyword stats to keyword, keyword to ad group, and ad group to campaign tables. Convert cost micros to dollars by dividing by one million. Return campaign name, keyword, total clicks, and total cost. Order by clicks descending, then campaign name ascending, using keyword ascending as a tiebreaker.",
        "table_names": [
            "google_adwords_data.keyword_stats",
            "google_adwords_data.keyword",
            "google_adwords_data.campaign",
            "google_adwords_data.ad_group",
        ],
        "query_description": """
* The query should use tables from google_adwords_data schema (keyword_stats, keyword, ad_group, and campaign are required)
* The query should join keyword_stats to keyword on keyword_id
* The query should join keyword to ad_group on ad_group_id
* The query should join ad_group to campaign on campaign_id
* The query should aggregate by campaign and keyword (GROUP BY campaign name and keyword text)
* The query should calculate total clicks using SUM(keyword_stats.clicks)
* The query should calculate total cost in dollars using SUM(cost_micros / 1000000.0) or equivalent
* The query should order by total clicks descending, with campaign name ascending and keyword text ascending as tiebreakers
* The query should include campaign name, keyword text, total clicks, and total cost columns
        """,
        "reference_query": """
SELECT c.name as campaign_name,
       k.text as keyword,
       SUM(ks.clicks) as total_clicks,
       SUM(ks.cost_micros / 1000000.0) as total_cost
FROM google_adwords_data.keyword_stats ks
JOIN google_adwords_data.keyword k ON ks.keyword_id = k.id
JOIN google_adwords_data.ad_group ag ON k.ad_group_id = ag.id
JOIN google_adwords_data.campaign c ON ag.campaign_id = c.id
GROUP BY c.name, k.text
ORDER BY total_clicks DESC, c.name ASC, k.text ASC
        """,
    },
    {
        "description": "Campaign ROI with conversion metrics",
        "message": "Show Google AdWords campaign ROI metrics. Join campaign stats to campaign, and campaign to account tables. Return campaign name, account name, total impressions, total clicks, total cost, and total conversions. Order by total cost descending, using campaign name ascending as a tiebreaker.",
        "table_names": [
            "google_adwords_data.campaign_stats",
            "google_adwords_data.campaign",
            "google_adwords_data.account",
        ],
        "query_description": """
* The query should use tables from google_adwords_data schema (campaign_stats, campaign, and account are required)
* The query should join campaign_stats to campaign on campaign_id
* The query should join campaign to account on account_id
* The query should aggregate by campaign and account (GROUP BY campaign name, account name)
* The query should calculate total impressions using SUM(campaign_stats.impressions)
* The query should calculate total clicks using SUM(campaign_stats.clicks)
* The query should calculate total cost using SUM(campaign_stats.cost_micros) or SUM(campaign_stats.cost_micros / 1000000.0)
* The query should calculate total conversions using SUM(campaign_stats.conversions)
* The query should order by total cost descending, with campaign name ascending as tiebreaker
* The query should include campaign name, account name, total impressions, total clicks, total cost, and total conversions columns
        """,
        "reference_query": """
SELECT c.name as campaign_name,
       a.name as account_name,
       SUM(cs.impressions) as total_impressions,
       SUM(cs.clicks) as total_clicks,
       SUM(cs.cost_micros) as total_cost,
       SUM(cs.conversions) as total_conversions
FROM google_adwords_data.campaign_stats cs
JOIN google_adwords_data.campaign c ON cs.campaign_id = c.id
JOIN google_adwords_data.account a ON c.account_id = a.id
GROUP BY c.name, a.name
ORDER BY total_cost DESC, c.name ASC
        """,
    },
    {
        "description": "Ad group performance by campaign",
        "message": "Show Google AdWords ad group performance by campaign. Join ad group stats to ad group, and ad group to campaign tables. Return campaign name, ad group name, total impressions, total clicks, total cost, and total conversions. Order by total cost descending, then campaign name ascending, using ad group name ascending as a tiebreaker.",
        "table_names": [
            "google_adwords_data.ad_group_stats",
            "google_adwords_data.ad_group",
            "google_adwords_data.campaign",
        ],
        "query_description": """
* The query should use tables from google_adwords_data schema (ad_group_stats, ad_group, and campaign are required)
* The query should join ad_group_stats to ad_group on ad_group_id
* The query should join ad_group to campaign on campaign_id
* The query should aggregate by campaign and ad group (GROUP BY campaign name and ad group name)
* The query should calculate total impressions using SUM(ad_group_stats.impressions)
* The query should calculate total clicks using SUM(ad_group_stats.clicks)
* The query should calculate total cost using SUM(ad_group_stats.cost_micros) or SUM(ad_group_stats.cost_micros / 1000000.0)
* The query should calculate total conversions using SUM(ad_group_stats.conversions)
* The query should order by total cost descending, with campaign name ascending and ad group name ascending as tiebreakers
* The query should include campaign name, ad group name, total impressions, total clicks, total cost, and total conversions columns
        """,
        "reference_query": """
SELECT c.name as campaign_name,
       ag.name as ad_group_name,
       SUM(ags.impressions) as total_impressions,
       SUM(ags.clicks) as total_clicks,
       SUM(ags.cost_micros) as total_cost,
       SUM(ags.conversions) as total_conversions
FROM google_adwords_data.ad_group_stats ags
JOIN google_adwords_data.ad_group ag ON ags.ad_group_id = ag.id
JOIN google_adwords_data.campaign c ON ag.campaign_id = c.id
GROUP BY c.name, ag.name
ORDER BY total_cost DESC, c.name ASC, ag.name ASC
        """,
    },
]


# LinkedIn Ads (Social Advertising)
linkedin_ads_tests = [
    {
        "description": "LinkedIn campaign performance by campaign group",
        "message": "Show LinkedIn campaign performance by campaign group. Join ad analytics by campaign to campaign, and campaign to campaign group tables. Return campaign group name, campaign name, total impressions, total clicks, total spend, and total conversions. Order by spend descending, then campaign group name ascending, using campaign name ascending as a tiebreaker.",
        "table_names": [
            "linkedin_ads_data.ad_analytics_by_campaign",
            "linkedin_ads_data.campaign",
            "linkedin_ads_data.campaign_group",
        ],
        "query_description": """
* The query should use tables from linkedin_ads_data schema (ad_analytics_by_campaign, campaign, and campaign_group are required)
* The query should join ad_analytics_by_campaign to campaign on campaign_id
* The query should join campaign to campaign_group on campaign_group_id
* The query should aggregate by campaign group and campaign (GROUP BY campaign_group name and campaign name)
* The query should calculate total impressions using SUM(ad_analytics_by_campaign.impressions)
* The query should calculate total clicks using SUM(ad_analytics_by_campaign.clicks)
* The query should calculate total spend using SUM(ad_analytics_by_campaign.cost_in_local_currency)
* The query should calculate total conversions using SUM(ad_analytics_by_campaign.external_website_conversions)
* The query should order by total spend descending, with campaign group name ascending and campaign name ascending as tiebreakers
* The query should include campaign group name, campaign name, total impressions, total clicks, total spend, and total conversions columns
        """,
        "reference_query": """
SELECT cg.name as campaign_group_name,
       c.name as campaign_name,
       SUM(aac.impressions) as total_impressions,
       SUM(aac.clicks) as total_clicks,
       SUM(aac.cost_in_local_currency) as total_spend,
       SUM(aac.external_website_conversions) as total_conversions
FROM linkedin_ads_data.ad_analytics_by_campaign aac
JOIN linkedin_ads_data.campaign c ON aac.campaign_id = c.id
JOIN linkedin_ads_data.campaign_group cg ON c.campaign_group_id = cg.id
GROUP BY cg.name, c.name
ORDER BY total_spend DESC, cg.name ASC, c.name ASC
        """,
    },
    {
        "description": "Creative performance by campaign",
        "message": "Show LinkedIn creative performance by campaign. Join ad analytics by creative to creative, and creative to campaign tables. Return campaign name, creative id, total impressions, total clicks, total spend, and total conversions. Order by clicks descending, then campaign name ascending, using creative id ascending as a tiebreaker.",
        "table_names": [
            "linkedin_ads_data.ad_analytics_by_creative",
            "linkedin_ads_data.creative",
            "linkedin_ads_data.campaign",
        ],
        "query_description": """
* The query should use tables from linkedin_ads_data schema (ad_analytics_by_creative, creative, and campaign are required)
* The query should join ad_analytics_by_creative to creative on creative_id
* The query should join creative to campaign on campaign_id
* The query should aggregate by campaign and creative (GROUP BY campaign name and creative id)
* The query should calculate total impressions using SUM(ad_analytics_by_creative.impressions)
* The query should calculate total clicks using SUM(ad_analytics_by_creative.clicks)
* The query should calculate total spend using SUM(ad_analytics_by_creative.cost_in_local_currency)
* The query should calculate total conversions using SUM(ad_analytics_by_creative.external_website_conversions)
* The query should order by total clicks descending, with campaign name ascending and creative id ascending as tiebreakers
* The query should include campaign name, creative id, total impressions, total clicks, total spend, and total conversions columns
        """,
        "reference_query": """
SELECT c.name as campaign_name,
       cr.id as creative_id,
       SUM(aacr.impressions) as total_impressions,
       SUM(aacr.clicks) as total_clicks,
       SUM(aacr.cost_in_local_currency) as total_spend,
       SUM(aacr.external_website_conversions) as total_conversions
FROM linkedin_ads_data.ad_analytics_by_creative aacr
JOIN linkedin_ads_data.creative cr ON aacr.creative_id = cr.id
JOIN linkedin_ads_data.campaign c ON cr.campaign_id = c.id
GROUP BY c.name, cr.id
ORDER BY total_clicks DESC, c.name ASC, cr.id ASC
        """,
    },
    {
        "description": "Account-level ad performance across campaigns",
        "message": "Show LinkedIn account-level ad performance. Join ad analytics by campaign to campaign, campaign to campaign group, and campaign group to account tables. Return account name, campaign count, total impressions, total clicks, total spend, and total conversions. Order by spend descending, using account name ascending as a tiebreaker.",
        "table_names": [
            "linkedin_ads_data.ad_analytics_by_campaign",
            "linkedin_ads_data.campaign",
            "linkedin_ads_data.campaign_group",
            "linkedin_ads_data.account",
        ],
        "query_description": """
* The query should use tables from linkedin_ads_data schema (ad_analytics_by_campaign, campaign, campaign_group, and account are required)
* The query should join ad_analytics_by_campaign to campaign on campaign_id
* The query should join campaign to campaign_group on campaign_group_id
* The query should join campaign_group to account on account_id
* The query should aggregate by account (GROUP BY account name or account id)
* The query should calculate campaign count using COUNT(DISTINCT campaign.id)
* The query should calculate total impressions using SUM(ad_analytics_by_campaign.impressions)
* The query should calculate total clicks using SUM(ad_analytics_by_campaign.clicks)
* The query should calculate total spend using SUM(ad_analytics_by_campaign.cost_in_local_currency)
* The query should calculate total conversions using SUM(ad_analytics_by_campaign.external_website_conversions)
* The query should order by total spend descending, with account name ascending as tiebreaker
* The query should include account name, campaign count, total impressions, total clicks, total spend, and total conversions columns
        """,
        "reference_query": """
SELECT a.name as account_name,
       COUNT(DISTINCT c.id) as campaign_count,
       SUM(aac.impressions) as total_impressions,
       SUM(aac.clicks) as total_clicks,
       SUM(aac.cost_in_local_currency) as total_spend,
       SUM(aac.external_website_conversions) as total_conversions
FROM linkedin_ads_data.ad_analytics_by_campaign aac
JOIN linkedin_ads_data.campaign c ON aac.campaign_id = c.id
JOIN linkedin_ads_data.campaign_group cg ON c.campaign_group_id = cg.id
JOIN linkedin_ads_data.account a ON cg.account_id = a.id
GROUP BY a.name
ORDER BY total_spend DESC, a.name ASC
        """,
    },
]


# Customer.io (Marketing Automation)
customerio_tests = [
    {
        "description": "Email campaign engagement metrics",
        "message": "Show Customer.io email campaign engagement. Join campaign to deliveries tables. Left join deliveries to opens (some deliveries may not have opens). Return campaign name, delivery count, and open count. Order by deliveries descending, using campaign name ascending as a tiebreaker.",
        "table_names": ["customerio_data.deliveries", "customerio_data.opens", "customerio_data.campaign"],
        "query_description": """
* The query should use tables from customerio_data schema (campaign, deliveries, and opens are required)
* The query should join campaign to deliveries on campaign_id
* The query should LEFT JOIN deliveries to opens on delivery_id (some deliveries may not have opens)
* The query should aggregate by campaign (GROUP BY campaign id or name)
* The query should count deliveries using COUNT(DISTINCT deliveries.delivery_id) or COUNT(deliveries.delivery_id)
* The query should count opens using COUNT(DISTINCT opens.delivery_id) or COUNT(opens.delivery_id)
* The query should order by delivery count descending, with campaign name ascending as tiebreaker
* The query should include campaign name, delivery count, and open count columns
        """,
        "reference_query": """
SELECT c.name as campaign_name,
       COUNT(DISTINCT d.delivery_id) as deliveries,
       COUNT(DISTINCT o.delivery_id) as opens
FROM customerio_data.campaign c
JOIN customerio_data.deliveries d ON c.id = d.campaign_id
LEFT JOIN customerio_data.opens o ON d.delivery_id = o.delivery_id
GROUP BY c.id, c.name
ORDER BY deliveries DESC, c.name ASC
        """,
    },
    {
        "description": "Newsletter click-through analysis",
        "message": "Show Customer.io newsletter click-through analysis. Join newsletter to deliveries tables. Left join deliveries to clicks (some deliveries may not have clicks). Return newsletter id, total deliveries, and total clicks (count the number of unique deliveries that received at least one click). Order by deliveries descending, using newsletter id ascending as a tiebreaker.",
        "table_names": ["customerio_data.newsletter", "customerio_data.deliveries", "customerio_data.clicks"],
        "query_description": """
* The query should use tables from customerio_data schema (newsletter, deliveries, and clicks are required)
* The query should join newsletter to deliveries on newsletter_id
* The query should LEFT JOIN deliveries to clicks on delivery_id (some deliveries may not have clicks)
* The query should aggregate by newsletter (GROUP BY newsletter id)
* The query should count deliveries using COUNT(DISTINCT deliveries.delivery_id)
* The query should count clicks as unique deliveries that were clicked using COUNT(DISTINCT clicks.delivery_id)
* The query should order by total deliveries descending, with newsletter id ascending as tiebreaker
* The query should include newsletter id, total deliveries, and total clicks columns
        """,
        "reference_query": """
SELECT n.id as newsletter_id,
       COUNT(DISTINCT d.delivery_id) as total_deliveries,
       COUNT(DISTINCT cl.delivery_id) as total_clicks
FROM customerio_data.newsletter n
JOIN customerio_data.deliveries d ON n.id = d.newsletter_id
LEFT JOIN customerio_data.clicks cl ON d.delivery_id = cl.delivery_id
GROUP BY n.id
ORDER BY total_deliveries DESC, n.id ASC
        """,
    },
    {
        "description": "Customer email activity summary",
        "message": "Show Customer.io customer email activity. Join customer to deliveries tables. Left join deliveries to opens (some deliveries may not have opens). Return customer details, emails received, and emails opened. Order by emails received descending, using customer id ascending as a tiebreaker.",
        "table_names": ["customerio_data.customer", "customerio_data.deliveries", "customerio_data.opens"],
        "query_description": """
* The query should use tables from customerio_data schema (customer, deliveries, and opens are required)
* The query should join customer to deliveries on customer_id
* The query should LEFT JOIN deliveries to opens on delivery_id (some deliveries may not have opens)
* The query should aggregate by customer (GROUP BY customer id)
* The query should count emails received using COUNT(DISTINCT deliveries.delivery_id) or COUNT(deliveries.delivery_id)
* The query should count emails opened using COUNT(DISTINCT opens.delivery_id) or COUNT(opens.delivery_id)
* The query should order by emails received descending, with customer id ascending as tiebreaker
* The query should include customer id, customer email, emails received count, and emails opened count columns
        """,
        "reference_query": """
SELECT c.id as customer_id,
       c.email,
       COUNT(DISTINCT d.delivery_id) as emails_received,
       COUNT(DISTINCT o.delivery_id) as emails_opened
FROM customerio_data.customer c
JOIN customerio_data.deliveries d ON c.id = d.customer_id
LEFT JOIN customerio_data.opens o ON d.delivery_id = o.delivery_id
GROUP BY c.id, c.email
ORDER BY emails_received DESC, c.id ASC
        """,
    },
]


# Cross-Domain (Time-Based Joins)
cross_domain_tests = [
    {
        "description": "Monthly revenue streams across Stripe and Shopify",
        "message": "Compare monthly revenue across Stripe and Shopify. Include only paid transactions from both sources. Group by calendar month and combine months from both sources. Return month, Stripe revenue as sum of amount paid, Shopify revenue as sum of price times quantity from order lines, and combined total. Use zero for months with no revenue from a source. Order by month ascending.",
        "table_names": ["stripe_data.invoice", "shopify_data.order", "shopify_data.order_line"],
        "query_description": """
* The query should use tables from both stripe_data and shopify_data schemas
* The query should aggregate revenue by month using DATE_TRUNC or equivalent
* The query should calculate Stripe revenue from paid invoices (paid = true) using SUM(amount_paid)
* The query should calculate Shopify revenue from paid orders (financial_status = 'paid') using SUM(price * quantity) from order_line
* The query should combine months from both sources to show all months that have data in either source
* The query should use COALESCE or equivalent to show 0 for months with no revenue from a source
* The query should calculate total revenue as the sum of Stripe and Shopify revenue
* The query should order by month ascending
* The query should include month, stripe_revenue, shopify_revenue, and total_revenue columns
        """,
        "reference_query": """
SELECT
  DATE_TRUNC('month', month_date)::date as month,
  COALESCE(stripe_revenue, 0) as stripe_revenue,
  COALESCE(shopify_revenue, 0) as shopify_revenue,
  COALESCE(stripe_revenue, 0) + COALESCE(shopify_revenue, 0) as total_revenue
FROM (
  SELECT DISTINCT DATE_TRUNC('month', created) as month_date FROM stripe_data.invoice
  UNION
  SELECT DISTINCT DATE_TRUNC('month', created_at) FROM shopify_data.order
) all_months
LEFT JOIN (
  SELECT
    DATE_TRUNC('month', created) as month,
    SUM(amount_paid) as stripe_revenue
  FROM stripe_data.invoice
  WHERE paid = true
  GROUP BY DATE_TRUNC('month', created)
) stripe ON all_months.month_date = stripe.month
LEFT JOIN (
  SELECT
    DATE_TRUNC('month', o.created_at) as month,
    SUM(ol.price * ol.quantity) as shopify_revenue
  FROM shopify_data.order o
  JOIN shopify_data.order_line ol ON o.id = ol.order_id
  WHERE o.financial_status = 'paid'
  GROUP BY DATE_TRUNC('month', o.created_at)
) shopify ON all_months.month_date = shopify.month
ORDER BY month ASC
        """,
    },
    {
        "description": "Quarterly marketing spend vs sales pipeline",
        "message": "Compare quarterly marketing spend vs sales pipeline. Group Salesforce opportunities by their created_date (when they entered the pipeline). Use DATE_TRUNC to group by calendar quarter. Convert AdWords cost_micros to dollars (divide by 1,000,000). Use COALESCE to show 0 for quarters with no data. Combine quarters from all sources using UNION. Return quarter, AdWords spend, LinkedIn spend, opportunity value, and opportunity count. Order by quarter ascending.",
        "table_names": [
            "google_adwords_data.campaign_stats",
            "linkedin_ads_data.ad_analytics_by_campaign",
            "salesforce_data.opportunity",
        ],
        "query_description": """
* The query should use tables from google_adwords_data, linkedin_ads_data, and salesforce_data schemas
* The query should aggregate by quarter using DATE_TRUNC or equivalent
* The query should calculate Google AdWords spend by converting cost_micros to dollars (divide by 1000000)
* The query should calculate LinkedIn spend using cost_in_local_currency
* The query should count Salesforce opportunities by their created_date and sum their amounts
* The query should combine quarters from all three sources to show all quarters that have data in any source
* The query should use COALESCE or equivalent to show 0 for quarters with no data from a source
* The query should order by quarter ascending
* The query should include quarter, adwords_spend, linkedin_spend, opportunities_value, and opportunities_count columns
        """,
        "reference_query": """
SELECT
  DATE_TRUNC('quarter', quarter_date)::date as quarter,
  COALESCE(adwords_spend, 0) as adwords_spend,
  COALESCE(linkedin_spend, 0) as linkedin_spend,
  COALESCE(opportunities_value, 0) as opportunities_value,
  COALESCE(opportunities_count, 0) as opportunities_count
FROM (
  SELECT DISTINCT DATE_TRUNC('quarter', date) as quarter_date
  FROM google_adwords_data.campaign_stats
  UNION
  SELECT DISTINCT DATE_TRUNC('quarter', day)
  FROM linkedin_ads_data.ad_analytics_by_campaign
  UNION
  SELECT DISTINCT DATE_TRUNC('quarter', created_date)
  FROM salesforce_data.opportunity
) all_quarters
LEFT JOIN (
  SELECT
    DATE_TRUNC('quarter', date) as quarter,
    SUM(cost_micros / 1000000.0) as adwords_spend
  FROM google_adwords_data.campaign_stats
  GROUP BY DATE_TRUNC('quarter', date)
) adwords ON all_quarters.quarter_date = adwords.quarter
LEFT JOIN (
  SELECT
    DATE_TRUNC('quarter', day) as quarter,
    SUM(cost_in_local_currency) as linkedin_spend
  FROM linkedin_ads_data.ad_analytics_by_campaign
  GROUP BY DATE_TRUNC('quarter', day)
) linkedin ON all_quarters.quarter_date = linkedin.quarter
LEFT JOIN (
  SELECT
    DATE_TRUNC('quarter', created_date) as quarter,
    SUM(amount) as opportunities_value,
    COUNT(*) as opportunities_count
  FROM salesforce_data.opportunity
  GROUP BY DATE_TRUNC('quarter', created_date)
) sf ON all_quarters.quarter_date = sf.quarter
ORDER BY quarter ASC
        """,
    },
    {
        "description": "Weekly meeting bookings vs opportunities created",
        "message": "Compare weekly meeting bookings vs opportunities created. Group Calendly events by their created_at date (when meetings were booked), including only active meetings (status = 'active'). Group Salesforce opportunities by created_date. Use DATE_TRUNC to group by calendar week. Use COALESCE to show 0 for weeks with no data. Combine weeks from both sources using UNION. Return week, meetings booked, and opportunities created. Order by week ascending.",
        "table_names": ["calendly_data.event", "salesforce_data.opportunity"],
        "query_description": """
* The query should use tables from calendly_data and salesforce_data schemas
* The query should aggregate by week using DATE_TRUNC or equivalent
* The query should count Calendly events by their created_at date with status = 'active'
* The query should count Salesforce opportunities by their created_date
* The query should combine weeks from both sources to show all weeks that have data in either source
* The query should use COALESCE or equivalent to show 0 for weeks with no data from a source
* The query should order by week ascending
* The query should include week, meetings_booked, and opportunities_created columns
        """,
        "reference_query": """
SELECT
  DATE_TRUNC('week', week_date)::date as week,
  COALESCE(meetings_booked, 0) as meetings_booked,
  COALESCE(opportunities_created, 0) as opportunities_created
FROM (
  SELECT DISTINCT DATE_TRUNC('week', created_at) as week_date
  FROM calendly_data.event
  UNION
  SELECT DISTINCT DATE_TRUNC('week', created_date)
  FROM salesforce_data.opportunity
) all_weeks
LEFT JOIN (
  SELECT
    DATE_TRUNC('week', e.created_at) as week,
    COUNT(DISTINCT e.uri) as meetings_booked
  FROM calendly_data.event e
  WHERE e.status = 'active'
  GROUP BY DATE_TRUNC('week', e.created_at)
) cal ON all_weeks.week_date = cal.week
LEFT JOIN (
  SELECT
    DATE_TRUNC('week', created_date) as week,
    COUNT(*) as opportunities_created
  FROM salesforce_data.opportunity
  GROUP BY DATE_TRUNC('week', created_date)
) sf ON all_weeks.week_date = sf.week
ORDER BY week ASC
        """,
    },
    {
        "description": "Monthly email campaigns vs e-commerce orders",
        "message": "Compare monthly email campaigns vs e-commerce orders. Use DATE_TRUNC to group by calendar month. Use COALESCE to show 0 for months with no data. Combine months from both sources using UNION. Return month, emails delivered, emails opened, orders placed, and order revenue (sum of price * quantity). Order by month ascending.",
        "table_names": [
            "customerio_data.deliveries",
            "customerio_data.opens",
            "shopify_data.order",
            "shopify_data.order_line",
        ],
        "query_description": """
* The query should use tables from customerio_data and shopify_data schemas
* The query should aggregate by month using DATE_TRUNC or equivalent
* The query should count Customer.io deliveries using COUNT(DISTINCT delivery_id)
* The query should count Customer.io opens using COUNT(DISTINCT delivery_id) from opens table
* The query should count Shopify orders using COUNT(DISTINCT order.id)
* The query should calculate Shopify revenue using SUM(price * quantity) from order_line
* The query should combine months from both sources to show all months that have data in either source
* The query should use COALESCE or equivalent to show 0 for months with no data from a source
* The query should order by month ascending
* The query should include month, emails_delivered, emails_opened, orders_placed, and order_revenue columns
        """,
        "reference_query": """
SELECT
  DATE_TRUNC('month', month_date)::date as month,
  COALESCE(emails_delivered, 0) as emails_delivered,
  COALESCE(emails_opened, 0) as emails_opened,
  COALESCE(orders_placed, 0) as orders_placed,
  COALESCE(order_revenue, 0) as order_revenue
FROM (
  SELECT DISTINCT DATE_TRUNC('month', created_at) as month_date
  FROM customerio_data.deliveries
  UNION
  SELECT DISTINCT DATE_TRUNC('month', created_at)
  FROM shopify_data.order
) all_months
LEFT JOIN (
  SELECT
    DATE_TRUNC('month', d.created_at) as month,
    COUNT(DISTINCT d.delivery_id) as emails_delivered,
    COUNT(DISTINCT o.delivery_id) as emails_opened
  FROM customerio_data.deliveries d
  LEFT JOIN customerio_data.opens o ON d.delivery_id = o.delivery_id
  GROUP BY DATE_TRUNC('month', d.created_at)
) email ON all_months.month_date = email.month
LEFT JOIN (
  SELECT
    DATE_TRUNC('month', o.created_at) as month,
    COUNT(DISTINCT o.id) as orders_placed,
    SUM(ol.price * ol.quantity) as order_revenue
  FROM shopify_data.order o
  JOIN shopify_data.order_line ol ON o.id = ol.order_id
  GROUP BY DATE_TRUNC('month', o.created_at)
) shop ON all_months.month_date = shop.month
ORDER BY month ASC
        """,
    },
    {
        "description": "Monthly corporate spending across Brex and QuickBooks",
        "message": "Compare monthly corporate spending across Brex and QuickBooks. Use DATE_TRUNC to group by calendar month. Use COALESCE to show 0 for months with no data. Combine months from both sources using UNION. Return month, Brex card spend (sum of amount), QuickBooks bills payable (sum of total_amt), and total expenses. Order by month ascending.",
        "table_names": ["brex_data.transaction", "quickbooks_data.bill"],
        "query_description": """
* The query should use tables from brex_data and quickbooks_data schemas
* The query should aggregate by month using DATE_TRUNC or equivalent
* The query should calculate Brex spending using SUM(amount) from transaction table, grouped by posted_at_date
* The query should calculate QuickBooks bills using SUM(total_amt) from bill table, grouped by txn_date
* The query should combine months from both sources to show all months that have data in either source
* The query should use COALESCE or equivalent to show 0 for months with no data from a source
* The query should calculate total expenses as the sum of Brex and QuickBooks amounts
* The query should order by month ascending
* The query should include month, brex_card_spend, quickbooks_bills_payable, and total_expenses columns
        """,
        "reference_query": """
SELECT
  DATE_TRUNC('month', month_date)::date as month,
  COALESCE(brex_transactions, 0) as brex_card_spend,
  COALESCE(quickbooks_bills, 0) as quickbooks_bills_payable,
  COALESCE(brex_transactions, 0) + COALESCE(quickbooks_bills, 0) as total_expenses
FROM (
  SELECT DISTINCT DATE_TRUNC('month', posted_at_date) as month_date
  FROM brex_data.transaction
  UNION
  SELECT DISTINCT DATE_TRUNC('month', txn_date)
  FROM quickbooks_data.bill
) all_months
LEFT JOIN (
  SELECT
    DATE_TRUNC('month', posted_at_date) as month,
    SUM(amount) as brex_transactions
  FROM brex_data.transaction
  GROUP BY DATE_TRUNC('month', posted_at_date)
) brex ON all_months.month_date = brex.month
LEFT JOIN (
  SELECT
    DATE_TRUNC('month', txn_date) as month,
    SUM(total_amt) as quickbooks_bills
  FROM quickbooks_data.bill
  GROUP BY DATE_TRUNC('month', txn_date)
) qb ON all_months.month_date = qb.month
ORDER BY month ASC
        """,
    },
]


# Combine all test lists
TEST_DATA = [
    *shopify_tests,
    *brex_tests,
    *salesforce_tests,
    *stripe_tests,
    *quickbooks_tests,
    *lever_tests,
    *calendly_tests,
    *google_adwords_tests,
    *linkedin_ads_tests,
    *customerio_tests,
    *cross_domain_tests,
]
