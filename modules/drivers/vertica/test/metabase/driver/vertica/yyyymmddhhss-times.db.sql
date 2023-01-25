SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."yyyymmddhhss_times_times" CASCADE;

CREATE TABLE "public"."yyyymmddhhss_times_times" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "as_text" VARCHAR(1024),
  PRIMARY KEY ("id")
);
