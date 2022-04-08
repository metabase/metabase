/* database: bird-flocks */
CREATE DATABASE IF NOT EXISTS "bird-flocks";

connect to jdbc:ocient://10.10.110.4:4050/bird-flocks;

DROP TABLE IF EXISTS "public"."flock";
CREATE TABLE "public"."flock"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

