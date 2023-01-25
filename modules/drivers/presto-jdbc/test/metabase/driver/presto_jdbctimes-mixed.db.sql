
DROP TABLE IF EXISTS "test_data"."default"."times_mixed_times";

CREATE TABLE "test_data"."default"."times_mixed_times" (
  "id" INTEGER,
  "index" INTEGER,
  "dt" TIMESTAMP,
  "dt_tz" TIMESTAMP WITH TIME ZONE,
  "d" DATE,
  "as_dt" VARCHAR,
  "as_d" VARCHAR
);

DROP TABLE IF EXISTS "test_data"."default"."times_mixed_weeks";

CREATE TABLE "test_data"."default"."times_mixed_weeks" (
  "id" INTEGER,
  "index" INTEGER,
  "description" VARCHAR,
  "d" DATE
);
