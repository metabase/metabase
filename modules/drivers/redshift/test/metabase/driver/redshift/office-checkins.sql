SET
  TIMEZONE TO 'UTC';
2023-01-21 01:08:58,529 INFO data.sql :: No test data type mapping for driver :redshift for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTime

DROP TABLE IF EXISTS "schema_20"."office_checkins_checkins" CASCADE;

CREATE TABLE "schema_20"."office_checkins_checkins" (
  "id" INTEGER IDENTITY(1, 1),
  "person" VARCHAR(1024),
  "timestamp" TIMESTAMP,
  PRIMARY KEY ("id")
);

-- 10 rows
INSERT INTO "schema_20"."office_checkins_checkins" ("person", "timestamp")
VALUES
('Cam', timestamp with time zone '2019-01-02 05:30:00.000-07:00'),
('Cam', timestamp with time zone '2019-01-09 05:30:00.000-07:00'),
('Kyle', timestamp with time zone '2019-01-06 08:30:00.000-07:00'),
('Cam', timestamp with time zone '2019-01-07 04:00:00.000-07:00'),
('Sameer', timestamp with time zone '2019-01-26 16:00:00.000-07:00'),
('Cam', timestamp with time zone '2019-01-16 07:15:00.000-07:00'),
('Tom', timestamp with time zone '2019-01-27 01:30:00.000-07:00'),
('Sameer', timestamp with time zone '2019-01-24 14:00:00.000-07:00'),
('Maz', timestamp with time zone '2019-01-28 11:45:00.000-07:00'),
('Cam', timestamp with time zone '2019-01-25 07:30:00.000-07:00');

