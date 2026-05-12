-- @meta
-- name: Weekly active customers + product-page views, last 90 days
-- kind: precompute
-- expected_speedup: ≥100× on re-run (rollup is incremental-friendly)
-- requires: idx_events_occurred_at, idx_events_customer_id_occurred_at, idx_events_type_occurred_at
--
-- Why the slow version is slow
-- ============================
-- 30M events. The slow query scans the entire `events` table to compute
-- COUNT(DISTINCT customer_id) per week — DISTINCT over a 30M-row stream
-- is memory- and CPU-bound regardless of index. It also re-computes
-- everything every run, including weeks that have not changed.
--
-- The optimization splits the work into:
--   1. shop.daily_event_rollup — a small daily rollup with COUNT(*) per
--      (day, type) and an array_agg of distinct customer_ids per day (or
--      a hyperloglog sketch via the `hll` extension if available). For
--      the hackathon we keep it simple: a daily DISTINCT customer set.
--   2. shop.weekly_active_customers — derives weekly uniques from (1).
--
-- The daily rollup is small enough to be incrementally refreshed (one day
-- at a time) by an incremental transform — but even as a full transform,
-- it shrinks the working set by ~100×.

-- @slow
SELECT
  DATE_TRUNC('week', e.occurred_at)::DATE AS week,
  COUNT(DISTINCT e.customer_id)
    FILTER (WHERE e.customer_id IS NOT NULL)   AS active_customers,
  COUNT(*) FILTER (WHERE e.type = 'page_view'
                     AND e.product_id IS NOT NULL) AS product_page_views
FROM shop.events e
WHERE e.occurred_at >= NOW() - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1;

-- @fast
-- Two transforms.

-- transform: shop.daily_event_rollup (precompute, ~90 rows for 90 days)
DROP TABLE IF EXISTS shop.daily_event_rollup;
CREATE TABLE shop.daily_event_rollup AS
SELECT
  DATE_TRUNC('day', e.occurred_at)::DATE                                AS day,
  ARRAY_AGG(DISTINCT e.customer_id)
    FILTER (WHERE e.customer_id IS NOT NULL)                            AS active_customer_ids,
  COUNT(*) FILTER (WHERE e.type = 'page_view'
                     AND e.product_id IS NOT NULL)                      AS product_page_views
FROM shop.events e
WHERE e.occurred_at >= NOW() - INTERVAL '90 days'
GROUP BY 1;
CREATE INDEX ON shop.daily_event_rollup (day);

-- transform: shop.weekly_active_customers (final — depends on the rollup)
SELECT
  DATE_TRUNC('week', d.day)::DATE                AS week,
  COUNT(DISTINCT cid)                            AS active_customers,
  SUM(d.product_page_views)                      AS product_page_views
FROM shop.daily_event_rollup d
LEFT JOIN LATERAL UNNEST(d.active_customer_ids) AS cid ON TRUE
GROUP BY 1
ORDER BY 1;
