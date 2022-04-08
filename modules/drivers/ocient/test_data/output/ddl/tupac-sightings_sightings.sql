/* database: tupac-sightings */
CREATE DATABASE IF NOT EXISTS "tupac-sightings";

connect to jdbc:ocient://10.10.110.4:4050/tupac-sightings;

DROP TABLE IF EXISTS "public"."sightings";
CREATE TABLE "public"."sightings"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "city_id" INT,
  "category_id" INT,
  "timestamp" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

