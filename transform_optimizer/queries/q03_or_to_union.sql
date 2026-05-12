-- @meta
-- name: Recent events for either a specific customer OR a specific product
-- kind: rewrite (also benefits from indexes from 03_optimized_indexes.sql)
-- expected_speedup: ≥50× (when complementary indexes exist)
-- requires: idx_events_customer_id_occurred_at, idx_events_occurred_at, (idx on product_id helpful)
--
-- Why the slow version is slow
-- ============================
-- `OR` across columns belonging to different (potential) indexes prevents the
-- planner from using either: a seqscan over 30M events is usually the only
-- plan it can prove correct. Even with both indexes available, the planner
-- often picks a BitmapOr over both — which is fine — but the original is
-- written in a way (with `coalesce(...)` and a date filter buried under OR)
-- that hides the disjunction.
--
-- The fast rewrite splits into a UNION ALL of two single-column-filtered
-- queries, each of which can use its own narrow index. The outer DISTINCT
-- handles overlap (an event matching both filters).

-- @slow
SELECT
  e.id,
  e.customer_id,
  e.product_id,
  e.occurred_at,
  e.type,
  e.url_path
FROM shop.events e
WHERE e.occurred_at >= TIMESTAMPTZ '2025-06-01 00:00:00+00'
  AND e.occurred_at <  TIMESTAMPTZ '2025-07-01 00:00:00+00'
  AND (e.customer_id BETWEEN 1 AND 1000 OR e.product_id BETWEEN 1 AND 100);

-- @fast
SELECT DISTINCT ON (e.id)
  e.id, e.customer_id, e.product_id, e.occurred_at, e.type, e.url_path
FROM (
  SELECT id, customer_id, product_id, occurred_at, type, url_path
  FROM shop.events
  WHERE customer_id BETWEEN 1 AND 1000
    AND occurred_at >= TIMESTAMPTZ '2025-06-01 00:00:00+00'
    AND occurred_at <  TIMESTAMPTZ '2025-07-01 00:00:00+00'
  UNION ALL
  SELECT id, customer_id, product_id, occurred_at, type, url_path
  FROM shop.events
  WHERE product_id BETWEEN 1 AND 100
    AND occurred_at >= TIMESTAMPTZ '2025-06-01 00:00:00+00'
    AND occurred_at <  TIMESTAMPTZ '2025-07-01 00:00:00+00'
) e;
