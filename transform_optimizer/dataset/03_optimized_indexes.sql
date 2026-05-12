-- Transform Optimizer — indexes used by the *optimized* versions of some
-- query pairs. Run AFTER the base schema + seed; the slow queries should be
-- benchmarked BEFORE this file is applied so the contrast is meaningful.
--
-- Each index notes which qNN pair it supports.

\set ON_ERROR_STOP on

BEGIN;
SET search_path TO shop, public;
SET LOCAL maintenance_work_mem = '1GB';

-- q04: orders by month / status filter
CREATE INDEX IF NOT EXISTS idx_orders_status_ordered_at_customer
  ON orders (status, ordered_at, customer_id) INCLUDE (total_cents);

-- q02, q07: per-customer order rollups
CREATE INDEX IF NOT EXISTS idx_orders_customer_id_ordered_at
  ON orders (customer_id, ordered_at);

-- q06: per-product revenue from order_items
CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON order_items (product_id) INCLUDE (quantity, unit_price_cents, discount_cents);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items (order_id);

-- q06: product join into category
CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON products (category_id);

-- q08: distinct-active-users-per-day style queries over events
CREATE INDEX IF NOT EXISTS idx_events_occurred_at
  ON events (occurred_at);

CREATE INDEX IF NOT EXISTS idx_events_customer_id_occurred_at
  ON events (customer_id, occurred_at)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_type_occurred_at
  ON events (type, occurred_at);

-- q05: trigram search on review bodies
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_reviews_body_trgm
  ON reviews USING gin (body gin_trgm_ops);

COMMIT;

ANALYZE shop.orders;
ANALYZE shop.order_items;
ANALYZE shop.products;
ANALYZE shop.events;
ANALYZE shop.reviews;
