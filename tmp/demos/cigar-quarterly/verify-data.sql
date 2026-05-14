-- tmp/demos/cigar-quarterly/verify-data.sql
\echo 'Row counts:'
SELECT 'skus' AS t, count(*) FROM skus
UNION ALL SELECT 'distributors', count(*) FROM distributors
UNION ALL SELECT 'shipments', count(*) FROM shipments;

\echo ''
\echo 'NJ Q4 revenue share by distributor (target: Big Sal in [79, 85]):'
WITH nj_q4 AS (
  SELECT s.distributor_id, d.nickname, s.revenue_usd
  FROM shipments s
  JOIN distributors d ON d.id = s.distributor_id
  WHERE s.region = 'NJ'
    AND s.ship_date BETWEEN DATE '2026-01-01' AND DATE '2026-03-31'
)
SELECT
  nickname,
  sum(revenue_usd) AS revenue,
  round(100.0 * sum(revenue_usd) / sum(sum(revenue_usd)) OVER (), 1) AS pct
FROM nj_q4
GROUP BY nickname
ORDER BY revenue DESC;

\echo ''
\echo 'Quick regional totals (Q4):'
SELECT region, sum(revenue_usd)::int AS q4_revenue
FROM shipments
WHERE ship_date BETWEEN DATE '2026-01-01' AND DATE '2026-03-31'
GROUP BY region
ORDER BY q4_revenue DESC;
