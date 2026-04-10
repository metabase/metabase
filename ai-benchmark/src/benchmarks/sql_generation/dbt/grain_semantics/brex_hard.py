"""
Tests cross-grain comparison requiring join between expense-level facts and department-month
aggregates. Agent must match on both department_id AND month, compare individual expenses to
aggregated averages, and deduplicate departments in results to avoid listing the same
department multiple times.
"""

brex_expense_exceeds_dept_avg = {
    "description": "Expenses exceeding department monthly average - tests joining detail grain to aggregate grain with temporal matching",
    "message": "Show me brex departments where individual expenses exceeded the department's monthly average",
    "table_names": ["brex_enriched.int_brex_expense_facts", "brex_enriched.int_brex_spending_by_department_facts"],
    "expected_fields": [
        "department_id",
        "department_name",
        "expense_amount",
        "average_expense",
        "expense_month",
        "spending_month",
    ],
    "query_description": """
        * The query should use brex_enriched.int_brex_expense_facts and brex_enriched.int_brex_spending_by_department_facts tables
        * The query should join on both department_id AND matching the expense month to spending_month (may require extracting month from expense_date or using expense_month field)
        * The query should filter where individual expense_amount is greater than the monthly average_expense
        * The query should deduplicate by department to show each department only once (using GROUP BY department_id or DISTINCT)
        * The query should include department identifier (department_id and/or department_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT ief.department_name
        FROM brex_enriched.int_brex_expense_facts ief
        JOIN brex_enriched.int_brex_spending_by_department_facts sdbf
        ON ief.department_id = sdbf.department_id
        WHERE ief.expense_amount > sdbf.average_expense
        AND ief.expense_date BETWEEN sdbf.spending_month AND sdbf.spending_month + interval '1 month';
    """,
}

"""
Tests cross-grain comparison between transaction-level detail and user-month aggregates. Agent
must join individual transactions to monthly user spending statistics, matching on both user_id
AND the transaction's month to the spending_month. Requires comparing transaction_amount against
the user's average_transaction for that month, then deduplicating by user_id to avoid listing
the same user multiple times when they have multiple transactions exceeding their average.
"""
brex_user_transactions_exceed_monthly_avg = {
    "description": "Users with transactions exceeding their monthly average - tests detail-to-aggregate grain join with temporal and entity deduplication",
    "message": "Find brex users who had individual transactions that exceeded their monthly average spend",
    "table_names": ["brex_enriched.int_brex_transaction_facts", "brex_enriched.int_brex_spending_by_user_facts"],
    "expected_fields": [
        "user_id",
        "user_name",
        "transaction_amount",
        "average_transaction",
        "transaction_date",
        "spending_month",
    ],
    "query_description": """
        * The query should use brex_enriched.int_brex_transaction_facts and brex_enriched.int_brex_spending_by_user_facts tables
        * The query should join on both user_id AND matching the transaction month to spending_month (may require extracting month from transaction_date or using transaction_month field)
        * The query should filter where individual transaction_amount is greater than the monthly average_transaction
        * The query should deduplicate by user to show each user only once (using GROUP BY user_id or DISTINCT)
        * The query should include user identifier (user_id and/or user_name) in results
    """,
    "reference_query": """
        SELECT
          DISTINCT int_brex_transaction_facts.user_name
        FROM
          brex_enriched.int_brex_transaction_facts
        INNER JOIN
          brex_enriched.int_brex_spending_by_user_facts
        ON
          int_brex_transaction_facts.user_id = int_brex_spending_by_user_facts.user_id
        WHERE
          int_brex_transaction_facts.transaction_amount > int_brex_spending_by_user_facts.average_transaction
        ORDER BY
          int_brex_transaction_facts.user_name;
    """,
}

TEST_SPECS = [
    brex_expense_exceeds_dept_avg,
    brex_user_transactions_exceed_monthly_avg,
]
