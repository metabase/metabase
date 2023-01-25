SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."diff_time_zones_cases_times" CASCADE;

CREATE TABLE "public"."diff_time_zones_cases_times" (
  "id" INTEGER,
  "a_dt_tz" TIMESTAMP WITH TIME ZONE,
  "b_dt_tz" TIMESTAMP WITH TIME ZONE,
  "a_dt_tz_text" VARCHAR(1024),
  "b_dt_tz_text" VARCHAR(1024),
  PRIMARY KEY ("id")
);
