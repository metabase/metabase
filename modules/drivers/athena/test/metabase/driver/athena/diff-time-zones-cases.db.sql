
DROP TABLE IF EXISTS ` diff_time_zones_cases `.` times `

CREATE EXTERNAL TABLE ` diff_time_zones_cases `.` times ` (
  ` id ` INT,
  ` a_dt_tz ` TIMESTAMP,
  ` b_dt_tz ` TIMESTAMP,
  ` a_dt_tz_text ` STRING,
  ` b_dt_tz_text ` STRING
) LOCATION 's3://metabase-ci-athena-results/diff_time_zones_cases/times/';

-- 35 rows
INSERT INTO "diff_time_zones_cases"."times" ("id", "a_dt_tz", "b_dt_tz", "a_dt_tz_text", "b_dt_tz_text")
VALUES
(1, timestamp '2022-10-02 00:00 UTC', timestamp '2022-10-03 00:00 Africa/Lagos', '2022-10-02T00:00:00Z', '2022-10-03T00:00:00+01:00'),
(2, timestamp '2022-10-02 00:00 UTC', timestamp '2022-10-09 00:00 Africa/Lagos', '2022-10-02T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(3, timestamp '2022-10-02 00:00 UTC', timestamp '2022-11-02 00:00 Africa/Lagos', '2022-10-02T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(4, timestamp '2022-10-02 00:00 UTC', timestamp '2023-01-02 00:00 Africa/Lagos', '2022-10-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(5, timestamp '2022-10-02 00:00 UTC', timestamp '2023-10-02 00:00 Africa/Lagos', '2022-10-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(6, timestamp '2022-10-02 01:00 Africa/Lagos', timestamp '2022-10-03 00:00 UTC', '2022-10-02T01:00:00+01:00', '2022-10-03T00:00:00Z'),
(7, timestamp '2022-10-02 01:00 Africa/Lagos', timestamp '2022-10-09 00:00 UTC', '2022-10-02T01:00:00+01:00', '2022-10-09T00:00:00Z'),
(8, timestamp '2022-10-02 01:00 Africa/Lagos', timestamp '2022-11-02 00:00 UTC', '2022-10-02T01:00:00+01:00', '2022-11-02T00:00:00Z'),
(9, timestamp '2022-10-02 01:00 Africa/Lagos', timestamp '2023-01-02 00:00 UTC', '2022-10-02T01:00:00+01:00', '2023-01-02T00:00:00Z'),
(10, timestamp '2022-10-02 01:00 Africa/Lagos', timestamp '2023-10-02 00:00 UTC', '2022-10-02T01:00:00+01:00', '2023-10-02T00:00:00Z'),
(11, timestamp '2022-10-03 00:00 UTC', timestamp '2022-10-09 00:00 Africa/Lagos', '2022-10-03T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(12, timestamp '2022-10-03 00:00 UTC', timestamp '2022-11-02 00:00 Africa/Lagos', '2022-10-03T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(13, timestamp '2022-10-03 00:00 UTC', timestamp '2023-01-02 00:00 Africa/Lagos', '2022-10-03T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(14, timestamp '2022-10-03 00:00 UTC', timestamp '2023-10-02 00:00 Africa/Lagos', '2022-10-03T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(15, timestamp '2022-10-03 00:00 Africa/Lagos', timestamp '2022-10-03 00:00 UTC', '2022-10-03T00:00:00+01:00', '2022-10-03T00:00:00Z'),
(16, timestamp '2022-10-03 00:00 Africa/Lagos', timestamp '2022-10-09 00:00 UTC', '2022-10-03T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(17, timestamp '2022-10-03 00:00 Africa/Lagos', timestamp '2022-11-02 00:00 UTC', '2022-10-03T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(18, timestamp '2022-10-03 00:00 Africa/Lagos', timestamp '2023-01-02 00:00 UTC', '2022-10-03T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(19, timestamp '2022-10-03 00:00 Africa/Lagos', timestamp '2023-10-02 00:00 UTC', '2022-10-03T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(20, timestamp '2022-10-09 00:00 UTC', timestamp '2022-11-02 00:00 Africa/Lagos', '2022-10-09T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(21, timestamp '2022-10-09 00:00 UTC', timestamp '2023-01-02 00:00 Africa/Lagos', '2022-10-09T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(22, timestamp '2022-10-09 00:00 UTC', timestamp '2023-10-02 00:00 Africa/Lagos', '2022-10-09T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(23, timestamp '2022-10-09 00:00 Africa/Lagos', timestamp '2022-10-09 00:00 UTC', '2022-10-09T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(24, timestamp '2022-10-09 00:00 Africa/Lagos', timestamp '2022-11-02 00:00 UTC', '2022-10-09T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(25, timestamp '2022-10-09 00:00 Africa/Lagos', timestamp '2023-01-02 00:00 UTC', '2022-10-09T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(26, timestamp '2022-10-09 00:00 Africa/Lagos', timestamp '2023-10-02 00:00 UTC', '2022-10-09T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(27, timestamp '2022-11-02 00:00 UTC', timestamp '2023-01-02 00:00 Africa/Lagos', '2022-11-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(28, timestamp '2022-11-02 00:00 UTC', timestamp '2023-10-02 00:00 Africa/Lagos', '2022-11-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(29, timestamp '2022-11-02 00:00 Africa/Lagos', timestamp '2022-11-02 00:00 UTC', '2022-11-02T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(30, timestamp '2022-11-02 00:00 Africa/Lagos', timestamp '2023-01-02 00:00 UTC', '2022-11-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(31, timestamp '2022-11-02 00:00 Africa/Lagos', timestamp '2023-10-02 00:00 UTC', '2022-11-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(32, timestamp '2023-01-02 00:00 UTC', timestamp '2023-10-02 00:00 Africa/Lagos', '2023-01-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(33, timestamp '2023-01-02 00:00 Africa/Lagos', timestamp '2023-01-02 00:00 UTC', '2023-01-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(34, timestamp '2023-01-02 00:00 Africa/Lagos', timestamp '2023-10-02 00:00 UTC', '2023-01-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(35, timestamp '2023-10-02 00:00 Africa/Lagos', timestamp '2023-10-02 00:00 UTC', '2023-10-02T00:00:00+01:00', '2023-10-02T00:00:00Z');

