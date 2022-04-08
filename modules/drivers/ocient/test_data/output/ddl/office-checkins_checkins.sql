/* database: office-checkins */
CREATE DATABASE IF NOT EXISTS "office-checkins";

connect to jdbc:ocient://10.10.110.4:4050/office-checkins;

DROP TABLE IF EXISTS "public"."checkins";
CREATE TABLE "public"."checkins"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "person" VARCHAR(255),
  "timestamp" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

