/* database: daily-bird-counts */
CREATE DATABASE IF NOT EXISTS "daily-bird-counts";

connect to jdbc:ocient://10.10.110.4:4050/daily-bird-counts;

DROP TABLE IF EXISTS "public"."bird-count";
CREATE TABLE "public"."bird-count"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "date" DATE,
  "count" INT,
  CLUSTERING INDEX idx01 (id)
);

