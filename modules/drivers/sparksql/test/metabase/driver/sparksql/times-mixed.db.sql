2023-01-25 00:39:02,868 INFO data.sql :: No test data type mapping for driver :sparksql for base type :type/DateTimeWithTZ, falling back to ancestor base type :type/DateTime

DROP TABLE IF EXISTS ` times `

CREATE TABLE ` times ` (
  ` id ` INT,
  ` index ` INTEGER,
  ` dt ` TIMESTAMP,
  ` dt_tz ` TIMESTAMP,
  ` d ` DATE,
  ` as_dt ` STRING,
  ` as_d ` STRING
)

DROP TABLE IF EXISTS ` weeks `

CREATE TABLE ` weeks ` (
  ` id ` INT,
  ` index ` INTEGER,
  ` description ` STRING,
  ` d ` DATE
)

-- 4 rows
INSERT INTO "times" ("id", "index", "dt", "dt_tz", "d", "as_dt", "as_d")
VALUES
(1, 1, timestamp '2004-03-19 09:19:09.000', to_utc_timestamp('2004-03-19 09:19:09', 'Asia/Ho_Chi_Minh'), timestamp '2004-03-19 00:00:00.000', '2004-03-19 09:19:09', '2004-03-19'),
(2, 2, timestamp '2008-06-20 10:20:10.000', to_utc_timestamp('2008-06-20 10:20:10', 'Asia/Ho_Chi_Minh'), timestamp '2008-06-20 00:00:00.000', '2008-06-20 10:20:10', '2008-06-20'),
(3, 3, timestamp '2012-11-21 11:21:11.000', to_utc_timestamp('2012-11-21 11:21:11', 'Asia/Ho_Chi_Minh'), timestamp '2012-11-21 00:00:00.000', '2012-11-21 11:21:11', '2012-11-21'),
(4, 4, timestamp '2012-11-21 11:21:11.000', to_utc_timestamp('2012-11-21 11:21:11', 'Asia/Ho_Chi_Minh'), timestamp '2012-11-21 00:00:00.000', '2012-11-21 11:21:11', '2012-11-21');

-- 10 rows
INSERT INTO "weeks" ("id", "index", "description", "d")
VALUES
(1, 1, '1st saturday', timestamp '2000-01-01 00:00:00.000'),
(2, 2, '1st sunday', timestamp '2000-01-02 00:00:00.000'),
(3, 3, '1st monday', timestamp '2000-01-03 00:00:00.000'),
(4, 4, '1st wednesday', timestamp '2000-01-04 00:00:00.000'),
(5, 5, '1st tuesday', timestamp '2000-01-05 00:00:00.000'),
(6, 6, '1st thursday', timestamp '2000-01-06 00:00:00.000'),
(7, 7, '1st friday', timestamp '2000-01-07 00:00:00.000'),
(8, 8, '2nd saturday', timestamp '2000-01-08 00:00:00.000'),
(9, 9, '2nd sunday', timestamp '2000-01-09 00:00:00.000'),
(10, 10, '2005 saturday', timestamp '2005-01-01 00:00:00.000');

