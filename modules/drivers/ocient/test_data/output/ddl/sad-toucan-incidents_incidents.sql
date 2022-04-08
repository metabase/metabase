/* database: sad-toucan-incidents */
CREATE DATABASE IF NOT EXISTS "sad-toucan-incidents";

connect to jdbc:ocient://10.10.110.4:4050/sad-toucan-incidents;

DROP TABLE IF EXISTS "public"."incidents";
CREATE TABLE "public"."incidents"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "severity" INT,
  "timestamp" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

