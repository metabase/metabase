2023-01-21 01:09:06,326 INFO data.sql :: No test data type mapping for driver :sparksql for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTime

DROP TABLE IF EXISTS ` checkins `

CREATE TABLE ` checkins ` (` id ` INT, ` person ` STRING, ` timestamp ` TIMESTAMP)

-- 10 rows
INSERT INTO "checkins" ("person", "timestamp")
VALUES
('Cam', to_utc_timestamp('2019-01-02 05:30:00', '-07:00')),
('Cam', to_utc_timestamp('2019-01-09 05:30:00', '-07:00')),
('Kyle', to_utc_timestamp('2019-01-06 08:30:00', '-07:00')),
('Cam', to_utc_timestamp('2019-01-07 04:00:00', '-07:00')),
('Sameer', to_utc_timestamp('2019-01-26 16:00:00', '-07:00')),
('Cam', to_utc_timestamp('2019-01-16 07:15:00', '-07:00')),
('Tom', to_utc_timestamp('2019-01-27 01:30:00', '-07:00')),
('Sameer', to_utc_timestamp('2019-01-24 14:00:00', '-07:00')),
('Maz', to_utc_timestamp('2019-01-28 11:45:00', '-07:00')),
('Cam', to_utc_timestamp('2019-01-25 07:30:00', '-07:00'));

