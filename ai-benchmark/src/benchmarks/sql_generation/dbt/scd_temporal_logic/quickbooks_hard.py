"""
Why this is an SCD test:
The test highlights temporal mismatch between historical invoice events and current customer balance state. The agent must recognize:
- Invoices are historical events with creation timestamps (invoice_date, created_time)
- Customer balance_tier is current state only, derived from current balance (may have been different when invoice was created)
- A proper temporal join would require valid_from/valid_to to match invoice creation time with balance_tier at that time
- Without Type 2 tracking, we can only filter on current balance_tier
- This creates semantic ambiguity: "invoices from customers with medium balance tier" could mean "invoices from customers who currently have medium balance" OR "invoices created when customer had medium balance tier"
"""

quickbooks_invoices_from_medium_balance_customers = {
    "description": "Invoices from customers with current medium balance tier - tests temporal join between fact events and dimension current state",
    "message": "Show me quickbooks invoices from customers who currently have a medium balance tier",
    "table_names": [
        "quickbooks_enriched.int_quickbooks_invoice_facts",
        "quickbooks_enriched.int_quickbooks_customer_dim",
    ],
    "expected_fields": [
        "invoice_id",
        "customer_name",
        "balance_tier",
    ],
    "query_description": """
        * The query should use quickbooks_enriched.int_quickbooks_invoice_facts and quickbooks_enriched.int_quickbooks_customer_dim tables
        * The query should join on customer_id between invoice facts and customer dimension
        * The query should filter where balance_tier = 'Medium Balance' (case-insensitive matching acceptable)
        * The query should include invoice_id, customer_name, and balance_tier in results
    """,
    "reference_query": """
        SELECT
            i.invoice_id,
            i.customer_name,
            c.balance_tier
        FROM quickbooks_enriched.int_quickbooks_invoice_facts i
        JOIN quickbooks_enriched.int_quickbooks_customer_dim c
            ON i.customer_id = c.customer_id
        WHERE c.balance_tier = 'Medium Balance';
    """,
}

"""
Why this is an SCD test:
Bills are historical events with creation timestamps, but payment_status reflects only current state derived from current balance and due_date. The agent must recognize:
- Bills are fact events created at a specific point in time (bill_date, created_time)
- payment_status is current state only (Paid/Overdue/Outstanding) that changes as payments are received
- A bill created months ago may have transitioned: Outstanding → Overdue → Paid
- Without Type 2 SCD tracking (valid_from/valid_to), we cannot determine payment_status at bill creation time
- The query filters on both historical period (Q3 2024) and current status (Overdue), demonstrating temporal mismatch between event time and dimension state
"""

quickbooks_overdue_bills_from_q3 = {
    "description": "Q3 2024 bills with current overdue status - tests temporal mismatch between historical bill events and current payment state",
    "message": "Show me quickbooks bills from Q3 2024 that are currently overdue",
    "table_names": [
        "quickbooks_enriched.int_quickbooks_bill_facts",
    ],
    "expected_fields": [
        "bill_id",
        "vendor_name",
        "bill_quarter",
        "payment_status",
    ],
    "query_description": """
        * The query should use quickbooks_enriched.int_quickbooks_bill_facts table
        * The query should filter where bill_quarter = 3 (for Q3 2024)
        * The query should filter where payment_status = 'Overdue' (case-insensitive matching acceptable)
        * The query should include bill_id, vendor_name, bill_quarter, and payment_status in results
    """,
    "reference_query": """
        SELECT
            bill_id,
            vendor_name,
            bill_quarter,
            payment_status
        FROM quickbooks_enriched.int_quickbooks_bill_facts
        WHERE bill_quarter = 3
            AND payment_status = 'Overdue';
    """,
}

TEST_SPECS = [
    quickbooks_invoices_from_medium_balance_customers,
    quickbooks_overdue_bills_from_q3,
]
