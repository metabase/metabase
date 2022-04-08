/* database: airports */
CREATE DATABASE IF NOT EXISTS "airports";

connect to jdbc:ocient://10.10.110.4:4050/airports;

DROP TABLE IF EXISTS "public"."country";
CREATE TABLE "public"."country"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "iso-code" VARCHAR(255),
  "continent-id" INT,
  CLUSTERING INDEX idx01 (id)
);

