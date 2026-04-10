"""
Why this is a Grain test:
Tests cross-grain join between interview-level facts and candidate-level aggregates.
The agent must recognize:
- int_lever_interview_facts is at interview grain (multiple interviews per candidate)
- int_lever_hiring_funnel_facts is at candidate grain (one row per candidate)
- Joining detail records to candidate aggregates requires deduplication by candidate
- Must avoid listing the same candidate multiple times when they have multiple qualifying interviews
"""

lever_candidates_with_long_interviews = {
    "description": "Candidates with long interview durations - tests joining interview-level detail to candidate-level aggregate grain with entity deduplication",
    "message": "Show me lever candidates who had interviews lasting longer than 100 minutes",
    "table_names": ["lever_enriched.int_lever_interview_facts", "lever_enriched.int_lever_hiring_funnel_facts"],
    "expected_fields": [
        "opportunity_id",
        "candidate_name",
        "duration_minutes",
        "interview_count",
    ],
    "query_description": """
        * The query should use lever_enriched.int_lever_interview_facts and lever_enriched.int_lever_hiring_funnel_facts tables
        * The query should join on opportunity_id to match individual interviews to candidate-level records
        * The query should filter where individual duration_minutes is greater than 100
        * The query should deduplicate by candidate to show each candidate only once (using GROUP BY opportunity_id or DISTINCT)
        * The query should include candidate identifier (opportunity_id and/or candidate_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT hff.candidate_name
        FROM lever_enriched.int_lever_interview_facts iff
        JOIN lever_enriched.int_lever_hiring_funnel_facts hff
        ON iff.opportunity_id = hff.opportunity_id
        WHERE iff.duration_minutes > 100;
    """,
}

"""
Why this is a Grain test:
Tests cross-grain join between offer-level facts and candidate-level aggregates.
The agent must recognize:
- int_lever_offer_facts is at offer grain (multiple offers per candidate possible)
- int_lever_hiring_funnel_facts is at candidate grain (one row per candidate)
- Joining detail records to candidate aggregates requires deduplication by candidate
- Must avoid listing the same candidate multiple times when they have multiple qualifying offers
"""
lever_candidates_with_fast_offer_approvals = {
    "description": "Candidates with fast offer approvals - tests joining offer-level detail to candidate-level aggregate grain with entity deduplication",
    "message": "Show me lever candidates who received offers approved within 1 day",
    "table_names": ["lever_enriched.int_lever_offer_facts", "lever_enriched.int_lever_hiring_funnel_facts"],
    "expected_fields": [
        "opportunity_id",
        "candidate_name",
        "days_to_approve",
        "offer_count",
    ],
    "query_description": """
        * The query should use lever_enriched.int_lever_offer_facts and lever_enriched.int_lever_hiring_funnel_facts tables
        * The query should join on opportunity_id to match individual offers to candidate-level records
        * The query should filter where days_to_approve is less than or equal to 1
        * The query should deduplicate by candidate to show each candidate only once (using GROUP BY opportunity_id or DISTINCT)
        * The query should include candidate identifier (opportunity_id and/or candidate_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT hff.candidate_name
        FROM lever_enriched.int_lever_offer_facts off
        JOIN lever_enriched.int_lever_hiring_funnel_facts hff
        ON off.opportunity_id = hff.opportunity_id
        WHERE off.days_to_approve <= 1;
    """,
}

TEST_SPECS = [
    lever_candidates_with_long_interviews,
    lever_candidates_with_fast_offer_approvals,
]
