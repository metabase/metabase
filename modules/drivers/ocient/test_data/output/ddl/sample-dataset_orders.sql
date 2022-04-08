/* database: sample-dataset */
CREATE DATABASE IF NOT EXISTS "sample-dataset";

connect to jdbc:ocient://10.10.110.4:4050/sample-dataset;

DROP TABLE IF EXISTS "public"."orders";
CREATE TABLE "public"."orders"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "user_id" INT,
  "product_id" INT,
  "subtotal" DOUBLE,
  "tax" DOUBLE,
  "total" DOUBLE,
  "discount" DOUBLE,
  "created_at" TIMESTAMP,
  "quantity" INT,
  CLUSTERING INDEX idx01 (id)
);

