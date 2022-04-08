/* database: attempted-murders */
CREATE DATABASE IF NOT EXISTS "attempted-murders";

connect to jdbc:ocient://10.10.110.4:4050/attempted-murders;

DROP TABLE IF EXISTS "public"."attempts";
CREATE TABLE "public"."attempts"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "date" DATE,
  "datetime" TIMESTAMP,
  "datetime_ltz" TIMESTAMP,
  "datetime_tz" TIMESTAMP,
  "datetime_tz_id" TIMESTAMP,
  "time" TIME,
  "time_ltz" TIME,
  "time_tz" TIME,
  "num_crows" INT,
  CLUSTERING INDEX idx01 (id)
);

