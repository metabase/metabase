-- @meta
-- name: Monthly cohort retention by signup month
-- kind: precompute
-- expected_speedup: ≥10× per run; much more on re-runs (rollup tables are reusable)
-- requires: idx_orders_customer_id_ordered_at
--
-- Why the slow version is slow
-- ============================
-- The monolithic query scans `orders` *twice* (once to find each customer's
-- first purchase month, once to find their activity per month) and then
-- joins them and does a COUNT(DISTINCT customer_id) per (cohort_month,
-- activity_month) bucket. On 5M orders this is expensive both in CPU and
-- in memory (the join builds a fat intermediate result).
--
-- The optimization splits this into two precomputation transforms that each
-- aggregate the fact table ONCE, plus a small final join:
--
--   1. shop.customer_first_purchase  — one row per customer with their
--      first paid/shipped/delivered month. (≤ 500k rows.)
--   2. shop.customer_monthly_activity — one row per (customer, activity
--      month) the customer ordered in. (≤ a few million, much smaller than
--      orders × repeated work.)
--   3. final cohort retention query — joins (1) and (2) on customer_id,
--      groups, counts distinct customers.
--
-- The retention transform now reads from compact rollups — fast even on
-- re-runs and cacheable for other dashboards.

-- @slow
WITH cohort AS (
  SELECT
    o.customer_id,
    DATE_TRUNC('month', MIN(o.ordered_at)) AS cohort_month
  FROM shop.orders o
  WHERE o.status IN ('paid','shipped','delivered')
  GROUP BY o.customer_id
),
activity AS (
  SELECT
    o.customer_id,
    DATE_TRUNC('month', o.ordered_at) AS activity_month
  FROM shop.orders o
  WHERE o.status IN ('paid','shipped','delivered')
)
SELECT
  c.cohort_month,
  a.activity_month,
  COUNT(DISTINCT a.customer_id)                                           AS active_customers,
  EXTRACT(YEAR  FROM AGE(a.activity_month, c.cohort_month)) * 12
    + EXTRACT(MONTH FROM AGE(a.activity_month, c.cohort_month))::INT      AS months_since_signup
FROM cohort c
JOIN activity a ON a.customer_id = c.customer_id
GROUP BY c.cohort_month, a.activity_month
ORDER BY c.cohort_month, a.activity_month;

-- @fast
-- Proposal is a DAG of three transforms. Below are the SQL bodies; the
-- optimizer would emit them as separate transform definitions with the
-- dependency edges (final depends on the two rollups).

-- transform: shop.customer_first_purchase  (precompute, ≤500k rows)
DROP TABLE IF EXISTS shop.customer_first_purchase;
CREATE TABLE shop.customer_first_purchase AS
SELECT
  o.customer_id,
  DATE_TRUNC('month', MIN(o.ordered_at))::DATE AS cohort_month
FROM shop.orders o
WHERE o.status IN ('paid','shipped','delivered')
GROUP BY o.customer_id;
CREATE INDEX ON shop.customer_first_purchase (customer_id);

-- transform: shop.customer_monthly_activity  (precompute, a few million rows)
DROP TABLE IF EXISTS shop.customer_monthly_activity;
CREATE TABLE shop.customer_monthly_activity AS
SELECT DISTINCT
  o.customer_id,
  DATE_TRUNC('month', o.ordered_at)::DATE AS activity_month
FROM shop.orders o
WHERE o.status IN ('paid','shipped','delivered');
CREATE INDEX ON shop.customer_monthly_activity (customer_id);

-- transform: shop.cohort_retention  (final — depends on the two above)
SELECT
  c.cohort_month,
  a.activity_month,
  COUNT(*)                                                                AS active_customers,
  ((EXTRACT(YEAR FROM AGE(a.activity_month, c.cohort_month))::INT) * 12
    + EXTRACT(MONTH FROM AGE(a.activity_month, c.cohort_month))::INT)     AS months_since_signup
FROM shop.customer_first_purchase   c
JOIN shop.customer_monthly_activity a ON a.customer_id = c.customer_id
GROUP BY c.cohort_month, a.activity_month
ORDER BY c.cohort_month, a.activity_month;
