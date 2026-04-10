"""
Why this is an SCD test:
The test highlights temporal mismatch between historical invoice events and current subscription state. The agent must recognize:
- Invoices are historical events with creation timestamps (invoice_created_at, invoice_date)
- Subscription status is current state only (subscription may have been 'active' when invoice was created but is now 'canceled')
- A proper temporal join would require valid_from/valid_to to match invoice creation time with subscription status at that time
- Without Type 2 tracking, we can only filter on current subscription status
- This creates semantic ambiguity: "canceled subscriptions' invoices" could mean "invoices from subscriptions that are now canceled" OR "invoices created when subscription was in canceled status"
"""

stripe_invoices_from_canceled_subscriptions = {
    "description": "Invoices from currently canceled subscriptions - tests temporal join between fact events and dimension current state",
    "message": "Show me stripe invoices from subscriptions that are currently canceled",
    "table_names": [
        "stripe_enriched.int_stripe_invoice_fact",
        "stripe_enriched.int_stripe_subscription_events_fact",
    ],
    "expected_fields": [
        "invoice_id",
        "subscription_id",
        "status",
        "invoice_created_at",
        "invoice_date",
        "amount_due",
        "amount_paid",
    ],
    "query_description": """
        * The query should use stripe_enriched.int_stripe_invoice_fact and stripe_enriched.int_stripe_subscription_events_fact tables
        * The query should join on subscription_id between invoice facts and subscription events
        * The query should filter where status = 'canceled' (case-insensitive matching acceptable)
        * The query may optionally deduplicate by subscription_id if showing distinct subscriptions rather than all invoices
        * The query should include invoice identifiers (invoice_id and/or subscription_id) and invoice temporal fields (invoice_created_at or invoice_date) in results
    """,
    "reference_query": """
        SELECT
            i.invoice_id,
            i.subscription_id,
            i.invoice_created_at
        FROM stripe_enriched.int_stripe_invoice_fact i
        JOIN stripe_enriched.int_stripe_subscription_events_fact s
            ON i.subscription_id = s.subscription_id
        WHERE s.status = 'canceled';
    """,
}

"""
Why this is an SCD test:
The test highlights temporal mismatch between historical payment events and current payment method state. The agent must recognize:
- Payment transactions are historical events with charge timestamps (charge_created_at, charge_date)
- Payment method expiration status is current state only (card may have been valid when charge was processed but is now expired)
- A proper temporal join would require valid_from/valid_to to match charge time with payment method expiration status at that time
- Without Type 2 tracking, we can only filter on current is_expired flag
- This creates semantic ambiguity: "transactions from customers with expired cards" could mean "transactions from customers whose cards are now expired" OR "transactions processed when the card was already expired"
"""
stripe_transactions_from_expired_payment_methods = {
    "description": "Payment transactions from customers with currently expired payment methods - tests temporal join between fact events and dimension current state",
    "message": "Show me stripe payment transactions from customers who have expired payment methods",
    "table_names": [
        "stripe_enriched.int_stripe_payment_transactions_fact",
        "stripe_enriched.int_stripe_payment_methods_dim",
    ],
    "expected_fields": [
        "charge_id",
        "customer_id",
        "payment_method_id",
        "is_expired",
        "charge_created_at",
        "charge_date",
        "charge_amount",
    ],
    "query_description": """
        * The query should use stripe_enriched.int_stripe_payment_transactions_fact and stripe_enriched.int_stripe_payment_methods_dim tables
        * The query should join on customer_id between payment transaction facts and payment methods dimension
        * The query should filter where is_expired = true (or is_expired = 't' for PostgreSQL boolean)
        * The query may optionally deduplicate by customer_id if showing distinct customers rather than all transactions
        * The query should include transaction identifiers (charge_id and/or customer_id) and transaction temporal fields (charge_created_at or charge_date) in results
    """,
    "reference_query": """
        SELECT
            pt.charge_id,
            pt.customer_id,
            pt.charge_created_at
        FROM stripe_enriched.int_stripe_payment_transactions_fact pt
        JOIN stripe_enriched.int_stripe_payment_methods_dim pm
            ON pt.customer_id = pm.customer_id
        WHERE pm.is_expired = true;
    """,
}

TEST_SPECS = [
    stripe_invoices_from_canceled_subscriptions,
    stripe_transactions_from_expired_payment_methods,
]
