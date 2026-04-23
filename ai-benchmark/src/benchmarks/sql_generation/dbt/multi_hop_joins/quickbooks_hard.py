"""
Why this is a Multi-Hop Join test:
This test validates DAG navigation through a 4-hop join path mixing enriched and raw QuickBooks tables. The agent must recognize:
- Invoice facts must join to raw invoice_line table via invoice_id to access item-level detail (hop 1)
- Raw invoice_line must join to enriched item_dim via item_id to filter by item_type (hop 2)
- Invoice facts must join to customer_dim via customer_id to filter by balance_tier (hop 3)
- The filtering criteria (payment_status = 'Overdue' from invoice facts, item_type = 'Service' from item dim, AND balance_tier = 'Medium Balance' from customer dim) require full path traversal
- The query requires mixing enriched intermediate models (int_quickbooks_invoice_facts, int_quickbooks_item_dim, int_quickbooks_customer_dim) with raw staging tables (quickbooks_data.invoice_line)
- Proper handling of soft-deleted records in the raw invoice_line table
"""

quickbooks_overdue_invoices_for_service_items_medium_balance_customers = {
    "description": "Overdue invoices with service items from medium-balance customers - tests 4-hop DAG navigation across enriched and raw QuickBooks layers",
    "message": "Show me overdue quickbooks invoices that include service items from customers with medium balances",
    "table_names": [
        "quickbooks_enriched.int_quickbooks_invoice_facts",
        "quickbooks_data.invoice_line",
        "quickbooks_enriched.int_quickbooks_item_dim",
        "quickbooks_enriched.int_quickbooks_customer_dim",
    ],
    "expected_fields": [
        "invoice_id",
        "customer_id",
        "customer_name",
        "payment_status",
        "outstanding_balance",
        "invoice_date",
        "due_date",
        "item_id",
        "item_name",
        "item_type",
        "balance_tier",
    ],
    "query_description": """
        * The query should use quickbooks_enriched.int_quickbooks_invoice_facts as the starting point
        * The query should join to quickbooks_data.invoice_line on invoice_id (matching invoice_facts.invoice_id to invoice_line.invoice_id)
        * The query should join to quickbooks_enriched.int_quickbooks_item_dim on item_id (matching invoice_line.sales_item_item_ref_value to item_dim.item_id)
        * The query should join to quickbooks_enriched.int_quickbooks_customer_dim on customer_id (matching invoice_facts.customer_id to customer_dim.customer_id)
        * The query should filter where payment_status = 'Overdue'
        * The query should filter where item_type = 'Service'
        * The query should filter where balance_tier = 'Medium Balance'
        * The query should filter out soft-deleted records from the invoice_line table (where _fivetran_deleted = false or IS NULL)
        * The query may optionally deduplicate by invoice_id if multiple invoice lines per invoice exist
        * The query should include invoice identifiers (invoice_id and/or customer_id) and item identifiers (item_id and/or item_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT
            if.invoice_id,
            if.customer_id,
            cd.customer_name
        FROM quickbooks_enriched.int_quickbooks_invoice_facts if
        INNER JOIN quickbooks_data.invoice_line il ON if.invoice_id = il.invoice_id
            AND il._fivetran_deleted = FALSE
        INNER JOIN quickbooks_enriched.int_quickbooks_item_dim itm ON il.sales_item_item_ref_value = itm.item_id
        INNER JOIN quickbooks_enriched.int_quickbooks_customer_dim cd ON if.customer_id = cd.customer_id
        WHERE if.payment_status = 'Overdue'
            AND itm.item_type = 'Service'
            AND cd.balance_tier = 'Medium Balance'
        ORDER BY if.invoice_id;
    """,
}

"""
Why this is a Multi-Hop Join test:
This test validates DAG navigation through a 3-hop join path across enriched QuickBooks tables. The agent must recognize:
- Invoice line facts must join to item dimension via item_id to access item catalog details (hop 1)
- Item dimension must join to account dimension via income_account_id to access account classifications (hop 2)
- The filtering criterion (statement_type = 'Balance Sheet') exists only in the account dimension, requiring full path traversal
- This tests understanding of QuickBooks accounting hierarchy: invoice lines → items → income accounts → account classifications
- Proper understanding that statement_type is a derived field in account_dim based on the account's classification
"""
quickbooks_invoice_lines_with_balance_sheet_income_accounts = {
    "description": "Invoice lines for items posting to Balance Sheet income accounts - tests 3-hop DAG navigation through QuickBooks accounting hierarchy",
    "message": "Show me quickbooks invoice lines for items whose income accounts are Balance Sheet accounts",
    "table_names": [
        "quickbooks_enriched.int_quickbooks_invoice_line_facts",
        "quickbooks_enriched.int_quickbooks_item_dim",
        "quickbooks_enriched.int_quickbooks_account_dim",
    ],
    "expected_fields": [
        "invoice_line_id",
        "invoice_id",
        "item_id",
        "item_name",
        "item_category",
        "income_account_id",
        "account_name",
        "classification",
        "statement_type",
    ],
    "query_description": """
        * The query should use quickbooks_enriched.int_quickbooks_invoice_line_facts as the starting point
        * The query should join to quickbooks_enriched.int_quickbooks_item_dim on item_id (matching invoice_line_facts.item_id to item_dim.item_id)
        * The query should join to quickbooks_enriched.int_quickbooks_account_dim on income_account_id (matching item_dim.income_account_id to account_dim.account_id)
        * The query should filter where statement_type = 'Balance Sheet'
        * The query may optionally deduplicate by invoice_line_id if needed
        * The query should include invoice line identifiers (invoice_line_id and/or invoice_id) and item identifiers (item_id and/or item_name) and account information (account_name and/or statement_type) in results
    """,
    "reference_query": """
        SELECT
            il.invoice_line_id,
            il.item_name,
            a.account_name,
            a.statement_type
        FROM quickbooks_enriched.int_quickbooks_invoice_line_facts il
        INNER JOIN quickbooks_enriched.int_quickbooks_item_dim i ON il.item_id = i.item_id
        INNER JOIN quickbooks_enriched.int_quickbooks_account_dim a ON i.income_account_id = a.account_id
        WHERE a.statement_type = 'Balance Sheet'
        ORDER BY il.invoice_line_id;
    """,
}

TEST_SPECS = [
    quickbooks_overdue_invoices_for_service_items_medium_balance_customers,
    quickbooks_invoice_lines_with_balance_sheet_income_accounts,
]
