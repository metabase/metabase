
DROP TABLE IF EXISTS ` times `

CREATE TABLE ` times ` (` id ` INT, ` name ` STRING, ` as_bytes ` null)

-- 3 rows
INSERT INTO "times" ("id", "name", "as_bytes")
VALUES
(
  1,
  'foo',
  2023 -01 -25 02: 03: 25,
  364 WARN util.unprepare:: Don 't know how to unprepare values of class [B
[B@7cc51dd9),
(
  2,
  'bar',
  2023 -01 -25 02: 03: 25,
  364 WARN util.unprepare:: Don 't know how to unprepare values of class [B
[B@188b50a5),
(
  3,
  'baz',
  2023 -01 -25 02: 03: 25,
  365 WARN util.unprepare:: Don 't know how to unprepare values of class [B
[B@36c845d6);

