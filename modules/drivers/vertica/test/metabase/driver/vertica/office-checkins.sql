SET
  TIME ZONE TO 'UTC';
2023-01-24 21:49:04,942 INFO data.sql :: No test data type mapping for driver :vertica for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTimeWithTZ

DROP TABLE IF EXISTS "public"."office_checkins_checkins" CASCADE;

CREATE TABLE "public"."office_checkins_checkins" (
  "id" INTEGER,
  "person" VARCHAR(1024),
  "timestamp" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("id")
);
