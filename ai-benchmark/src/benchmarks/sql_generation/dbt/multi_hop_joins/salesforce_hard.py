"""
Why this is a Multi-Hop Join test:
This test validates DAG navigation through a 3-hop join path across enriched Salesforce tables. The agent must recognize:
- Case facts must join to account dimension via account_id to access account context (hop 1)
- Account dimension must join to opportunity facts via account_id to access opportunity ownership (hop 2)
- Opportunity facts must join to user dimension via owner_id to access aggregated sales performance metrics (hop 3)
- The filtering criteria (case_priority = 'Critical' from case facts AND total_won_revenue > 100000 from user dim) require full path traversal
- This tests understanding of Salesforce relationship hierarchy: support cases → accounts → sales opportunities → opportunity owners (sales reps)
- Proper deduplication by case_id is required since one account can have multiple opportunities, creating a one-to-many relationship
"""

salesforce_critical_cases_high_revenue_reps = {
    "description": "Critical cases for accounts with opportunities owned by high-revenue sales reps - tests 3-hop DAG navigation across Salesforce support and sales domains",
    "message": "Show me critical salesforce cases for accounts with opportunities owned by sales reps who have won more than 100000 total revenue",
    "table_names": [
        "salesforce_enriched.int_salesforce_case_facts",
        "salesforce_enriched.int_salesforce_account_dim",
        "salesforce_enriched.int_salesforce_opportunity_facts",
        "salesforce_enriched.int_salesforce_user_dim",
    ],
    "expected_fields": [
        "case_id",
        "account_id",
        "account_name",
        "case_subject",
        "case_priority",
        "case_status",
        "user_id",
        "full_name",
        "total_won_revenue",
        "opportunity_id",
    ],
    "query_description": """
        * The query should use salesforce_enriched.int_salesforce_case_facts as the starting point
        * The query should join to salesforce_enriched.int_salesforce_account_dim on account_id (matching case_facts.account_id to account_dim.account_id)
        * The query should join to salesforce_enriched.int_salesforce_opportunity_facts on account_id (matching account_dim.account_id to opportunity_facts.account_id)
        * The query should join to salesforce_enriched.int_salesforce_user_dim on owner_id (matching opportunity_facts.owner_id to user_dim.user_id)
        * The query should filter where case_priority = 'Critical'
        * The query should filter where total_won_revenue > 100000
        * The query should deduplicate by case_id using DISTINCT or GROUP BY since one account can have multiple opportunities
        * The query should include case identifiers (case_id and/or case_subject) and account information (account_id and/or account_name) and user information (user_id and/or full_name and/or total_won_revenue) in results
    """,
    "reference_query": """
        SELECT DISTINCT
            cf.case_id,
            cf.account_name,
            cf.case_subject
        FROM salesforce_enriched.int_salesforce_case_facts cf
        INNER JOIN salesforce_enriched.int_salesforce_account_dim ad
            ON cf.account_id = ad.account_id
        INNER JOIN salesforce_enriched.int_salesforce_opportunity_facts of
            ON ad.account_id = of.account_id
        INNER JOIN salesforce_enriched.int_salesforce_user_dim ud
            ON of.owner_id = ud.user_id
        WHERE cf.case_priority = 'Critical'
            AND ud.total_won_revenue > 100000
        ORDER BY cf.case_id;
    """,
}

"""
Why this is a Multi-Hop Join test:
This test validates DAG navigation across sales activity, contact, account, and opportunity domains. The agent must recognize:
- Activity facts must join to contact dimension via who_id to identify which contact the task relates to (hop 1)
- Contact dimension must join to account dimension via account_id to access account business segment classification (hop 2)
- Account dimension must join to opportunity facts via account_id to filter for won deals (hop 3)
- The filtering criteria (task_priority = 'High' from activity facts AND account_segment = 'Enterprise' from account dim AND is_won = 'true' from opportunity facts) require full path traversal
- This tests understanding of Salesforce relationship hierarchy: sales activities → contacts → accounts → sales opportunities
- Proper deduplication by task_id is required since one account can have multiple won opportunities, creating a one-to-many relationship
"""

salesforce_high_priority_tasks_enterprise_won = {
    "description": "High priority tasks for contacts at Enterprise accounts with won opportunities - tests 3-hop DAG navigation across Salesforce activity, contact, and sales domains",
    "message": "Show me high priority salesforce tasks for contacts at Enterprise accounts with won opportunities",
    "table_names": [
        "salesforce_enriched.int_salesforce_activity_facts",
        "salesforce_enriched.int_salesforce_contact_dim",
        "salesforce_enriched.int_salesforce_account_dim",
        "salesforce_enriched.int_salesforce_opportunity_facts",
    ],
    "expected_fields": [
        "task_id",
        "task_subject",
        "task_priority",
        "contact_id",
        "full_name",
        "account_id",
        "account_name",
        "account_segment",
        "opportunity_id",
        "is_won",
    ],
    "query_description": """
        * The query should use salesforce_enriched.int_salesforce_activity_facts as the starting point
        * The query should join to salesforce_enriched.int_salesforce_contact_dim on who_id (matching activity_facts.who_id to contact_dim.contact_id)
        * The query should join to salesforce_enriched.int_salesforce_account_dim on account_id (matching contact_dim.account_id to account_dim.account_id)
        * The query should join to salesforce_enriched.int_salesforce_opportunity_facts on account_id (matching account_dim.account_id to opportunity_facts.account_id)
        * The query should filter where task_priority = 'High'
        * The query should filter where account_segment = 'Enterprise'
        * The query should filter where is_won = 'true'
        * The query should deduplicate by task_id using DISTINCT or GROUP BY since one account can have multiple won opportunities
        * The query should include task identifiers (task_id and/or task_subject) and contact information (contact_id and/or full_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT
            af.task_id,
            af.task_subject,
            c.full_name
        FROM salesforce_enriched.int_salesforce_activity_facts af
        INNER JOIN salesforce_enriched.int_salesforce_contact_dim c
            ON af.who_id = c.contact_id
        INNER JOIN salesforce_enriched.int_salesforce_account_dim ad
            ON c.account_id = ad.account_id
        INNER JOIN salesforce_enriched.int_salesforce_opportunity_facts opf
            ON ad.account_id = opf.account_id
        WHERE af.task_priority = 'High'
            AND ad.account_segment = 'Enterprise'
            AND opf.is_won = 'true'
        ORDER BY af.task_id;
    """,
}

TEST_SPECS = [
    salesforce_critical_cases_high_revenue_reps,
    salesforce_high_priority_tasks_enterprise_won,
]
