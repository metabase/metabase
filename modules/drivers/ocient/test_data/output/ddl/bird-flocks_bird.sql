/* database: bird-flocks */
CREATE DATABASE IF NOT EXISTS "bird-flocks";

connect to jdbc:ocient://10.10.110.4:4050/bird-flocks;

DROP TABLE IF EXISTS "public"."bird";
CREATE TABLE "public"."bird"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "flock_id" INT,
  CLUSTERING INDEX idx01 (id)
);

