SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."just_dates_just_dates" CASCADE;

CREATE TABLE "public"."just_dates_just_dates" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "ts" VARCHAR(1024),
  "d" VARCHAR(1024),
  PRIMARY KEY ("id")
);
