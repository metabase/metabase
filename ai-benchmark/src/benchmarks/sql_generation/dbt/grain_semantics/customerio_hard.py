"""
Why this is a Grain test:
Tests ability to join delivery-level facts to campaign-level aggregates and compare detail metrics to derived campaign averages.
The agent must recognize:
- Engagement facts are at delivery grain (one row per message delivery) while campaign dimension is at campaign grain (one row per campaign)
- Comparison requires deriving average opens per delivery from campaign aggregates (total_opens / total_deliveries)
- Results must be deduplicated by campaign_id to avoid counting the same campaign multiple times
- Join is on campaign_id, matching detail records to their parent aggregate
- Edge case handling: campaigns with zero deliveries must be excluded from division
"""

customerio_deliveries_exceed_campaign_avg_opens = {
    "description": "Campaigns with deliveries exceeding average open count - tests delivery-to-campaign grain join with derived metric comparison",
    "message": "Find customerio campaigns with deliveries that exceeded the campaign average open count",
    "table_names": [
        "customerio_enriched.int_customerio_engagement_facts",
        "customerio_enriched.int_customerio_campaign_dim",
    ],
    "expected_fields": [
        "campaign_id",
        "campaign_name",
        "open_count",
        "total_opens",
        "total_deliveries",
    ],
    "query_description": """
        * The query should use customerio_enriched.int_customerio_engagement_facts and customerio_enriched.int_customerio_campaign_dim tables
        * The query should join on campaign_id to match delivery-level engagement to campaign-level statistics
        * The query should filter where individual open_count is greater than the campaign's average opens per delivery (total_opens / total_deliveries)
        * The query should exclude campaigns with zero deliveries to avoid division by zero
        * The query should deduplicate by campaign to show each campaign only once (using GROUP BY campaign_id or DISTINCT)
        * The query should include campaign identifier (campaign_id and/or campaign_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT
          cd.campaign_id,
          cd.campaign_name
        FROM
          customerio_enriched.int_customerio_engagement_facts ef
        INNER JOIN
          customerio_enriched.int_customerio_campaign_dim cd
          ON ef.campaign_id = cd.campaign_id
        WHERE
          ef.open_count > (cd.total_opens::numeric / cd.total_deliveries)
          AND cd.total_deliveries > 0;
    """,
}

"""
Why this is a Grain test:
Tests cross-grain comparison between delivery-level engagement and customer-level aggregate statistics.
The agent must recognize:
- Engagement facts are at delivery grain (one row per message delivery) while customer dimension is at customer grain (one row per customer)
- Comparison requires deriving average opens per delivery from customer aggregates (total_opens / total_deliveries)
- Results must be deduplicated by customer_id to avoid listing the same customer multiple times when they have multiple high-engagement deliveries
- Join is on customer_id, matching detail records to their parent customer aggregate
- Edge case handling: customers with zero deliveries must be excluded from division
"""

customerio_customers_with_deliveries_exceeding_avg_opens = {
    "description": "Customers with deliveries exceeding their average open count - tests delivery-to-customer grain join with derived metric comparison",
    "message": "Show me customerio customers who received deliveries with more opens than their personal average",
    "table_names": [
        "customerio_enriched.int_customerio_engagement_facts",
        "customerio_enriched.int_customerio_customer_dim",
    ],
    "expected_fields": [
        "customer_id",
        "email",
        "open_count",
        "total_opens",
        "total_deliveries",
    ],
    "query_description": """
        * The query should use customerio_enriched.int_customerio_engagement_facts and customerio_enriched.int_customerio_customer_dim tables
        * The query should join on customer_id to match delivery-level engagement to customer-level statistics
        * The query should filter where individual open_count is greater than the customer's average opens per delivery (total_opens / total_deliveries)
        * The query should exclude customers with zero deliveries to avoid division by zero
        * The query should deduplicate by customer to show each customer only once (using GROUP BY customer_id or DISTINCT)
        * The query should include customer identifier (customer_id and/or email) in results
    """,
    "reference_query": """
        SELECT DISTINCT
          cd.customer_id,
          cd.email
        FROM
          customerio_enriched.int_customerio_engagement_facts ef
        INNER JOIN
          customerio_enriched.int_customerio_customer_dim cd
          ON ef.customer_id = cd.customer_id
        WHERE
          ef.open_count > (cd.total_opens::numeric / cd.total_deliveries)
          AND cd.total_deliveries > 0;
    """,
}

TEST_SPECS = [
    customerio_deliveries_exceed_campaign_avg_opens,
    customerio_customers_with_deliveries_exceeding_avg_opens,
]
