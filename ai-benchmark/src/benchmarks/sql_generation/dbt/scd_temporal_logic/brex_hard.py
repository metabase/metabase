"""
Why this is an SCD test:
The test highlights the limitation of SCD Type 1 (current state only) vs Type 2 (historical tracking). The agent must recognize:
- Transactions are historical events (past timestamps)
- Card status is current state (may have changed since transaction)
- A proper temporal join would require valid_from/valid_to to match transaction time with status at that time
- Without Type 2 tracking, we can only filter on current status
"""

brex_transactions_on_frozen_cards = {
    "description": "Transactions on currently frozen cards - tests temporal join between fact events and dimension current state",
    "message": "Show me brex transactions on cards that are currently frozen",
    "table_names": ["brex_enriched.int_brex_transaction_facts", "brex_enriched.int_brex_card_dim"],
    "expected_fields": [
        "card_id",
        "card_status",
        "transaction_id",
        "transaction_amount",
        "transaction_timestamp",
        "transaction_date",
    ],
    "query_description": """
        * The query should use brex_enriched.int_brex_transaction_facts and brex_enriched.int_brex_card_dim tables
        * The query should join on card_id between transaction facts and card dimension
        * The query should filter where card_status = 'frozen' (case-insensitive matching acceptable)
        * The query may optionally deduplicate by card_id if showing distinct cards rather than all transactions
        * The query should include transaction identifiers (transaction_id and/or card_id) and transaction temporal fields (transaction_timestamp or transaction_date) in results
    """,
    "reference_query": """
        SELECT
            t.transaction_id,
            t.card_id,
            c.card_status,
            t.transaction_timestamp
        FROM brex_enriched.int_brex_transaction_facts t
        JOIN brex_enriched.int_brex_card_dim c
            ON t.card_id = c.card_id
        WHERE c.card_status = 'frozen';
    """,
}

"""
Why this is an SCD test:
The test highlights temporal mismatch between historical events and current dimension state. The agent must recognize:
- Expenses are historical events with submission timestamps (submitted_at, expense_created_date)
- User status is current state only (user may have been 'active' when submitting but is now 'inactive')
- A proper temporal join would require valid_from/valid_to to match expense submission time with user status at that time
- Without Type 2 tracking, we can only filter on current user_status
- This creates semantic ambiguity: "inactive users' expenses" could mean "expenses from users who are now inactive" OR "expenses submitted when users were inactive"
"""
brex_expenses_from_inactive_users = {
    "description": "Expenses from currently inactive users - tests temporal join between fact events and dimension current state",
    "message": "Show me brex expenses submitted by users who are currently inactive",
    "table_names": ["brex_enriched.int_brex_expense_facts", "brex_enriched.int_brex_user_dim"],
    "expected_fields": [
        "expense_id",
        "user_id",
        "user_status",
        "user_name",
        "submitted_at",
        "expense_created_date",
        "expense_amount",
        "expense_date",
    ],
    "query_description": """
        * The query should use brex_enriched.int_brex_expense_facts and brex_enriched.int_brex_user_dim tables
        * The query should join on user_id between expense facts and user dimension
        * The query should filter where user_status = 'inactive' (case-insensitive matching acceptable)
        * The query may optionally deduplicate by user_id if showing distinct users rather than all expenses
        * The query should include expense identifiers (expense_id and/or user_id) and expense temporal fields (submitted_at, expense_created_date, or expense_date) in results
    """,
    "reference_query": """
    SELECT
        e.expense_id,
        e.user_id,
        u.user_status,
        e.submitted_at
    FROM brex_enriched.int_brex_expense_facts e
    JOIN brex_enriched.int_brex_user_dim u
        ON e.user_id = u.user_id
    WHERE u.user_status = 'inactive';
    """,
}

TEST_SPECS = [
    brex_transactions_on_frozen_cards,
    brex_expenses_from_inactive_users,
]
