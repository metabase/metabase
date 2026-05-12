-- Transform Optimizer — seed data.
--
-- Loads roughly:
--   customers       50 000   suppliers   2 000   categories      30
--   products        10 000   orders    300 000   order_items ≈ 900 000
--   events       1 000 000   reviews    150 000
--
-- Sizing rationale
-- ================
-- The dataset is sized so each un-optimized slow query lands in the 0.5–3 s
-- range and the optimized versions stay well below 100 ms — a clean
-- 10×–500× ratio that demonstrates the optimisation without making the run
-- painful. Full developer-laptop run (seed → all 8 pairs → indexes → fast
-- pairs → compare) finishes in about a minute.
--
-- The biggest constraint is q01 (NOT IN antijoin) and q02 (three correlated
-- subqueries). Both need their hash subplans to fit in `work_mem`; without
-- that Postgres falls back to per-row re-scans and the slow versions go
-- from seconds to many minutes. The harness already sets
-- `work_mem=128MB` on its connection — keep that or scale the dataset
-- down further.
--
-- If you want a bigger dataset for stress-testing, multiply the
-- generate_series stop values below — but expect q01/q02 to be the
-- bottleneck.
--
-- Generation strategy
-- ===================
-- We use `generate_series` + `INSERT INTO … SELECT` for fast bulk loading.
-- Randomness is derived deterministically from row indices (`(i * P) % M`)
-- so reruns produce stable data. We tag a small fraction of `reviews.body`
-- with hot keywords so the trigram-search example has a believable selectivity.
-- After loading, ANALYZE all tables — the optimizer (and our EXPLAIN output)
-- relies on accurate statistics.

\set ON_ERROR_STOP on

BEGIN;
SET search_path TO shop, public;
SET LOCAL synchronous_commit = OFF;        -- big speedup on bulk loads, safe within tx
SET LOCAL work_mem = '256MB';
SET LOCAL maintenance_work_mem = '512MB';

-- ----------------------------------------------------------------------------
-- Reference dimensions (tiny)
-- ----------------------------------------------------------------------------

INSERT INTO suppliers (id, name, country, active)
SELECT
  i,
  'Supplier ' || i,
  (ARRAY['US','UK','DE','FR','IT','ES','BR','JP','CA','AU','NL','SE','PL','MX','IN'])[1 + (i % 15)],
  (i % 50) <> 0                                       -- ~2% inactive
FROM generate_series(1, 2000) AS i;

INSERT INTO categories (id, name, parent_id)
SELECT
  i,
  'Category ' || i,
  CASE WHEN i <= 5 THEN NULL ELSE 1 + ((i * 7) % 5) END
FROM generate_series(1, 30) AS i;

INSERT INTO customers (id, email, name, country, segment, signed_up_at)
SELECT
  i,
  'user' || i || '@example.com',
  'Customer ' || i,
  (ARRAY['US','UK','DE','FR','IT','ES','BR','JP','CA','AU','NL','SE','PL','MX','IN'])[1 + (i % 15)],
  CASE
    WHEN (i % 100) < 80 THEN 'free'
    WHEN (i % 100) < 97 THEN 'pro'
    ELSE 'enterprise'
  END,
  TIMESTAMPTZ '2021-01-01 00:00:00+00'
    + (((i * 1009) % (365 * 4 * 24 * 60)) || ' minutes')::interval
FROM generate_series(1, 50000) AS i;

INSERT INTO products (id, name, category_id, supplier_id, price_cents, cost_cents, active, description)
SELECT
  i,
  'Product ' || i,
  1 + ((i * 13) % 30),
  1 + ((i * 17) % 2000),
  500 + ((i * 31) % 50000),                            -- $5 — $505
  200 + ((i * 23) % 20000),                            -- cost < price on average
  (i % 25) <> 0,                                       -- ~4% inactive
  CASE (i % 7)
    WHEN 0 THEN 'A sturdy, well-reviewed product. Customers report fast delivery.'
    WHEN 1 THEN 'Best seller. Often discounted in seasonal promotions.'
    WHEN 2 THEN 'Premium tier. Includes a 2-year warranty.'
    WHEN 3 THEN 'Replacement part. Compatible with most models.'
    WHEN 4 THEN 'Refurbished unit. Tested and certified.'
    WHEN 5 THEN 'Out of stock in some regions. Refunds available.'
    ELSE        'New arrival. Limited initial inventory.'
  END
FROM generate_series(1, 10000) AS i;

-- ----------------------------------------------------------------------------
-- Orders (300k)
--
-- We bias `ordered_at` slightly toward recent dates and `customer_id` so that
-- a handful of customers are heavy buyers (zipf-ish).
-- ----------------------------------------------------------------------------

INSERT INTO orders (id, customer_id, ordered_at, status, total_cents, currency, shipping_country)
SELECT
  i,
  -- skew: 70% of orders go to the first 10k customers
  CASE WHEN (i % 10) < 7
       THEN 1 + ((i * 2654435761) % 10000)
       ELSE 1 + ((i * 2654435761) % 50000)
  END,
  TIMESTAMPTZ '2022-01-01 00:00:00+00'
    + ((((i::bigint * 1019) + ((i * 7) % 9973)) % (365 * 3 * 24 * 60)) || ' minutes')::interval,
  (ARRAY['placed','paid','paid','paid','shipped','shipped','delivered','delivered','delivered','cancelled','refunded'])[1 + (i % 11)],
  500 + ((i * 97) % 80000),                            -- $5 — $805
  (ARRAY['USD','USD','USD','EUR','GBP','BRL','JPY'])[1 + (i % 7)],
  (ARRAY['US','UK','DE','FR','IT','ES','BR','JP','CA','AU','NL','SE','PL','MX','IN'])[1 + ((i * 11) % 15)]
FROM generate_series(1, 300000) AS i;

-- ----------------------------------------------------------------------------
-- Order items (≈ 900k)
--
-- 1–5 items per order, deterministic. We use a row_number() global counter to
-- assign primary keys.
-- ----------------------------------------------------------------------------

INSERT INTO order_items (id, order_id, product_id, quantity, unit_price_cents, discount_cents)
SELECT
  row_number() OVER (),
  o.id,
  1 + ((o.id * 7 + g) % 10000),
  1 + ((g * 13 + o.id) % 5),
  100 + ((o.id * 31 + g) % 10000),
  CASE WHEN ((o.id + g) % 12) = 0 THEN ((g * 17) % 2000) ELSE 0 END
FROM orders o,
     LATERAL generate_series(1, 1 + (o.id % 5)) AS g;

-- ----------------------------------------------------------------------------
-- Events (1M)
--
-- Mostly anonymous page_views; ~15% authenticated; ~3% purchases.
-- ----------------------------------------------------------------------------

INSERT INTO events (id, customer_id, occurred_at, type, product_id, session_id, url_path, properties)
SELECT
  i,
  CASE WHEN (i % 100) < 15
       THEN 1 + ((i * 2654435761) % 50000)
       ELSE NULL
  END,
  TIMESTAMPTZ '2023-01-01 00:00:00+00'
    + (((i * 31) % (365 * 2 * 24 * 60 * 60)) || ' seconds')::interval,
  (ARRAY['page_view','page_view','page_view','page_view','page_view','page_view','page_view',
         'search','search','add_to_cart','add_to_cart','checkout_start','purchase'])[1 + (i % 13)],
  CASE WHEN (i % 5) = 0 THEN 1 + ((i * 7) % 10000) ELSE NULL END,
  'sess_' || ((i / 30) % 1000000),                     -- ≈30 events per session
  '/' || (ARRAY['home','products','search','cart','checkout','account','help','blog'])[1 + (i % 8)]
    || '/' || ((i * 11) % 10000),
  jsonb_build_object('referrer', (ARRAY['google','direct','email','ad','social'])[1 + (i % 5)])
FROM generate_series(1, 1000000) AS i;

-- ----------------------------------------------------------------------------
-- Reviews (150k)
--
-- We salt review bodies with hot keywords ("refund", "broken", "amazing",
-- "fast delivery") at a low rate so the trigram-search example is realistic.
-- ----------------------------------------------------------------------------

INSERT INTO reviews (id, product_id, customer_id, rating, body, created_at)
SELECT
  i,
  1 + ((i * 7) % 10000),
  1 + ((i * 2654435761) % 50000),
  1 + (i % 5),
  CASE (i % 20)
    WHEN 0  THEN 'Arrived broken. Had to request a refund — process took two weeks.'
    WHEN 1  THEN 'Absolutely amazing product. Will buy again.'
    WHEN 2  THEN 'Fast delivery and well packaged.'
    WHEN 3  THEN 'Not what I expected based on the description. Considering a refund.'
    WHEN 4  THEN 'Broken on arrival. Refund granted, no issues.'
    WHEN 5  THEN 'Great value for the price. Five stars.'
    WHEN 6  THEN 'Average. Nothing special but it works.'
    WHEN 7  THEN 'Decent product but shipping was slow.'
    WHEN 8  THEN 'Customer service was unhelpful when I asked about a refund.'
    WHEN 9  THEN 'Amazing build quality. Lives up to the price.'
    ELSE         'Solid product. Recommended.'
  END,
  TIMESTAMPTZ '2023-01-01 00:00:00+00'
    + (((i * 53) % (365 * 2 * 24 * 60)) || ' minutes')::interval
FROM generate_series(1, 150000) AS i;

COMMIT;

-- ----------------------------------------------------------------------------
-- Statistics
--
-- ANALYZE so the planner has accurate row counts. Without this, EXPLAIN plans
-- we feed to the LLM will be misleading.
-- ----------------------------------------------------------------------------

ANALYZE shop.customers;
ANALYZE shop.suppliers;
ANALYZE shop.categories;
ANALYZE shop.products;
ANALYZE shop.orders;
ANALYZE shop.order_items;
ANALYZE shop.events;
ANALYZE shop.reviews;
