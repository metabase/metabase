
DROP TABLE IF EXISTS ` times_mixed `.` times `

CREATE EXTERNAL TABLE ` times_mixed `.` times ` (
  ` id ` INT,
  ` index ` INT,
  ` dt ` TIMESTAMP,
  ` dt_tz ` TIMESTAMP,
  ` d ` TIMESTAMP,
  ` as_dt ` STRING,
  ` as_d ` STRING
) LOCATION 's3://metabase-ci-athena-results/times_mixed/times/';

DROP TABLE IF EXISTS ` times_mixed `.` weeks `

CREATE EXTERNAL TABLE ` times_mixed `.` weeks ` (
  ` id ` INT,
  ` index ` INT,
  ` description ` STRING,
  ` d ` TIMESTAMP
) LOCATION 's3://metabase-ci-athena-results/times_mixed/weeks/';
