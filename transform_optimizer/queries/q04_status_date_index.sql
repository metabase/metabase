-- @meta
-- name: Monthly gross revenue for shipped/delivered orders, last 12 months
-- kind: index
-- expected_speedup: ≥100×
-- requires: idx_orders_status_ordered_at_customer (status, ordered_at, customer_id) INCLUDE (total_cents)
--
-- Why the slow version is slow
-- ============================
-- No index on orders.(status, ordered_at). 5M rows full-scanned every run.
-- The fast version is identical SQL — what changes is the existence of a
-- compound index that lets the planner do an index-only scan over the small
-- (status, ordered_at) prefix that the WHERE clause selects, and pick
-- total_cents straight out of the index payload (`INCLUDE`).
--
-- This pair is the canonical "the LLM should propose CREATE INDEX, not a
-- rewrite" example.

-- @slow
SELECT
  DATE_TRUNC('month', o.ordered_at) AS month,
  COUNT(*)                          AS order_count,
  SUM(o.total_cents)                AS gross_cents
FROM shop.orders o
WHERE o.status IN ('shipped','delivered')
  AND o.ordered_at >= NOW() - INTERVAL '12 months'
GROUP BY 1
ORDER BY 1;

-- @fast
-- Requires: CREATE INDEX idx_orders_status_ordered_at_customer
--           ON shop.orders (status, ordered_at, customer_id) INCLUDE (total_cents);
SELECT
  DATE_TRUNC('month', o.ordered_at) AS month,
  COUNT(*)                          AS order_count,
  SUM(o.total_cents)                AS gross_cents
FROM shop.orders o
WHERE o.status IN ('shipped','delivered')
  AND o.ordered_at >= NOW() - INTERVAL '12 months'
GROUP BY 1
ORDER BY 1;
