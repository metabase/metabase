-- @meta
-- name: Top 5 products by gross revenue per category
-- kind: rewrite+index
-- expected_speedup: ≥50×
-- requires: idx_order_items_product_id (INCLUDE quantity, unit_price_cents, discount_cents),
--           idx_products_category_id
--
-- Why the slow version is slow
-- ============================
-- The slow form materialises *every* product's revenue via a 15M-row scan of
-- order_items joined to 20k products, then ranks every product within its
-- category via `ROW_NUMBER()`. We pay for sorting all 20k products even
-- though we only want 5 per category × 30 categories = 150 rows.
--
-- The fast rewrite (a) builds a small per-product revenue rollup that
-- benefits from idx_order_items_product_id, and (b) replaces the window
-- function with a LATERAL subquery that asks for "top 5 by revenue within
-- this category" — Postgres can stop early per category thanks to the
-- supporting index on products.category_id.

-- @slow
SELECT category_id, product_id, name, gross_cents
FROM (
  SELECT
    p.category_id,
    p.id   AS product_id,
    p.name,
    SUM((oi.quantity * oi.unit_price_cents) - oi.discount_cents) AS gross_cents,
    ROW_NUMBER() OVER (
      PARTITION BY p.category_id
      ORDER BY SUM((oi.quantity * oi.unit_price_cents) - oi.discount_cents) DESC
    ) AS rn
  FROM shop.products p
  JOIN shop.order_items oi ON oi.product_id = p.id
  GROUP BY p.category_id, p.id, p.name
) ranked
WHERE rn <= 5
ORDER BY category_id, gross_cents DESC;

-- @fast
-- Requires:
--   CREATE INDEX idx_order_items_product_id
--     ON shop.order_items (product_id)
--     INCLUDE (quantity, unit_price_cents, discount_cents);
--   CREATE INDEX idx_products_category_id ON shop.products (category_id);
WITH product_revenue AS (
  SELECT
    oi.product_id,
    SUM((oi.quantity * oi.unit_price_cents) - oi.discount_cents) AS gross_cents
  FROM shop.order_items oi
  GROUP BY oi.product_id
)
SELECT c.id AS category_id, top.product_id, p.name, top.gross_cents
FROM shop.categories c
CROSS JOIN LATERAL (
  SELECT pr.product_id, pr.gross_cents
  FROM product_revenue pr
  JOIN shop.products p2 ON p2.id = pr.product_id
  WHERE p2.category_id = c.id
  ORDER BY pr.gross_cents DESC
  LIMIT 5
) top
JOIN shop.products p ON p.id = top.product_id
ORDER BY c.id, top.gross_cents DESC;
