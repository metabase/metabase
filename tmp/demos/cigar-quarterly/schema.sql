-- tmp/demos/cigar-quarterly/schema.sql
-- Corleone Cigars Imports — demo schema
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS skus;
DROP TABLE IF EXISTS distributors;

CREATE TABLE skus (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  origin        text NOT NULL,
  box_price_usd numeric(10,2) NOT NULL
);

CREATE TABLE distributors (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  nickname    text NOT NULL,
  region      text NOT NULL,
  joined_at   date NOT NULL
);

CREATE TABLE shipments (
  id              bigserial PRIMARY KEY,
  ship_date       date NOT NULL,
  sku_id          int NOT NULL REFERENCES skus(id),
  distributor_id  int NOT NULL REFERENCES distributors(id),
  region          text NOT NULL,
  units           int NOT NULL,
  revenue_usd     numeric(10,2) NOT NULL
);

CREATE INDEX shipments_ship_date_idx     ON shipments (ship_date);
CREATE INDEX shipments_region_idx        ON shipments (region);
CREATE INDEX shipments_distributor_idx   ON shipments (distributor_id);
