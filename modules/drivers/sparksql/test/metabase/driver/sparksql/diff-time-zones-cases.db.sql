2023-01-25 00:38:37,036 INFO data.sql :: No test data type mapping for driver :sparksql for base type :type/DateTimeWithTZ, falling back to ancestor base type :type/DateTime
2023-01-25 00:38:37,037 INFO data.sql :: No test data type mapping for driver :sparksql for base type :type/DateTimeWithTZ, falling back to ancestor base type :type/DateTime

DROP TABLE IF EXISTS ` times `

CREATE TABLE ` times ` (
  ` id ` INT,
  ` a_dt_tz ` TIMESTAMP,
  ` b_dt_tz ` TIMESTAMP,
  ` a_dt_tz_text ` STRING,
  ` b_dt_tz_text ` STRING
)

-- 35 rows
INSERT INTO "times" ("id", "a_dt_tz", "b_dt_tz", "a_dt_tz_text", "b_dt_tz_text")
VALUES
(1, to_utc_timestamp('2022-10-02 00:00:00', 'UTC'), to_utc_timestamp('2022-10-03 00:00:00', 'Africa/Lagos'), '2022-10-02T00:00:00Z', '2022-10-03T00:00:00+01:00'),
(2, to_utc_timestamp('2022-10-02 00:00:00', 'UTC'), to_utc_timestamp('2022-10-09 00:00:00', 'Africa/Lagos'), '2022-10-02T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(3, to_utc_timestamp('2022-10-02 00:00:00', 'UTC'), to_utc_timestamp('2022-11-02 00:00:00', 'Africa/Lagos'), '2022-10-02T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(4, to_utc_timestamp('2022-10-02 00:00:00', 'UTC'), to_utc_timestamp('2023-01-02 00:00:00', 'Africa/Lagos'), '2022-10-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(5, to_utc_timestamp('2022-10-02 00:00:00', 'UTC'), to_utc_timestamp('2023-10-02 00:00:00', 'Africa/Lagos'), '2022-10-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(6, to_utc_timestamp('2022-10-02 01:00:00', 'Africa/Lagos'), to_utc_timestamp('2022-10-03 00:00:00', 'UTC'), '2022-10-02T01:00:00+01:00', '2022-10-03T00:00:00Z'),
(7, to_utc_timestamp('2022-10-02 01:00:00', 'Africa/Lagos'), to_utc_timestamp('2022-10-09 00:00:00', 'UTC'), '2022-10-02T01:00:00+01:00', '2022-10-09T00:00:00Z'),
(8, to_utc_timestamp('2022-10-02 01:00:00', 'Africa/Lagos'), to_utc_timestamp('2022-11-02 00:00:00', 'UTC'), '2022-10-02T01:00:00+01:00', '2022-11-02T00:00:00Z'),
(9, to_utc_timestamp('2022-10-02 01:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-01-02 00:00:00', 'UTC'), '2022-10-02T01:00:00+01:00', '2023-01-02T00:00:00Z'),
(10, to_utc_timestamp('2022-10-02 01:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-10-02 00:00:00', 'UTC'), '2022-10-02T01:00:00+01:00', '2023-10-02T00:00:00Z'),
(11, to_utc_timestamp('2022-10-03 00:00:00', 'UTC'), to_utc_timestamp('2022-10-09 00:00:00', 'Africa/Lagos'), '2022-10-03T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(12, to_utc_timestamp('2022-10-03 00:00:00', 'UTC'), to_utc_timestamp('2022-11-02 00:00:00', 'Africa/Lagos'), '2022-10-03T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(13, to_utc_timestamp('2022-10-03 00:00:00', 'UTC'), to_utc_timestamp('2023-01-02 00:00:00', 'Africa/Lagos'), '2022-10-03T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(14, to_utc_timestamp('2022-10-03 00:00:00', 'UTC'), to_utc_timestamp('2023-10-02 00:00:00', 'Africa/Lagos'), '2022-10-03T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(15, to_utc_timestamp('2022-10-03 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2022-10-03 00:00:00', 'UTC'), '2022-10-03T00:00:00+01:00', '2022-10-03T00:00:00Z'),
(16, to_utc_timestamp('2022-10-03 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2022-10-09 00:00:00', 'UTC'), '2022-10-03T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(17, to_utc_timestamp('2022-10-03 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2022-11-02 00:00:00', 'UTC'), '2022-10-03T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(18, to_utc_timestamp('2022-10-03 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-01-02 00:00:00', 'UTC'), '2022-10-03T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(19, to_utc_timestamp('2022-10-03 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-10-02 00:00:00', 'UTC'), '2022-10-03T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(20, to_utc_timestamp('2022-10-09 00:00:00', 'UTC'), to_utc_timestamp('2022-11-02 00:00:00', 'Africa/Lagos'), '2022-10-09T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(21, to_utc_timestamp('2022-10-09 00:00:00', 'UTC'), to_utc_timestamp('2023-01-02 00:00:00', 'Africa/Lagos'), '2022-10-09T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(22, to_utc_timestamp('2022-10-09 00:00:00', 'UTC'), to_utc_timestamp('2023-10-02 00:00:00', 'Africa/Lagos'), '2022-10-09T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(23, to_utc_timestamp('2022-10-09 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2022-10-09 00:00:00', 'UTC'), '2022-10-09T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(24, to_utc_timestamp('2022-10-09 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2022-11-02 00:00:00', 'UTC'), '2022-10-09T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(25, to_utc_timestamp('2022-10-09 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-01-02 00:00:00', 'UTC'), '2022-10-09T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(26, to_utc_timestamp('2022-10-09 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-10-02 00:00:00', 'UTC'), '2022-10-09T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(27, to_utc_timestamp('2022-11-02 00:00:00', 'UTC'), to_utc_timestamp('2023-01-02 00:00:00', 'Africa/Lagos'), '2022-11-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(28, to_utc_timestamp('2022-11-02 00:00:00', 'UTC'), to_utc_timestamp('2023-10-02 00:00:00', 'Africa/Lagos'), '2022-11-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(29, to_utc_timestamp('2022-11-02 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2022-11-02 00:00:00', 'UTC'), '2022-11-02T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(30, to_utc_timestamp('2022-11-02 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-01-02 00:00:00', 'UTC'), '2022-11-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(31, to_utc_timestamp('2022-11-02 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-10-02 00:00:00', 'UTC'), '2022-11-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(32, to_utc_timestamp('2023-01-02 00:00:00', 'UTC'), to_utc_timestamp('2023-10-02 00:00:00', 'Africa/Lagos'), '2023-01-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(33, to_utc_timestamp('2023-01-02 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-01-02 00:00:00', 'UTC'), '2023-01-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(34, to_utc_timestamp('2023-01-02 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-10-02 00:00:00', 'UTC'), '2023-01-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(35, to_utc_timestamp('2023-10-02 00:00:00', 'Africa/Lagos'), to_utc_timestamp('2023-10-02 00:00:00', 'UTC'), '2023-10-02T00:00:00+01:00', '2023-10-02T00:00:00Z');

