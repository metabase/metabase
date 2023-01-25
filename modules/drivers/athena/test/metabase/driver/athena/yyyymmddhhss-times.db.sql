
DROP TABLE IF EXISTS ` yyyymmddhhss_times `.` times `

CREATE EXTERNAL TABLE ` yyyymmddhhss_times `.` times ` (` id ` INT, ` name ` STRING, ` as_text ` STRING) LOCATION 's3://metabase-ci-athena-results/yyyymmddhhss_times/times/';

-- 3 rows
INSERT INTO "yyyymmddhhss_times"."times" ("id", "name", "as_text")
VALUES
(1, 'foo', '20190421164300'),
(2, 'bar', '20200421164300'),
(3, 'baz', '20210421164300');

