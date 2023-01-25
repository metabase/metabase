ALTER SESSION
SET
  TIMEZONE = 'UTC';
2023-01-21 01:09:02,370 INFO data.sql :: No test data type mapping for driver :snowflake for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTimeWithTZ

DROP TABLE IF EXISTS "office-checkins"."PUBLIC"."checkins";

CREATE TABLE "office-checkins"."PUBLIC"."checkins" (
  "id" INTEGER AUTOINCREMENT,
  "person" TEXT,
  "timestamp" TIMESTAMP_TZ,
  PRIMARY KEY ("id")
);

-- 10 rows
INSERT INTO "office-checkins"."PUBLIC"."checkins" ("person", "timestamp")
VALUES
('Cam', '2019-01-02 05:30 -07:00':: timestamp_tz),
('Cam', '2019-01-09 05:30 -07:00':: timestamp_tz),
('Kyle', '2019-01-06 08:30 -07:00':: timestamp_tz),
('Cam', '2019-01-07 04:00 -07:00':: timestamp_tz),
('Sameer', '2019-01-26 16:00 -07:00':: timestamp_tz),
('Cam', '2019-01-16 07:15 -07:00':: timestamp_tz),
('Tom', '2019-01-27 01:30 -07:00':: timestamp_tz),
('Sameer', '2019-01-24 14:00 -07:00':: timestamp_tz),
('Maz', '2019-01-28 11:45 -07:00':: timestamp_tz),
('Cam', '2019-01-25 07:30 -07:00':: timestamp_tz);

