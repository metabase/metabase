/* database: sample-dataset */
CREATE DATABASE IF NOT EXISTS "sample-dataset";

connect to jdbc:ocient://10.10.110.4:4050/sample-dataset;

DROP TABLE IF EXISTS "public"."people";
CREATE TABLE "public"."people"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "address" VARCHAR(255),
  "email" VARCHAR(255),
  "password" VARCHAR(255),
  "name" VARCHAR(255),
  "city" VARCHAR(255),
  "longitude" DOUBLE,
  "state" VARCHAR(255),
  "source" VARCHAR(255),
  "birth_date" DATE,
  "zip" VARCHAR(255),
  "latitude" DOUBLE,
  "created_at" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

