-- @meta
-- name: Find reviews mentioning "refund"
-- kind: rewrite+index
-- expected_speedup: ≥100×
-- requires: pg_trgm extension, idx_reviews_body_trgm (GIN on body gin_trgm_ops)
--
-- Why the slow version is slow
-- ============================
-- `ILIKE '%refund%'` cannot use a btree index — it has no left-anchored
-- prefix. With 2M reviews, this is a full seq scan + per-row regex match.
--
-- The fast rewrite is the same SQL but relies on a GIN trigram index. The
-- query *also* normalises the column to lower(body) when comparing, which
-- is the canonical pattern for case-insensitive trigram search (and matches
-- the expression-index variant if the index is created on `lower(body)`).
-- Here we keep the simple ILIKE form because the gin_trgm_ops operator class
-- supports `ILIKE` directly.

-- @slow
SELECT r.id, r.product_id, r.rating, r.created_at, r.body
FROM shop.reviews r
WHERE r.body ILIKE '%refund%'
ORDER BY r.created_at DESC
LIMIT 100;

-- @fast
-- Requires:
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE INDEX idx_reviews_body_trgm
--     ON shop.reviews USING gin (body gin_trgm_ops);
SELECT r.id, r.product_id, r.rating, r.created_at, r.body
FROM shop.reviews r
WHERE r.body ILIKE '%refund%'
ORDER BY r.created_at DESC
LIMIT 100;
