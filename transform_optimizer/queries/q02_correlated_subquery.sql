-- @meta
-- name: Customer lifetime stats (orders count + lifetime spend)
-- kind: rewrite
-- expected_speedup: ≥100×
-- requires: -
--
-- Why the slow version is slow
-- ============================
-- Three correlated scalar subqueries in the SELECT list. Postgres re-runs each
-- subquery once per outer customer row. With 500k customers and no index on
-- `orders.customer_id`, every subquery does an O(N) scan over 5M orders —
-- O(C × N) total. The optimizer never collapses these into a single pass.
--
-- The fast rewrite aggregates orders ONCE per customer and joins the rollup.
-- Even without an index on orders.customer_id this is a single hash aggregate
-- pass.

-- @slow
SELECT
  c.id,
  c.name,
  c.country,
  (SELECT COUNT(*)
     FROM shop.orders o
     WHERE o.customer_id = c.id)                          AS order_count,
  (SELECT COALESCE(SUM(o.total_cents), 0)
     FROM shop.orders o
     WHERE o.customer_id = c.id
       AND o.status IN ('paid','shipped','delivered'))    AS lifetime_cents,
  (SELECT MAX(o.ordered_at)
     FROM shop.orders o
     WHERE o.customer_id = c.id)                          AS last_order_at
FROM shop.customers c
WHERE c.segment = 'pro';

-- @fast
SELECT
  c.id,
  c.name,
  c.country,
  COALESCE(agg.order_count,    0) AS order_count,
  COALESCE(agg.lifetime_cents, 0) AS lifetime_cents,
  agg.last_order_at
FROM shop.customers c
LEFT JOIN (
  SELECT
    o.customer_id,
    COUNT(*)                                                            AS order_count,
    SUM(CASE WHEN o.status IN ('paid','shipped','delivered')
             THEN o.total_cents ELSE 0 END)                             AS lifetime_cents,
    MAX(o.ordered_at)                                                   AS last_order_at
  FROM shop.orders o
  GROUP BY o.customer_id
) agg ON agg.customer_id = c.id
WHERE c.segment = 'pro';
