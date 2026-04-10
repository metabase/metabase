"""
Why this is a Multi-Hop Join test:
This test highlights DAG navigation across both enriched and raw dbt layers requiring a 5-hop join path. The agent must recognize:
- Refunds fact must join to subscriptions fact via customer_id (hop 1)
- Subscriptions must join to raw subscription_item table via subscription_id (hop 2)
- Subscription items link to raw plan table via plan_id (hop 3)
- Plans link to enriched products dimension via product_id (hop 4)
- The filtering criterion (avg_plan_price > 200) exists only in the products dimension, requiring full path traversal
- The query requires mixing enriched intermediate models (int_) with raw staging tables (stripe_data)
"""

stripe_refunds_from_high_value_product_subscriptions = {
    "description": "Refunds from customers with high-value product subscriptions - tests multi-hop DAG navigation across enriched and raw layers",
    "message": "Show me stripe refunds from customers who have subscriptions to products with average plan price over $200",
    "table_names": [
        "stripe_enriched.int_stripe_refund_fact",
        "stripe_enriched.int_stripe_subscription_events_fact",
        "stripe_data.subscription_item",
        "stripe_data.plan",
        "stripe_enriched.int_stripe_products_dim",
    ],
    "expected_fields": [
        "refund_id",
        "customer_id",
        "customer_email",
        "refund_amount",
        "refund_date",
        "subscription_id",
        "plan_id",
        "product_id",
        "product_name",
        "avg_plan_price",
    ],
    "query_description": """
        * The query should use stripe_enriched.int_stripe_refund_fact as the starting point
        * The query should join to stripe_enriched.int_stripe_subscription_events_fact on customer_id
        * The query should join to stripe_data.subscription_item on subscription_id
        * The query should join to stripe_data.plan on plan_id (matching subscription_item.plan_id to plan.id)
        * The query should join to stripe_enriched.int_stripe_products_dim on product_id (matching plan.product_id to products_dim.product_id)
        * The query should filter where avg_plan_price > 200
        * The query should filter out soft-deleted records from subscription_item and plan tables (where _fivetran_deleted = false or IS NULL)
        * The query may optionally deduplicate by refund_id if multiple subscriptions per customer exist
        * The query should include refund identifiers (refund_id and/or customer_id) and product identifiers (product_id and/or product_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT rf.refund_id
        FROM stripe_enriched.int_stripe_refund_fact rf
        JOIN stripe_enriched.int_stripe_subscription_events_fact sef
          ON rf.customer_id = sef.customer_id
        JOIN stripe_data.subscription_item si
          ON sef.subscription_id = si.subscription_id
          AND (si._fivetran_deleted = false OR si._fivetran_deleted IS NULL)
        JOIN stripe_data.plan p
          ON si.plan_id = p.id
          AND (p._fivetran_deleted = false OR p._fivetran_deleted IS NULL)
        JOIN stripe_enriched.int_stripe_products_dim pd
          ON p.product_id = pd.product_id
        WHERE pd.avg_plan_price > 200;
    """,
}

"""
Why this is a Multi-Hop Join test:
This test validates DAG navigation through a 6-hop join path entirely within raw Stripe tables. The agent must recognize:
- Payment intents must join to customers via customer_id (hop 1)
- Customers must join to subscriptions via customer_id (hop 2)
- Subscriptions must join to subscription_item via subscription_id (hop 3)
- Subscription items link to plan via plan_id (hop 4)
- Plans link to product via product_id (hop 5)
- The filtering criteria (payment intent status = 'failed' AND product name matching) require traversing the entire join path to connect payment failures with product tier information
"""
stripe_failed_payment_intents_for_enterprise_subscriptions = {
    "description": "Failed payment intents for enterprise-tier subscriptions - tests 6-hop join path through raw Stripe tables",
    "message": "What stripe payment intents failed for customers with Enterprise or Professional product subscriptions?",
    "table_names": [
        "stripe_data.payment_intent",
        "stripe_data.customer",
        "stripe_data.subscription",
        "stripe_data.subscription_item",
        "stripe_data.plan",
        "stripe_data.product",
    ],
    "expected_fields": [
        "id",
        "customer_id",
        "email",
        "amount",
        "status",
        "subscription_id",
        "plan_id",
        "product_id",
        "product_name",
    ],
    "query_description": """
        * The query should use stripe_data.payment_intent as the starting point
        * The query should join to stripe_data.customer on customer_id (matching payment_intent.customer_id to customer.id)
        * The query should join to stripe_data.subscription on customer_id (matching customer.id to subscription.customer_id)
        * The query should join to stripe_data.subscription_item on subscription_id (matching subscription.id to subscription_item.subscription_id)
        * The query should join to stripe_data.plan on plan_id (matching subscription_item.plan_id to plan.id)
        * The query should join to stripe_data.product on product_id (matching plan.product_id to product.id)
        * The query should filter where payment_intent.status = 'failed'
        * The query should filter where product.name IN ('Enterprise Plan', 'Professional Plan')
        * The query should filter out soft-deleted records from all tables (where _fivetran_deleted = false or IS NULL)
        * The query may optionally deduplicate by payment_intent.id if a customer has multiple subscriptions to qualifying products
        * The query should include payment intent identifiers (id and/or customer_id) and product identifiers (product_id and/or product_name) in results
    """,
    "reference_query": """
        SELECT DISTINCT pi.id
        FROM stripe_data.payment_intent pi
        JOIN stripe_data.customer c
            ON pi.customer_id = c.id
            AND (c._fivetran_deleted = false OR c._fivetran_deleted IS NULL)
        JOIN stripe_data.subscription s
            ON c.id = s.customer_id
            AND (s._fivetran_deleted = false OR s._fivetran_deleted IS NULL)
        JOIN stripe_data.subscription_item si
            ON s.id = si.subscription_id
            AND (si._fivetran_deleted = false OR si._fivetran_deleted IS NULL)
        JOIN stripe_data.plan p
            ON si.plan_id = p.id
            AND (p._fivetran_deleted = false OR p._fivetran_deleted IS NULL)
        JOIN stripe_data.product pr
            ON p.product_id = pr.id
            AND (pr._fivetran_deleted = false OR pr._fivetran_deleted IS NULL)
        WHERE pi.status = 'failed'
            AND pr.name IN ('Enterprise Plan', 'Professional Plan')
            AND (pi._fivetran_deleted = false OR pi._fivetran_deleted IS NULL);
    """,
}

TEST_SPECS = [
    stripe_refunds_from_high_value_product_subscriptions,
    stripe_failed_payment_intents_for_enterprise_subscriptions,
]
