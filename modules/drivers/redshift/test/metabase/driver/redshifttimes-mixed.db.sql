SET
  TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "schema_201"."times_mixed_times" CASCADE;

CREATE TABLE "schema_201"."times_mixed_times" (
  "id" INTEGER IDENTITY(1, 1),
  "index" INTEGER,
  "dt" TIMESTAMP,
  "dt_tz" TIMESTAMP WITH TIME ZONE,
  "d" DATE,
  "as_dt" VARCHAR(1024),
  "as_d" VARCHAR(1024),
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "schema_201"."times_mixed_weeks" CASCADE;

CREATE TABLE "schema_201"."times_mixed_weeks" (
  "id" INTEGER IDENTITY(1, 1),
  "index" INTEGER,
  "description" VARCHAR(1024),
  "d" DATE,
  PRIMARY KEY ("id")
);
