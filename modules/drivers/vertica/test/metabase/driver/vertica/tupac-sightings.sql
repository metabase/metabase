SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."tupac_sightings_cities" CASCADE;

CREATE TABLE "public"."tupac_sightings_cities" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "latitude" FLOAT,
  "longitude" FLOAT,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."tupac_sightings_categories" CASCADE;

CREATE TABLE "public"."tupac_sightings_categories" ("id" INTEGER, "name" VARCHAR(1024), PRIMARY KEY ("id"));

DROP TABLE IF EXISTS "public"."tupac_sightings_sightings" CASCADE;

CREATE TABLE "public"."tupac_sightings_sightings" (
  "id" INTEGER,
  "city_id" INTEGER,
  "category_id" INTEGER,
  "timestamp" BIGINT,
  PRIMARY KEY ("id")
);

ALTER TABLE
  "public"."tupac_sightings_sightings"
ADD
  CONSTRAINT "tings_city_id_cities_626224744" FOREIGN KEY ("city_id") REFERENCES "public"."tupac_sightings_cities" ("id");

ALTER TABLE
  "public"."tupac_sightings_sightings"
ADD
  CONSTRAINT "tegory_id_categories_132892118" FOREIGN KEY ("category_id") REFERENCES "public"."tupac_sightings_categories" ("id");
