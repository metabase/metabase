/* database: sample-dataset */
CREATE DATABASE IF NOT EXISTS "sample-dataset";

connect to jdbc:ocient://10.10.110.4:4050/sample-dataset;

DROP TABLE IF EXISTS "public"."products";
CREATE TABLE "public"."products"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "ean" VARCHAR(255),
  "title" VARCHAR(255),
  "category" VARCHAR(255),
  "vendor" VARCHAR(255),
  "price" DOUBLE,
  "rating" DOUBLE,
  "created_at" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

