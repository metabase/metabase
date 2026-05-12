-- @meta
-- name: Weekly active customers + product-page views, last 90 days
-- kind: precompute
-- expected_speedup: ≥5× on re-run (rollups are incremental-friendly)
-- requires: idx_events_occurred_at, idx_events_customer_id_occurred_at, idx_events_type_occurred_at
--
-- Why the slow version is slow
-- ============================
-- A single scan over the full events table to compute two unrelated
-- aggregates: weekly distinct customer counts and weekly product-page-view
-- counts. `COUNT(DISTINCT customer_id)` is memory-bound at scale.
--
-- The optimization splits the work into two daily rollups that each
-- aggregate the fact table ONCE on a much smaller surface:
--   1. shop.daily_customer_visits  — distinct (day, customer_id) pairs
--   2. shop.daily_product_page_views — daily count of product page views
-- The weekly final query then joins them by week. Each rollup is small
-- enough to be refreshed incrementally one day at a time.
--
-- We use **two separate rollups** rather than one combined rollup
-- (e.g. with array_agg) because keeping the two aggregates independent
-- avoids the empty-array / NULL edge cases of multi-aggregate rollups
-- and makes equivalence trivially obvious.

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
-- Two precompute transforms (small, daily-grain) + one final weekly join.

-- precompute 1: distinct (day, customer_id) pairs
DROP TABLE IF EXISTS shop.daily_customer_visits;
CREATE TABLE shop.daily_customer_visits AS
SELECT DISTINCT
  DATE_TRUNC('day', e.occurred_at)::DATE AS day,
  e.customer_id
FROM shop.events e
WHERE e.occurred_at >= NOW() - INTERVAL '90 days'
  AND e.customer_id IS NOT NULL;
CREATE INDEX ON shop.daily_customer_visits (day);

-- precompute 2: daily product-page-view counts
DROP TABLE IF EXISTS shop.daily_product_page_views;
CREATE TABLE shop.daily_product_page_views AS
SELECT
  DATE_TRUNC('day', e.occurred_at)::DATE AS day,
  COUNT(*)                               AS view_count
FROM shop.events e
WHERE e.occurred_at >= NOW() - INTERVAL '90 days'
  AND e.type = 'page_view'
  AND e.product_id IS NOT NULL
GROUP BY 1;
CREATE INDEX ON shop.daily_product_page_views (day);

-- final: weekly counts via FULL OUTER JOIN so weeks with only one of the
-- two aggregates (e.g. all-anonymous-traffic week) still appear with 0s.
WITH weekly_customers AS (
  SELECT DATE_TRUNC('week', day)::DATE AS week,
         COUNT(DISTINCT customer_id)   AS active_customers
  FROM shop.daily_customer_visits
  GROUP BY 1
),
weekly_views AS (
  SELECT DATE_TRUNC('week', day)::DATE AS week,
         SUM(view_count)               AS product_page_views
  FROM shop.daily_product_page_views
  GROUP BY 1
)
SELECT
  COALESCE(c.week, v.week)                  AS week,
  COALESCE(c.active_customers, 0)::bigint   AS active_customers,
  COALESCE(v.product_page_views, 0)::bigint AS product_page_views
FROM weekly_customers c
FULL OUTER JOIN weekly_views v ON c.week = v.week
ORDER BY 1;
