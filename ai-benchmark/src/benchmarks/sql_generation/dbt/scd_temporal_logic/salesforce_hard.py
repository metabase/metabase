"""
Why this is an SCD test:
The test highlights temporal mismatch between historical stage change events and current opportunity state. The agent must recognize:
- Stage changes are historical events with timestamps (stage_change_date) tracking when opportunities moved through the pipeline
- Opportunity win status is current state only (opportunity may have been in various stages like Prospecting, Qualification, etc. when stage changes occurred)
- A proper temporal join would require valid_from/valid_to to match stage change time with opportunity status at that time
- Without Type 2 tracking, we can only filter on current is_won status
- This creates semantic ambiguity: "stage changes for won opportunities" could mean "stage changes from opportunities that are now won" OR "stage changes that occurred when the opportunity was already in won status"
"""

salesforce_stage_changes_for_won_opportunities = {
    "description": "Stage progressions for currently won opportunities - tests temporal join between historical stage events and current opportunity state",
    "message": "Show me salesforce opportunity stage changes for opportunities that are currently won",
    "table_names": [
        "salesforce_enriched.int_salesforce_opportunity_stage_facts",
        "salesforce_enriched.int_salesforce_opportunity_facts",
    ],
    "expected_fields": [
        "opportunity_name",
        "stage_name",
        "stage_change_date",
    ],
    "query_description": """
        * The query should use salesforce_enriched.int_salesforce_opportunity_stage_facts and salesforce_enriched.int_salesforce_opportunity_facts tables
        * The query should join on opportunity_id between stage facts and opportunity facts
        * The query should filter where is_won = true (or is_won = 't' for PostgreSQL boolean)
        * The query should include opportunity_name, stage_name, and stage_change_date in results
        * The query may optionally include opportunity_id
    """,
    "reference_query": """
        SELECT
            sf.opportunity_name,
            sf.stage_name,
            sf.stage_change_date
        FROM salesforce_enriched.int_salesforce_opportunity_stage_facts sf
        JOIN salesforce_enriched.int_salesforce_opportunity_facts of
            ON sf.opportunity_id = of.opportunity_id
        WHERE of.is_won = true
        ORDER BY sf.opportunity_id, sf.stage_change_date;
    """,
}

"""
Why this is an SCD test:
The test highlights temporal mismatch between historical activity events and current account business segment. The agent must recognize:
- Activities are historical events with timestamps (activity_date, task_created_date) tracking when tasks were performed for accounts
- Account segment is current state only (accounts may have been in different segments like Mid-Market or Small Business when activities occurred)
- A proper temporal join would require valid_from/valid_to to match activity time with account segment at that time
- Without Type 2 tracking, we can only filter on current account_segment
- This creates semantic ambiguity: "activities for Enterprise accounts" could mean "activities from accounts that are now Enterprise" OR "activities that occurred when the account was already in Enterprise segment"
"""

salesforce_activities_for_enterprise_accounts = {
    "description": "Sales activities for currently Enterprise segment accounts - tests temporal join between historical activity events and current account segment state",
    "message": "Show me salesforce activities for accounts that are currently in the Enterprise segment",
    "table_names": [
        "salesforce_enriched.int_salesforce_activity_facts",
        "salesforce_enriched.int_salesforce_account_dim",
    ],
    "expected_fields": [
        "account_name",
        "task_subject",
        "activity_date",
    ],
    "query_description": """
        * The query should use salesforce_enriched.int_salesforce_activity_facts and salesforce_enriched.int_salesforce_account_dim tables
        * The query should join on what_id (from activity facts) to account_id (from account dim)
        * The query should filter where account_segment = 'Enterprise'
        * The query should include account_name, task_subject, and activity_date in results
        * The query may optionally include account_id
    """,
    "reference_query": """
        SELECT
            ad.account_name,
            af.task_subject,
            af.activity_date
        FROM salesforce_enriched.int_salesforce_activity_facts af
        JOIN salesforce_enriched.int_salesforce_account_dim ad
            ON af.what_id = ad.account_id
        WHERE ad.account_segment = 'Enterprise'
        ORDER BY af.activity_date;
    """,
}

TEST_SPECS = [
    salesforce_stage_changes_for_won_opportunities,
    salesforce_activities_for_enterprise_accounts,
]
