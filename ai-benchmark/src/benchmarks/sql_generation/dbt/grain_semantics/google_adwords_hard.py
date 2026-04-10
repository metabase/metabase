"""
Why this is a Grain test:
Tests cross-grain comparison between keyword-day performance and ad group-day aggregates, requiring understanding of Google AdWords campaign hierarchy.
The agent must recognize:
- Keyword performance facts are at keyword-day grain while ad group performance facts aggregate all keywords per ad group per day
- Join requires matching on both ad_group_id AND performance_date for correct temporal alignment
- Comparison of individual keyword CTR against the ad group's aggregated CTR tests understanding of detail vs aggregate metrics
- Results require deduplication by keyword_id to avoid listing the same keyword multiple times across different performance dates
- Google AdWords hierarchy where keywords belong to ad groups, and both track daily performance metrics
"""

google_adwords_keywords_exceed_ad_group_ctr = {
    "description": "Keywords exceeding ad group CTR - tests joining keyword-level facts to ad group-level aggregates with temporal matching",
    "message": "Show me google adwords keywords where individual keyword CTR exceeded the ad group's average",
    "table_names": [
        "google_adwords_enriched.int_google_adwords_keyword_performance_facts",
        "google_adwords_enriched.int_google_adwords_ad_group_performance_facts",
    ],
    "expected_fields": [
        "keyword_id",
        "keyword_text",
        "ad_group_id",
        "ad_group_name",
        "click_through_rate",
        "performance_date",
    ],
    "query_description": """
        * The query should use google_adwords_enriched.int_google_adwords_keyword_performance_facts and google_adwords_enriched.int_google_adwords_ad_group_performance_facts tables
        * The query should join on both ad_group_id AND performance_date to match keyword performance with the corresponding ad group performance on the same day
        * The query should filter where the keyword's click_through_rate is greater than the ad group's click_through_rate
        * The query should deduplicate by keyword to show each keyword only once (using GROUP BY keyword_id or DISTINCT)
        * The query should include keyword identifier (keyword_id and/or keyword_text) in results
    """,
    "reference_query": """
        SELECT DISTINCT kpf.keyword_text, kpf.ad_group_name
        FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts kpf
        JOIN google_adwords_enriched.int_google_adwords_ad_group_performance_facts agpf
        ON kpf.ad_group_id = agpf.ad_group_id
        AND kpf.performance_date = agpf.performance_date
        WHERE kpf.click_through_rate > agpf.click_through_rate;
    """,
}

"""
Why this is a Grain test:
Tests cross-grain comparison between campaign-day performance and account-day aggregates, requiring understanding of hierarchical rollup in Google AdWords.
The agent must recognize:
- Campaign performance facts are at campaign-day grain while daily spend facts aggregate all campaigns per account per day
- Join requires matching on both account identifier AND performance_date for correct temporal alignment
- Comparison of individual campaign cost_per_click against the account's average_cost_per_click tests understanding of detail vs aggregate metrics
- Results require deduplication by campaign_id to avoid listing the same campaign multiple times across different performance dates
- Google AdWords hierarchy where multiple campaigns roll up to a single account
"""
google_adwords_campaigns_exceed_account_cpc = {
    "description": "Campaigns exceeding account average CPC - tests joining campaign-level facts to account-level aggregates with temporal matching",
    "message": "Show me google adwords campaigns where cost per click exceeded the account's daily average",
    "table_names": [
        "google_adwords_enriched.int_google_adwords_campaign_performance_facts",
        "google_adwords_enriched.int_google_adwords_daily_spend_facts",
    ],
    "expected_fields": [
        "campaign_id",
        "campaign_name",
        "account_name",
        "cost_per_click",
        "average_cost_per_click",
        "performance_date",
        "spend_date",
    ],
    "query_description": """
        * The query should use google_adwords_enriched.int_google_adwords_campaign_performance_facts and google_adwords_enriched.int_google_adwords_daily_spend_facts tables
        * The query should join on both account_name AND matching performance_date to spend_date for correct temporal alignment
        * The query should filter where the campaign's cost_per_click is greater than the account's average_cost_per_click
        * The query should deduplicate by campaign to show each campaign only once (using GROUP BY campaign_id or DISTINCT)
        * The query should include campaign identifier (campaign_id and/or campaign_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT cpf.campaign_name, cpf.account_name
        FROM google_adwords_enriched.int_google_adwords_campaign_performance_facts cpf
        JOIN google_adwords_enriched.int_google_adwords_daily_spend_facts dsf
        ON cpf.account_name = dsf.account_name
        AND cpf.performance_date = dsf.spend_date
        WHERE cpf.cost_per_click > dsf.average_cost_per_click;
    """,
}

TEST_SPECS = [
    google_adwords_keywords_exceed_ad_group_ctr,
    google_adwords_campaigns_exceed_account_cpc,
]
