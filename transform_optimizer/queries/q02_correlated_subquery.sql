-- @meta
-- name: Customer lifetime stats (orders count + lifetime spend), enterprise US
-- kind: rewrite
-- expected_speedup: ≥50×
-- requires: -
--
-- Why the slow version is slow
-- ============================
-- Three correlated scalar subqueries in the SELECT list. Postgres re-runs each
-- subquery once per outer customer row. With no index on `orders.customer_id`
-- each subquery does an O(N) scan over orders — O(C × N) total. The optimizer
-- never collapses these into a single pass.
--
-- We restrict the outer query to enterprise US customers (~200 rows on the
-- current seed) to keep the slow version in the few-seconds range rather
-- than the hours range. The pathology is identical; only the fan-out is
-- bounded.
--
-- The fast rewrite aggregates orders ONCE per customer and joins the rollup.
-- Even without an index on orders.customer_id this is a single hash-aggregate
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
WHERE c.segment = 'enterprise'
  AND c.country = 'US';

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
WHERE c.segment = 'enterprise'
  AND c.country = 'US';
