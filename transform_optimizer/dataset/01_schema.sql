-- Transform Optimizer — base schema (Postgres).
--
-- Design intent
-- =============
-- This schema models a mid-size e-commerce / SaaS analytics stack at a scale
-- where naive SQL takes multiple seconds on a developer laptop. It is paired
-- with `02_seed.sql` (data) and `03_optimized_indexes.sql` (the indexes some
-- of the optimized queries rely on).
--
-- We deliberately *omit* useful indexes on the base schema:
--   * orders has no index on customer_id or ordered_at
--   * order_items has no index on order_id or product_id
--   * events has no index on customer_id, occurred_at, or type
--   * reviews has no index on product_id, customer_id, or body
--   * products has no index on category_id or supplier_id
-- Foreign keys are kept because we want the introspection layer to be able to
-- read them from pg_constraint, and the LLM prelude assumes FK info is
-- available. Postgres does NOT auto-index the referencing side of an FK, so
-- the indexes-missing-on-the-fact-table story stays intact.
--
-- Target scale (full):
--   customers     500 000
--   suppliers       2 000
--   categories         30
--   products       20 000
--   orders      5 000 000
--   order_items 15 000 000   (≈ 3 items per order)
--   events     30 000 000
--   reviews     2 000 000
-- The seed script honors a scale knob; see its header.

BEGIN;

DROP SCHEMA IF EXISTS shop CASCADE;
CREATE SCHEMA shop;
SET search_path TO shop, public;

-- ----------------------------------------------------------------------------
-- Dimensions
-- ----------------------------------------------------------------------------

CREATE TABLE customers (
  id           BIGINT PRIMARY KEY,
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  country      TEXT NOT NULL,
  segment      TEXT NOT NULL,                              -- free | pro | enterprise
  signed_up_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE suppliers (
  id      BIGINT PRIMARY KEY,
  name    TEXT NOT NULL,
  country TEXT NOT NULL,
  active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE categories (
  id        BIGINT PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id BIGINT REFERENCES categories(id)
);

CREATE TABLE products (
  id          BIGINT PRIMARY KEY,
  name        TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id),
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  price_cents BIGINT NOT NULL,
  cost_cents  BIGINT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- Facts
-- ----------------------------------------------------------------------------

CREATE TABLE orders (
  id            BIGINT PRIMARY KEY,
  customer_id   BIGINT NOT NULL REFERENCES customers(id),
  ordered_at    TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL,                             -- placed | paid | shipped | delivered | cancelled | refunded
  total_cents   BIGINT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  shipping_country TEXT NOT NULL
);

CREATE TABLE order_items (
  id              BIGINT PRIMARY KEY,
  order_id        BIGINT NOT NULL REFERENCES orders(id),
  product_id      BIGINT NOT NULL REFERENCES products(id),
  quantity        INT    NOT NULL,
  unit_price_cents BIGINT NOT NULL,
  discount_cents  BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id          BIGINT PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id),             -- nullable: anonymous traffic
  occurred_at TIMESTAMPTZ NOT NULL,
  type        TEXT NOT NULL,                               -- page_view | add_to_cart | checkout_start | purchase | search
  product_id  BIGINT REFERENCES products(id),
  session_id  TEXT NOT NULL,
  url_path    TEXT NOT NULL,
  properties  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE reviews (
  id          BIGINT PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL
);

COMMIT;
