-- @meta
-- name: Customers who have never placed an order
-- kind: rewrite
-- expected_speedup: ≥2× (modest at hackathon scale; larger on bigger data)
-- requires: -
--
-- Why the slow version is slow
-- ============================
-- `NOT IN (subquery)` materialises the full subquery into a hash before
-- probing. On `orders.customer_id` (NOT NULL) the planner *can* now
-- transform `NOT IN` to an anti-join, but it does so less aggressively
-- than `NOT EXISTS`, especially when the subquery is large relative to the
-- outer table — the materialise-then-probe form still does a full scan +
-- hash build.
--
-- `NOT EXISTS` is the planner's preferred form for anti-semi-join: it can
-- short-circuit per outer row once any match is found.
--
-- ⚠ Equivalence note: this rewrite is only safe because
-- `orders.customer_id` is `NOT NULL`. On a nullable column the two forms
-- behave differently — `NOT IN` returns UNKNOWN (excluded) for non-matching
-- outer rows when the subquery contains any NULL, while `NOT EXISTS` does
-- not. The optimizer should never propose this rewrite without checking
-- the NOT NULL constraint on the referenced column.

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
