SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."times_mixed_times" CASCADE;

CREATE TABLE "public"."times_mixed_times" (
  "id" INTEGER,
  "index" INTEGER,
  "dt" TIMESTAMP,
  "dt_tz" TIMESTAMP WITH TIME ZONE,
  "d" DATE,
  "as_dt" VARCHAR(1024),
  "as_d" VARCHAR(1024),
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."times_mixed_weeks" CASCADE;

CREATE TABLE "public"."times_mixed_weeks" (
  "id" INTEGER,
  "index" INTEGER,
  "description" VARCHAR(1024),
  "d" DATE,
  PRIMARY KEY ("id")
);
