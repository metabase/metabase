"""
Why this is a Multi-Hop Join test:
This test validates DAG navigation through a 4-hop join path mixing enriched and raw Shopify tables. The agent must recognize:
- Refund facts must join to raw order_line table via order_id to access variant-level detail (hop 1)
- Raw order_line must join to enriched product_variant_dim via variant_id (hop 2)
- Product variant dim must join to product dim via product_id (hop 3)
- The filtering criteria (stock_level = 'Low Stock' from variant dim AND is_active = true from product dim) require full path traversal
- The query requires mixing enriched intermediate models (int_shopify_refund_facts, int_shopify_product_variant_dim, int_shopify_product_dim) with raw staging tables (shopify_data.order_line)
- Proper handling of soft-deleted records in the raw order_line table
"""

shopify_refunds_for_low_stock_active_products = {
    "description": "Refunds for orders with low-stock variants from active products - tests 4-hop DAG navigation across enriched and raw Shopify layers",
    "message": "Show me shopify refunds for orders that included low stock variants from active products",
    "table_names": [
        "shopify_enriched.int_shopify_refund_facts",
        "shopify_data.order_line",
        "shopify_enriched.int_shopify_product_variant_dim",
        "shopify_enriched.int_shopify_product_dim",
    ],
    "expected_fields": [
        "refund_id",
        "order_id",
        "customer_id",
        "customer_email",
        "total_refund_amount",
        "refund_date",
        "order_line_id",
        "variant_id",
        "variant_title",
        "stock_level",
        "product_id",
        "product_title",
        "vendor",
        "is_active",
    ],
    "query_description": """
        * The query should use shopify_enriched.int_shopify_refund_facts as the starting point
        * The query should join to shopify_data.order_line on order_id (matching refund_facts.order_id to order_line.order_id)
        * The query should join to shopify_enriched.int_shopify_product_variant_dim on variant_id (matching order_line.variant_id to product_variant_dim.variant_id)
        * The query should join to shopify_enriched.int_shopify_product_dim on product_id (matching product_variant_dim.product_id to product_dim.product_id)
        * The query should filter where stock_level = 'Low Stock'
        * The query should filter where is_active = true
        * The query should filter out soft-deleted records from the order_line table (where _fivetran_deleted = false or IS NULL)
        * The query may optionally deduplicate by refund_id if multiple order lines per refund exist
        * The query should include refund identifiers (refund_id and/or order_id) and product identifiers (product_id and/or product_title, variant_id and/or variant_title) in results
    """,
    "reference_query": """
        SELECT DISTINCT rf.refund_id
        FROM shopify_enriched.int_shopify_refund_facts rf
        JOIN shopify_data.order_line ol ON rf.order_id = ol.order_id
        JOIN shopify_enriched.int_shopify_product_variant_dim pvd ON ol.variant_id = pvd.variant_id
        JOIN shopify_enriched.int_shopify_product_dim pd ON pvd.product_id = pd.product_id
        WHERE pvd.stock_level = 'Low Stock'
            AND pd.is_active = true
            AND (ol._fivetran_deleted = false OR ol._fivetran_deleted IS NULL);
    """,
}

"""
Why this is a Multi-Hop Join test:
This test validates DAG navigation through a 3-hop join path across enriched Shopify tables. The agent must recognize:
- Fulfillment facts must join to order facts via order_id (hop 1)
- Order facts must join to customer dimension via customer_id (hop 2)
- The filtering criteria (fulfillment_status = 'error' from fulfillment facts AND customer_segment = 'Loyal Customer' from customer dim) require full path traversal
- The query requires navigating through the order facts intermediate layer even though fulfillment_facts contains customer_id directly, testing proper DAG path selection
- Proper understanding that customer_segment is a derived field in the customer dimension, not available in the raw or facts tables
"""
shopify_failed_fulfillments_for_loyal_customers = {
    "description": "Failed fulfillments for loyal customer segment - tests 3-hop DAG navigation across enriched Shopify tables",
    "message": "Show me shopify error fulfillments for Loyal customers",
    "table_names": [
        "shopify_enriched.int_shopify_fulfillment_facts",
        "shopify_enriched.int_shopify_order_facts",
        "shopify_enriched.int_shopify_customer_dim",
    ],
    "expected_fields": [
        "fulfillment_id",
        "order_id",
        "customer_id",
        "customer_email",
        "fulfillment_status",
        "fulfillment_created_at",
        "days_to_fulfill",
        "customer_segment",
        "lifetime_value",
        "lifetime_orders",
    ],
    "query_description": """
        * The query should use shopify_enriched.int_shopify_fulfillment_facts as the starting point
        * The query should join to shopify_enriched.int_shopify_order_facts on order_id (matching fulfillment_facts.order_id to order_facts.order_id)
        * The query should join to shopify_enriched.int_shopify_customer_dim on customer_id (matching order_facts.customer_id to customer_dim.customer_id)
        * The query should filter where fulfillment_status = 'error'
        * The query should filter where customer_segment = 'Loyal Customer'
        * The query may optionally deduplicate by fulfillment_id if needed
        * The query should include fulfillment identifiers (fulfillment_id and/or order_id) and customer identifiers (customer_id and/or customer_email) in results
    """,
    "reference_query": """
        SELECT DISTINCT ff.fulfillment_id
        FROM shopify_enriched.int_shopify_fulfillment_facts ff
        JOIN shopify_enriched.int_shopify_order_facts of ON ff.order_id = of.order_id
        JOIN shopify_enriched.int_shopify_customer_dim cd ON of.customer_id = cd.customer_id
        WHERE ff.fulfillment_status = 'error'
            AND cd.customer_segment = 'Loyal Customer';
    """,
}

TEST_SPECS = [
    shopify_refunds_for_low_stock_active_products,
    shopify_failed_fulfillments_for_loyal_customers,
]
