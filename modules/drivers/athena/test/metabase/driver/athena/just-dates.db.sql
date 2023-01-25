
DROP TABLE IF EXISTS ` just_dates `.` just_dates `

CREATE EXTERNAL TABLE ` just_dates `.` just_dates ` (` id ` INT, ` name ` STRING, ` ts ` STRING, ` d ` STRING) LOCATION 's3://metabase-ci-athena-results/just_dates/just_dates/';

-- 3 rows
INSERT INTO "just_dates"."just_dates" ("id", "name", "ts", "d")
VALUES
(1, 'foo', '2004-10-19 10:23:54', '2004-10-19'),
(2, 'bar', '2008-10-19 10:23:54', '2008-10-19'),
(3, 'baz', '2012-10-19 10:23:54', '2012-10-19');

