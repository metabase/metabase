-- @meta
-- name: Customers who have never placed an order
-- kind: rewrite
-- expected_speedup: ≥100×
-- requires: -
--
-- Why the slow version is slow
-- ============================
-- `NOT IN (subquery)` on a nullable column forces Postgres to use a
-- Hashed-SubPlan that materializes the entire `orders.customer_id` column
-- (5M rows) — and because the column is nullable, the planner must
-- additionally check for NULLs for every outer row, which prevents the more
-- efficient anti-join plan. The result: ~5M-row hash build for every
-- evaluation, no index help, multiple seconds.
--
-- The fast rewrite uses `NOT EXISTS`, which the planner recognises as an
-- anti-semi-join. With the FK on orders.customer_id and the customers PK,
-- Postgres can choose an anti-join on the smaller side.

-- @slow
SELECT c.id, c.email, c.name, c.signed_up_at
FROM shop.customers c
WHERE c.id NOT IN (SELECT o.customer_id FROM shop.orders o);

-- @fast
SELECT c.id, c.email, c.name, c.signed_up_at
FROM shop.customers c
WHERE NOT EXISTS (
  SELECT 1 FROM shop.orders o WHERE o.customer_id = c.id
);
