
DROP TABLE IF EXISTS ` yyyymmddhhss_binary_times `.` times `

CREATE EXTERNAL TABLE ` yyyymmddhhss_binary_times `.` times ` (` id ` INT, ` name ` STRING, ` as_bytes ` null) LOCATION 's3://metabase-ci-athena-results/yyyymmddhhss_binary_times/times/';

-- 3 rows
INSERT INTO "yyyymmddhhss_binary_times"."times" ("id", "name", "as_bytes")
VALUES
(
  1,
  'foo',
  2023 -01 -25 02: 03: 25,
  349 WARN util.unprepare:: Don 't know how to unprepare values of class [B
[B@7cc51dd9),
(
  2,
  'bar',
  2023 -01 -25 02: 03: 25,
  349 WARN util.unprepare:: Don 't know how to unprepare values of class [B
[B@188b50a5),
(
  3,
  'baz',
  2023 -01 -25 02: 03: 25,
  350 WARN util.unprepare:: Don 't know how to unprepare values of class [B
[B@36c845d6);

