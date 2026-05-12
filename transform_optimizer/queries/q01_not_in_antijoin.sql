-- @meta
-- name: Customers who never triggered an identified web event
-- kind: rewrite
-- expected_speedup: ≥10×
-- requires: -
--
-- Why the slow version is slow
-- ============================
-- `NOT IN (subquery)` on a **nullable** column is the classic foot-gun.
-- `events.customer_id` is nullable (anonymous traffic). The planner cannot
-- collapse `NOT IN` into an anti-join because the SQL standard says
-- "x NOT IN (set)" returns UNKNOWN when the set contains a NULL — Postgres
-- must check for that case explicitly. The result is a Hashed-SubPlan with
-- an extra null-aware probe per outer row, costing significantly more than
-- a plain anti-join.
--
-- The fast rewrite uses `NOT EXISTS`. Its NULL semantics are different
-- (NULL on the inner side simply fails the WHERE) so the planner can use
-- a proper anti-join.
--
-- We use `events` (not `orders`) here because we declared `orders.customer_id
-- NOT NULL` — without nullable values, both forms produce the same plan and
-- the pathology disappears.

-- @slow
SELECT c.id, c.email, c.name, c.signed_up_at
FROM shop.customers c
WHERE c.id NOT IN (SELECT e.customer_id FROM shop.events e);

-- @fast
SELECT c.id, c.email, c.name, c.signed_up_at
FROM shop.customers c
WHERE NOT EXISTS (
  SELECT 1 FROM shop.events e WHERE e.customer_id = c.id
);
