"""
Why this is a Multi-Hop Join test:
This test validates DAG navigation through a 3-hop join path mixing enriched and raw Customer.io tables. The agent must recognize:
- Unsubscribe facts must join to raw deliveries table via delivery_id to access newsletter_id (hop 1)
- Raw deliveries must join to raw newsletter table via newsletter_id to filter by newsletter name (hop 2)
- Unsubscribe facts must join to enriched customer dimension via customer_id to access engagement_level (hop 3)
- The filtering criteria (newsletter name = 'Product Updates' from raw newsletter table AND engagement_level = 'Moderately Engaged' from customer dimension) require full path traversal
- The query requires mixing enriched intermediate models (int_customerio_unsubscribe_facts, int_customerio_customer_dim) with raw staging tables (customerio_data.deliveries, customerio_data.newsletter)
- Proper handling of soft-deleted records in the raw deliveries and newsletter tables
"""

customerio_unsubscribes_from_engaged_customers_newsletter = {
    "description": "Unsubscribes from moderately engaged customers who received Product Updates newsletter - tests 3-hop DAG navigation across enriched and raw Customer.io layers",
    "message": "Show me customerio unsubscribes from moderately engaged customers who received Product Updates newsletters",
    "table_names": [
        "customerio_enriched.int_customerio_unsubscribe_facts",
        "customerio_data.deliveries",
        "customerio_data.newsletter",
        "customerio_enriched.int_customerio_customer_dim",
    ],
    "expected_fields": [
        "delivery_id",
        "customer_id",
        "email",
        "unsubscribe_timestamp",
        "newsletter_id",
        "newsletter_name",
        "engagement_level",
    ],
    "query_description": """
        * The query should use customerio_enriched.int_customerio_unsubscribe_facts as the starting point
        * The query should join to customerio_data.deliveries on delivery_id (matching unsubscribe_facts.delivery_id to deliveries.delivery_id)
        * The query should join to customerio_data.newsletter on newsletter_id (matching deliveries.newsletter_id to newsletter.id)
        * The query should join to customerio_enriched.int_customerio_customer_dim on customer_id (matching unsubscribe_facts.customer_id to customer_dim.customer_id)
        * The query should filter where newsletter.name = 'Product Updates'
        * The query should filter where customer_dim.engagement_level = 'Moderately Engaged'
        * The query should filter out soft-deleted records from the deliveries and newsletter tables (where _fivetran_deleted = false or IS NULL)
        * The query may optionally deduplicate by delivery_id if needed
        * The query should include unsubscribe identifiers (delivery_id and/or customer_id) and newsletter identifiers (newsletter_id and/or newsletter_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT
            u.delivery_id,
            u.customer_id,
            c.email
        FROM customerio_enriched.int_customerio_unsubscribe_facts u
        JOIN customerio_data.deliveries d ON u.delivery_id = d.delivery_id
            AND d._fivetran_deleted = FALSE
        JOIN customerio_data.newsletter n ON d.newsletter_id = n.id
            AND n._fivetran_deleted = FALSE
        JOIN customerio_enriched.int_customerio_customer_dim c ON u.customer_id = c.customer_id
        WHERE n.name = 'Product Updates'
            AND c.engagement_level = 'Moderately Engaged';
    """,
}

"""
Why this is a Multi-Hop Join test:
This test validates DAG navigation through a 2-hop join path across enriched Customer.io engagement tables. The agent must recognize:
- Click facts must join to delivery facts via delivery_id to access delivery temporal context (hop 1)
- Delivery facts must join to campaign dimension via campaign_id to access campaign performance metrics (hop 2)
- The filtering criteria (click_timing_category from click_facts, delivery_day_of_week from delivery_facts, campaign_type and open_rate from campaign_dim) require full path traversal
- This tests understanding of Customer.io engagement pipeline: individual click events → deliveries → campaigns
- Proper deduplication by delivery_id is required since the focus is on unique deliveries with fast engagement
"""

customerio_fast_clicks_weekend_email_campaigns = {
    "description": "Fast clicks from weekend email campaigns with high open rates - tests 2-hop DAG navigation across Customer.io engagement and campaign layers",
    "message": "Show me clicks within 1 hour from email campaigns with open rates above 40 percent that were delivered on weekends",
    "table_names": [
        "customerio_enriched.int_customerio_click_facts",
        "customerio_enriched.int_customerio_delivery_facts",
        "customerio_enriched.int_customerio_campaign_dim",
    ],
    "expected_fields": [
        "delivery_id",
        "click_timestamp",
        "click_timing_category",
        "delivery_day_of_week",
        "campaign_id",
        "campaign_name",
        "campaign_type",
        "open_rate",
    ],
    "query_description": """
        * The query should use customerio_enriched.int_customerio_click_facts as the starting point
        * The query should join to customerio_enriched.int_customerio_delivery_facts on delivery_id (matching click_facts.delivery_id to delivery_facts.delivery_id)
        * The query should join to customerio_enriched.int_customerio_campaign_dim on campaign_id (matching delivery_facts.campaign_id to campaign_dim.campaign_id)
        * The query should filter where click_timing_category = 'Within 1 Hour'
        * The query should filter where delivery_day_of_week IN (1, 7) for weekends (Sunday = 1, Saturday = 7)
        * The query should filter where campaign_type = 'email'
        * The query should filter where open_rate > 40
        * The query should deduplicate by delivery_id using DISTINCT or GROUP BY to show unique deliveries with fast clicks
        * The query should include delivery identifiers (delivery_id) and campaign information (campaign_id and/or campaign_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT
            cf.delivery_id,
            cf.click_timestamp,
            cd.campaign_name
        FROM customerio_enriched.int_customerio_click_facts cf
        JOIN customerio_enriched.int_customerio_delivery_facts df ON cf.delivery_id = df.delivery_id
        JOIN customerio_enriched.int_customerio_campaign_dim cd ON df.campaign_id = cd.campaign_id
        WHERE cf.click_timing_category = 'Within 1 Hour'
            AND df.delivery_day_of_week IN (1, 7)
            AND cd.campaign_type = 'email'
            AND cd.open_rate > 40
        ORDER BY cf.click_timestamp;
    """,
}

TEST_SPECS = [
    customerio_unsubscribes_from_engaged_customers_newsletter,
    customerio_fast_clicks_weekend_email_campaigns,
]
