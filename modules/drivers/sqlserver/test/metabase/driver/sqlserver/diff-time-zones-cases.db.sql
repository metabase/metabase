
IF object_id('diff-time-zones-cases.dbo.times') IS NOT NULL DROP TABLE "diff-time-zones-cases".dbo."times";

CREATE TABLE "diff-time-zones-cases"."dbo"."times" (
  "id" INT IDENTITY(1, 1),
  "a_dt_tz" DATETIMEOFFSET,
  "b_dt_tz" DATETIMEOFFSET,
  "a_dt_tz_text" VARCHAR(1024),
  "b_dt_tz_text" VARCHAR(1024),
  PRIMARY KEY ("id")
);

-- 35 rows
INSERT INTO "diff-time-zones-cases"."dbo"."times" ("id", "a_dt_tz", "b_dt_tz", "a_dt_tz_text", "b_dt_tz_text")
VALUES
(1, DateTimeOffsetFromParts(2022, 10, 2, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 1, 0, 7), '2022-10-02T00:00:00Z', '2022-10-03T00:00:00+01:00'),
(2, DateTimeOffsetFromParts(2022, 10, 2, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 1, 0, 7), '2022-10-02T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(3, DateTimeOffsetFromParts(2022, 10, 2, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 1, 0, 7), '2022-10-02T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(4, DateTimeOffsetFromParts(2022, 10, 2, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 1, 0, 7), '2022-10-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(5, DateTimeOffsetFromParts(2022, 10, 2, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 1, 0, 7), '2022-10-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(6, DateTimeOffsetFromParts(2022, 10, 2, 1, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 0, 0, 7), '2022-10-02T01:00:00+01:00', '2022-10-03T00:00:00Z'),
(7, DateTimeOffsetFromParts(2022, 10, 2, 1, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 0, 0, 7), '2022-10-02T01:00:00+01:00', '2022-10-09T00:00:00Z'),
(8, DateTimeOffsetFromParts(2022, 10, 2, 1, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 0, 0, 7), '2022-10-02T01:00:00+01:00', '2022-11-02T00:00:00Z'),
(9, DateTimeOffsetFromParts(2022, 10, 2, 1, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 0, 0, 7), '2022-10-02T01:00:00+01:00', '2023-01-02T00:00:00Z'),
(10, DateTimeOffsetFromParts(2022, 10, 2, 1, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 0, 0, 7), '2022-10-02T01:00:00+01:00', '2023-10-02T00:00:00Z'),
(11, DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 1, 0, 7), '2022-10-03T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(12, DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 1, 0, 7), '2022-10-03T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(13, DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 1, 0, 7), '2022-10-03T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(14, DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 1, 0, 7), '2022-10-03T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(15, DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 0, 0, 7), '2022-10-03T00:00:00+01:00', '2022-10-03T00:00:00Z'),
(16, DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 0, 0, 7), '2022-10-03T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(17, DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 0, 0, 7), '2022-10-03T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(18, DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 0, 0, 7), '2022-10-03T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(19, DateTimeOffsetFromParts(2022, 10, 3, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 0, 0, 7), '2022-10-03T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(20, DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 1, 0, 7), '2022-10-09T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(21, DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 1, 0, 7), '2022-10-09T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(22, DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 1, 0, 7), '2022-10-09T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(23, DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 0, 0, 7), '2022-10-09T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(24, DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 0, 0, 7), '2022-10-09T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(25, DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 0, 0, 7), '2022-10-09T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(26, DateTimeOffsetFromParts(2022, 10, 9, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 0, 0, 7), '2022-10-09T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(27, DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 1, 0, 7), '2022-11-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(28, DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 1, 0, 7), '2022-11-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(29, DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 0, 0, 7), '2022-11-02T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(30, DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 0, 0, 7), '2022-11-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(31, DateTimeOffsetFromParts(2022, 11, 2, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 0, 0, 7), '2022-11-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(32, DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 0, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 1, 0, 7), '2023-01-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(33, DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 0, 0, 7), '2023-01-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(34, DateTimeOffsetFromParts(2023, 1, 2, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 0, 0, 7), '2023-01-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(35, DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 1, 0, 7), DateTimeOffsetFromParts(2023, 10, 2, 0, 0, 0, 0, 0, 0, 7), '2023-10-02T00:00:00+01:00', '2023-10-02T00:00:00Z');

