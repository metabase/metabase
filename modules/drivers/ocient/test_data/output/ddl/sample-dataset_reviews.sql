/* database: sample-dataset */
CREATE DATABASE IF NOT EXISTS "sample-dataset";

connect to jdbc:ocient://10.10.110.4:4050/sample-dataset;

DROP TABLE IF EXISTS "public"."reviews";
CREATE TABLE "public"."reviews"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "product_id" INT,
  "reviewer" VARCHAR(255),
  "rating" INT,
  "body" VARCHAR(255),
  "created_at" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

