SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."string_times_times" CASCADE;

CREATE TABLE "public"."string_times_times" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "ts" VARCHAR(1024),
  "d" VARCHAR(1024),
  "t" VARCHAR(1024),
  PRIMARY KEY ("id")
);
