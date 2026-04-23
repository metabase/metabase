"""
Why this is an SCD test:
The test highlights temporal mismatch between historical order events and current customer segment state. The agent must recognize:
- Orders are historical events with creation timestamps (order_created_at, order_processed_at)
- Customer segment is current state only (customer may have been 'One-Time Buyer' when placing early orders but is now 'Loyal Customer')
- A proper temporal join would require valid_from/valid_to to match order creation time with customer segment at that time
- Without Type 2 tracking, we can only filter on current customer_segment
- This creates semantic ambiguity: "orders from loyal customers" could mean "orders from customers who are now loyal" OR "orders placed when customers were already loyal"
"""

shopify_orders_from_loyal_customers = {
    "description": "Orders from currently loyal customers - tests temporal join between fact events and dimension current state",
    "message": "Show me shopify orders from loyal customers",
    "table_names": [
        "shopify_enriched.int_shopify_order_facts",
        "shopify_enriched.int_shopify_customer_dim",
    ],
    "expected_fields": [
        "order_id",
        "customer_id",
        "customer_segment",
        "order_created_at",
    ],
    "query_description": """
        * The query should use shopify_enriched.int_shopify_order_facts and shopify_enriched.int_shopify_customer_dim tables
        * The query should join on customer_id between order facts and customer dimension
        * The query should filter where customer_segment = 'Loyal Customer' (case-insensitive matching acceptable)
        * The query may optionally deduplicate by customer_id if showing distinct customers rather than all orders
        * The query should include order identifiers (order_id and/or customer_id) and order temporal fields (order_created_at, order_processed_at, or order_date) in results
    """,
    "reference_query": """
        SELECT
            of.order_id,
            of.customer_id,
            cd.customer_segment,
            of.order_created_at
        FROM shopify_enriched.int_shopify_order_facts of
        JOIN shopify_enriched.int_shopify_customer_dim cd
            ON of.customer_id = cd.customer_id
        WHERE cd.customer_segment = 'Loyal Customer';
    """,
}

"""
Why this is an SCD test:
The test highlights temporal mismatch between historical purchase events and current product lifecycle state. The agent must recognize:
- Order lines are historical purchase events with timestamps (order_created_at) tracking when products were purchased
- Product status is current state only (products transition through draft → active → archived lifecycle)
- A proper temporal join would require valid_from/valid_to to match purchase time with product status at that time
- Without Type 2 tracking, we can only filter on current product_status
- This creates semantic ambiguity: "purchases of archived products" could mean "purchases of products that are now archived" OR "purchases that occurred when products were already archived"
"""

shopify_purchases_of_archived_products = {
    "description": "Order lines for currently archived products - tests temporal join between historical purchase events and current product lifecycle state",
    "message": "Show me shopify order lines for products that are currently archived",
    "table_names": [
        "shopify_enriched.int_shopify_order_line_facts",
        "shopify_enriched.int_shopify_product_dim",
    ],
    "expected_fields": [
        "order_line_id",
        "order_id",
        "product_id",
        "product_title",
        "product_status",
        "order_created_at",
    ],
    "query_description": """
        * The query should use shopify_enriched.int_shopify_order_line_facts and shopify_enriched.int_shopify_product_dim tables
        * The query should join on product_id between order line facts and product dimension
        * The query should filter where product_status = 'archived' (case-insensitive matching acceptable)
        * The query may optionally deduplicate by product_id if showing distinct products rather than all order lines
        * The query should include order line identifiers (order_line_id and/or order_id), product identifiers (product_id, product_name, or product_title), and temporal fields (order_created_at or order_date) in results
    """,
    "reference_query": """
        SELECT
            ol.order_line_id,
            ol.order_id,
            ol.product_id,
            pd.product_title,
            pd.product_status,
            ol.order_created_at
        FROM shopify_enriched.int_shopify_order_line_facts ol
        JOIN shopify_enriched.int_shopify_product_dim pd
            ON ol.product_id = pd.product_id
        WHERE pd.product_status = 'archived'
        ORDER BY ol.order_created_at DESC;
    """,
}

TEST_SPECS = [
    shopify_orders_from_loyal_customers,
    shopify_purchases_of_archived_products,
]
