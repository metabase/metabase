
DROP TABLE IF EXISTS ` bird_count `

CREATE TABLE ` bird_count ` (` id ` INT, ` date ` DATE, ` count ` INTEGER)

-- 30 rows
INSERT INTO "bird_count" ("date", "count")
VALUES
(timestamp '2018-09-20 00:00:00.000', NULL),
(timestamp '2018-09-21 00:00:00.000', 0),
(timestamp '2018-09-22 00:00:00.000', 0),
(timestamp '2018-09-23 00:00:00.000', 10),
(timestamp '2018-09-24 00:00:00.000', 8),
(timestamp '2018-09-25 00:00:00.000', 5),
(timestamp '2018-09-26 00:00:00.000', 5),
(timestamp '2018-09-27 00:00:00.000', NULL),
(timestamp '2018-09-28 00:00:00.000', 0),
(timestamp '2018-09-29 00:00:00.000', 0),
(timestamp '2018-09-30 00:00:00.000', 11),
(timestamp '2018-10-01 00:00:00.000', 14),
(timestamp '2018-10-02 00:00:00.000', 8),
(timestamp '2018-10-03 00:00:00.000', 14),
(timestamp '2018-10-04 00:00:00.000', NULL),
(timestamp '2018-10-05 00:00:00.000', 6),
(timestamp '2018-10-06 00:00:00.000', 4),
(timestamp '2018-10-07 00:00:00.000', 0),
(timestamp '2018-10-08 00:00:00.000', NULL),
(timestamp '2018-10-09 00:00:00.000', 3),
(timestamp '2018-10-10 00:00:00.000', 13),
(timestamp '2018-10-11 00:00:00.000', NULL),
(timestamp '2018-10-12 00:00:00.000', 14),
(timestamp '2018-10-13 00:00:00.000', 6),
(timestamp '2018-10-14 00:00:00.000', 12),
(timestamp '2018-10-15 00:00:00.000', 13),
(timestamp '2018-10-16 00:00:00.000', 0),
(timestamp '2018-10-17 00:00:00.000', 7),
(timestamp '2018-10-18 00:00:00.000', 10),
(timestamp '2018-10-19 00:00:00.000', 5);

