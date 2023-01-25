SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."airports_continent" CASCADE;

CREATE TABLE "public"."airports_continent" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "iso_code" VARCHAR(1024),
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."airports_country" CASCADE;

CREATE TABLE "public"."airports_country" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "iso_code" VARCHAR(1024),
  "continent_id" INTEGER,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."airports_region" CASCADE;

CREATE TABLE "public"."airports_region" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "iso_code" VARCHAR(1024),
  "country_id" INTEGER,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."airports_municipality" CASCADE;

CREATE TABLE "public"."airports_municipality" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "region_id" INTEGER,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."airports_airport" CASCADE;

CREATE TABLE "public"."airports_airport" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "code" VARCHAR(1024),
  "latitude" FLOAT,
  "longitude" FLOAT,
  "municipality_id" INTEGER,
  PRIMARY KEY ("id")
);

ALTER TABLE
  "public"."airports_country"
ADD
  CONSTRAINT "tinent_id_continent_1276916200" FOREIGN KEY ("continent_id") REFERENCES "public"."airports_continent" ("id");

ALTER TABLE
  "public"."airports_region"
ADD
  CONSTRAINT "n_country_id_country_738919583" FOREIGN KEY ("country_id") REFERENCES "public"."airports_country" ("id");

ALTER TABLE
  "public"."airports_municipality"
ADD
  CONSTRAINT "y_region_id_region_-1541724932" FOREIGN KEY ("region_id") REFERENCES "public"."airports_region" ("id");

ALTER TABLE
  "public"."airports_airport"
ADD
  CONSTRAINT "ality_id_municipality_87663801" FOREIGN KEY ("municipality_id") REFERENCES "public"."airports_municipality" ("id");
