/* database: geographical-tips */
CREATE DATABASE IF NOT EXISTS "geographical-tips";

connect to jdbc:ocient://10.10.110.4:4050/geographical-tips;

DROP TABLE IF EXISTS "public"."tips";
CREATE TABLE "public"."tips"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "source" VARCHAR(255),
  "text" VARCHAR(255),
  "url" VARCHAR(255),
  "venue" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

