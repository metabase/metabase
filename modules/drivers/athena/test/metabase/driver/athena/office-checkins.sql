2023-01-21 01:08:43,009 INFO data.sql :: No test data type mapping for driver :athena for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTimeWithTZ

DROP TABLE IF EXISTS ` office_checkins `.` checkins `

CREATE EXTERNAL TABLE ` office_checkins `.` checkins ` (` id ` INT, ` person ` STRING, ` timestamp ` TIMESTAMP) LOCATION 's3://metabase-ci-athena-results/office_checkins/checkins/';

-- 10 rows
INSERT INTO "office_checkins"."checkins" ("person", "timestamp")
VALUES
('Cam', timestamp '2019-01-02 05:30 -07:00'),
('Cam', timestamp '2019-01-09 05:30 -07:00'),
('Kyle', timestamp '2019-01-06 08:30 -07:00'),
('Cam', timestamp '2019-01-07 04:00 -07:00'),
('Sameer', timestamp '2019-01-26 16:00 -07:00'),
('Cam', timestamp '2019-01-16 07:15 -07:00'),
('Tom', timestamp '2019-01-27 01:30 -07:00'),
('Sameer', timestamp '2019-01-24 14:00 -07:00'),
('Maz', timestamp '2019-01-28 11:45 -07:00'),
('Cam', timestamp '2019-01-25 07:30 -07:00');

