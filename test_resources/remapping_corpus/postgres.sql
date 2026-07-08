-- Workspace remapping test corpus: Postgres dialect
--
-- Format: SQL comment preamble followed by query. Separated by blank line + "-- ;;;;".
--
-- Preamble directives:
--   -- remap: <from_schema>.<from_table> <to_schema>.<to_table>
--   -- tags: <comma-separated tags for filtering>
--   -- expect: ok | parse-error
--
-- The test runner parses each entry, applies remappings via sql-tools/replace-names,
-- then verifies no "from" references remain in the output.

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: simple, select
-- expect: ok
SELECT * FROM public.orders

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: simple, select, where
-- expect: ok
SELECT id, total FROM public.orders WHERE created_at > '2024-01-01'

-- ;;;;
-- remap: public.orders temporary.ords
-- remap: public.customers temporary.custs
-- tags: join
-- expect: ok
SELECT o.id, c.name
FROM public.orders o
JOIN public.customers c ON c.id = o.customer_id

-- ;;;;
-- remap: public.orders temporary.ords
-- remap: public.customers temporary.custs
-- tags: join, left-join
-- expect: ok
SELECT o.id, c.name, c.email
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE o.total > 100

-- ;;;;
-- remap: public.orders temporary.ords
-- remap: public.line_items temporary.li
-- tags: join, multiple-joins
-- expect: ok
SELECT o.id, li.product_id, li.quantity
FROM public.orders o
JOIN public.line_items li ON li.order_id = o.id
WHERE o.status = 'completed'

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: subquery
-- expect: ok
SELECT *
FROM public.orders
WHERE customer_id IN (SELECT id FROM public.orders WHERE total > 1000)

-- ;;;;
-- remap: public.orders temporary.ords
-- remap: public.customers temporary.custs
-- tags: subquery, correlated
-- expect: ok
SELECT c.name,
       (SELECT COUNT(*) FROM public.orders o WHERE o.customer_id = c.id) AS order_count
FROM public.customers c

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: cte
-- expect: ok
WITH recent_orders AS (
    SELECT * FROM public.orders WHERE created_at > '2024-01-01'
)
SELECT * FROM recent_orders WHERE total > 50

-- ;;;;
-- remap: public.orders temporary.ords
-- remap: public.customers temporary.custs
-- tags: cte, multiple-ctes
-- expect: ok
WITH
  big_orders AS (
    SELECT * FROM public.orders WHERE total > 500
  ),
  vip_customers AS (
    SELECT DISTINCT customer_id FROM big_orders
  )
SELECT c.name, c.email
FROM public.customers c
JOIN vip_customers v ON v.customer_id = c.id

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: cte, recursive
-- expect: ok
WITH RECURSIVE order_chain AS (
    SELECT id, parent_order_id, total
    FROM public.orders
    WHERE parent_order_id IS NULL
    UNION ALL
    SELECT o.id, o.parent_order_id, o.total
    FROM public.orders o
    JOIN order_chain oc ON oc.id = o.parent_order_id
)
SELECT * FROM order_chain

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: aggregate, group-by
-- expect: ok
SELECT customer_id, COUNT(*) AS cnt, SUM(total) AS revenue
FROM public.orders
GROUP BY customer_id
HAVING SUM(total) > 1000

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: window-function
-- expect: ok
SELECT id, total,
       ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn,
       SUM(total) OVER (PARTITION BY customer_id) AS customer_total
FROM public.orders

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: union
-- expect: ok
SELECT id, total FROM public.orders WHERE status = 'completed'
UNION ALL
SELECT id, total FROM public.orders WHERE status = 'refunded'

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: alias, schema-qualified
-- expect: ok
SELECT o.id AS order_id, o.total AS order_total
FROM public.orders AS o
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: exists
-- expect: ok
SELECT *
FROM public.orders o
WHERE EXISTS (
    SELECT 1 FROM public.orders o2
    WHERE o2.customer_id = o.customer_id
      AND o2.id != o.id
)

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: case-expression
-- expect: ok
SELECT id,
       CASE
           WHEN total > 1000 THEN 'large'
           WHEN total > 100 THEN 'medium'
           ELSE 'small'
       END AS size_category
FROM public.orders

-- ;;;;
-- remap: public.orders temporary.ords
-- remap: public.customers temporary.custs
-- remap: public.products temporary.prods
-- tags: complex, multiple-joins, subquery, aggregate
-- expect: ok
SELECT c.name,
       p.category,
       COUNT(DISTINCT o.id) AS order_count,
       SUM(o.total) AS total_revenue
FROM public.orders o
JOIN public.customers c ON c.id = o.customer_id
JOIN public.products p ON p.id = o.product_id
WHERE o.created_at >= '2024-01-01'
  AND o.status IN ('completed', 'shipped')
  AND c.id IN (SELECT customer_id FROM public.orders GROUP BY customer_id HAVING COUNT(*) > 5)
GROUP BY c.name, p.category
ORDER BY total_revenue DESC
LIMIT 100

-- ;;;;
-- remap: public.events temporary.evts
-- tags: lateral-join, postgres-specific
-- expect: ok
SELECT e.id, latest.*
FROM public.events e,
LATERAL (
    SELECT * FROM public.events e2
    WHERE e2.user_id = e.user_id
    ORDER BY e2.created_at DESC
    LIMIT 3
) latest

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: insert-select
-- expect: ok
INSERT INTO public.orders (customer_id, total, status)
SELECT customer_id, SUM(total), 'merged'
FROM public.orders
WHERE status = 'pending'
GROUP BY customer_id

-- ;;;;
-- remap: public.orders temporary.ords
-- tags: unqualified
-- expect: ok
SELECT * FROM orders WHERE total > 100
