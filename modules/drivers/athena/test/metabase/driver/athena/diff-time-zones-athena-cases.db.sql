
DROP TABLE IF EXISTS ` diff_time_zones_athena_cases `.` times `

CREATE EXTERNAL TABLE ` diff_time_zones_athena_cases `.` times ` (` id ` INT, ` dt ` TIMESTAMP, ` dt_text ` STRING) LOCATION 's3://metabase-ci-athena-results/diff_time_zones_athena_cases/times/';

-- 7 rows
INSERT INTO "diff_time_zones_athena_cases"."times" ("id", "dt", "dt_text")
VALUES
(1, timestamp '2022-10-02 00:00:00.000', '2022-10-02T00:00:00'),
(2, timestamp '2022-10-02 01:00:00.000', '2022-10-02T01:00:00'),
(3, timestamp '2022-10-03 00:00:00.000', '2022-10-03T00:00:00'),
(4, timestamp '2022-10-09 00:00:00.000', '2022-10-09T00:00:00'),
(5, timestamp '2022-11-02 00:00:00.000', '2022-11-02T00:00:00'),
(6, timestamp '2023-01-02 00:00:00.000', '2023-01-02T00:00:00'),
(7, timestamp '2023-10-02 00:00:00.000', '2023-10-02T00:00:00');

