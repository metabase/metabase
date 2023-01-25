2023-01-21 01:09:13,960 INFO data.sql :: No test data type mapping for driver :sqlserver for base type :type/DateTimeWithLocalTZ, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-21 01:09:13,960 INFO data.sql :: No test data type mapping for driver :sqlserver for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-21 01:09:13,960 INFO data.sql :: No test data type mapping for driver :sqlserver for base type :type/DateTimeWithZoneID, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-21 01:09:13,960 INFO data.sql :: No test data type mapping for driver :sqlserver for base type :type/TimeWithLocalTZ, falling back to ancestor base type :type/Time
2023-01-21 01:09:13,960 INFO data.sql :: No test data type mapping for driver :sqlserver for base type :type/TimeWithZoneOffset, falling back to ancestor base type :type/Time

IF object_id('attempted-murders.dbo.attempts') IS NOT NULL DROP TABLE "attempted-murders".dbo."attempts";

CREATE TABLE "attempted-murders"."dbo"."attempts" (
  "id" INT IDENTITY(1, 1),
  "date" DATE,
  "datetime" DATETIME,
  "datetime_ltz" DATETIMEOFFSET,
  "datetime_tz" DATETIMEOFFSET,
  "datetime_tz_id" DATETIMEOFFSET,
  "time" TIME,
  "time_ltz" TIME,
  "time_tz" TIME,
  "num_crows" INTEGER,
  PRIMARY KEY ("id")
);

-- 20 rows
INSERT INTO "attempted-murders"."dbo"."attempts" ("date", "datetime", "datetime_ltz", "datetime_tz", "datetime_tz_id", "time", "time_ltz", "time_tz", "num_crows")
VALUES
(
  DateFromParts(2019, 11, 1),
  DateTime2FromParts(2019, 11, 1, 0, 23, 18, 3310000, 7),
  DateTimeOffsetFromParts(2019, 11, 1, 0, 23, 18, 3310000, -7, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 1, 0, 23, 18, 3310000, -7, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 1, 0, 23, 18, 3310000, -7, 0, 7),
  TimeFromParts(0, 23, 18, 3310000, 7),
  TimeFromParts(7, 23, 18, 3310000, 7),
  TimeFromParts(7, 23, 18, 3310000, 7),
  6
),
(
  DateFromParts(2019, 11, 2),
  DateTime2FromParts(2019, 11, 2, 0, 14, 14, 2460000, 7),
  DateTimeOffsetFromParts(2019, 11, 2, 0, 14, 14, 2460000, -7, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 2, 0, 14, 14, 2460000, -7, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 2, 0, 14, 14, 2460000, -7, 0, 7),
  TimeFromParts(0, 14, 14, 2460000, 7),
  TimeFromParts(7, 14, 14, 2460000, 7),
  TimeFromParts(7, 14, 14, 2460000, 7),
  8
),
(
  DateFromParts(2019, 11, 3),
  DateTime2FromParts(2019, 11, 3, 23, 35, 17, 9060000, 7),
  DateTimeOffsetFromParts(2019, 11, 3, 23, 35, 17, 9060000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 3, 23, 35, 17, 9060000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 3, 23, 35, 17, 9060000, -8, 0, 7),
  TimeFromParts(23, 35, 17, 9060000, 7),
  TimeFromParts(7, 35, 17, 9060000, 7),
  TimeFromParts(7, 35, 17, 9060000, 7),
  6
),
(
  DateFromParts(2019, 11, 4),
  DateTime2FromParts(2019, 11, 4, 1, 4, 9, 5930000, 7),
  DateTimeOffsetFromParts(2019, 11, 4, 1, 4, 9, 5930000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 4, 1, 4, 9, 5930000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 4, 1, 4, 9, 5930000, -8, 0, 7),
  TimeFromParts(1, 4, 9, 5930000, 7),
  TimeFromParts(9, 4, 9, 5930000, 7),
  TimeFromParts(9, 4, 9, 5930000, 7),
  7
),
(
  DateFromParts(2019, 11, 5),
  DateTime2FromParts(2019, 11, 5, 14, 23, 46, 4110000, 7),
  DateTimeOffsetFromParts(2019, 11, 5, 14, 23, 46, 4110000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 5, 14, 23, 46, 4110000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 5, 14, 23, 46, 4110000, -8, 0, 7),
  TimeFromParts(14, 23, 46, 4110000, 7),
  TimeFromParts(22, 23, 46, 4110000, 7),
  TimeFromParts(22, 23, 46, 4110000, 7),
  8
),
(
  DateFromParts(2019, 11, 6),
  DateTime2FromParts(2019, 11, 6, 18, 51, 16, 2700000, 7),
  DateTimeOffsetFromParts(2019, 11, 6, 18, 51, 16, 2700000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 6, 18, 51, 16, 2700000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 6, 18, 51, 16, 2700000, -8, 0, 7),
  TimeFromParts(18, 51, 16, 2700000, 7),
  TimeFromParts(2, 51, 16, 2700000, 7),
  TimeFromParts(2, 51, 16, 2700000, 7),
  4
),
(
  DateFromParts(2019, 11, 7),
  DateTime2FromParts(2019, 11, 7, 2, 45, 34, 4430000, 7),
  DateTimeOffsetFromParts(2019, 11, 7, 2, 45, 34, 4430000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 7, 2, 45, 34, 4430000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 7, 2, 45, 34, 4430000, -8, 0, 7),
  TimeFromParts(2, 45, 34, 4430000, 7),
  TimeFromParts(10, 45, 34, 4430000, 7),
  TimeFromParts(10, 45, 34, 4430000, 7),
  6
),
(
  DateFromParts(2019, 11, 8),
  DateTime2FromParts(2019, 11, 8, 19, 51, 39, 7530000, 7),
  DateTimeOffsetFromParts(2019, 11, 8, 19, 51, 39, 7530000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 8, 19, 51, 39, 7530000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 8, 19, 51, 39, 7530000, -8, 0, 7),
  TimeFromParts(19, 51, 39, 7530000, 7),
  TimeFromParts(3, 51, 39, 7530000, 7),
  TimeFromParts(3, 51, 39, 7530000, 7),
  4
),
(
  DateFromParts(2019, 11, 9),
  DateTime2FromParts(2019, 11, 9, 9, 59, 10, 4830000, 7),
  DateTimeOffsetFromParts(2019, 11, 9, 9, 59, 10, 4830000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 9, 9, 59, 10, 4830000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 9, 9, 59, 10, 4830000, -8, 0, 7),
  TimeFromParts(9, 59, 10, 4830000, 7),
  TimeFromParts(17, 59, 10, 4830000, 7),
  TimeFromParts(17, 59, 10, 4830000, 7),
  3
),
(
  DateFromParts(2019, 11, 10),
  DateTime2FromParts(2019, 11, 10, 8, 41, 35, 8600000, 7),
  DateTimeOffsetFromParts(2019, 11, 10, 8, 41, 35, 8600000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 10, 8, 41, 35, 8600000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 10, 8, 41, 35, 8600000, -8, 0, 7),
  TimeFromParts(8, 41, 35, 8600000, 7),
  TimeFromParts(16, 41, 35, 8600000, 7),
  TimeFromParts(16, 41, 35, 8600000, 7),
  1
),
(
  DateFromParts(2019, 11, 11),
  DateTime2FromParts(2019, 11, 11, 8, 9, 8, 8920000, 7),
  DateTimeOffsetFromParts(2019, 11, 11, 8, 9, 8, 8920000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 11, 8, 9, 8, 8920000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 11, 8, 9, 8, 8920000, -8, 0, 7),
  TimeFromParts(8, 9, 8, 8920000, 7),
  TimeFromParts(16, 9, 8, 8920000, 7),
  TimeFromParts(16, 9, 8, 8920000, 7),
  5
),
(
  DateFromParts(2019, 11, 12),
  DateTime2FromParts(2019, 11, 12, 7, 36, 16, 880000, 7),
  DateTimeOffsetFromParts(2019, 11, 12, 7, 36, 16, 880000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 12, 7, 36, 16, 880000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 12, 7, 36, 16, 880000, -8, 0, 7),
  TimeFromParts(7, 36, 16, 880000, 7),
  TimeFromParts(15, 36, 16, 880000, 7),
  TimeFromParts(15, 36, 16, 880000, 7),
  3
),
(
  DateFromParts(2019, 11, 13),
  DateTime2FromParts(2019, 11, 13, 4, 28, 40, 4890000, 7),
  DateTimeOffsetFromParts(2019, 11, 13, 4, 28, 40, 4890000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 13, 4, 28, 40, 4890000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 13, 4, 28, 40, 4890000, -8, 0, 7),
  TimeFromParts(4, 28, 40, 4890000, 7),
  TimeFromParts(12, 28, 40, 4890000, 7),
  TimeFromParts(12, 28, 40, 4890000, 7),
  2
),
(
  DateFromParts(2019, 11, 14),
  DateTime2FromParts(2019, 11, 14, 9, 52, 17, 2420000, 7),
  DateTimeOffsetFromParts(2019, 11, 14, 9, 52, 17, 2420000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 14, 9, 52, 17, 2420000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 14, 9, 52, 17, 2420000, -8, 0, 7),
  TimeFromParts(9, 52, 17, 2420000, 7),
  TimeFromParts(17, 52, 17, 2420000, 7),
  TimeFromParts(17, 52, 17, 2420000, 7),
  9
),
(
  DateFromParts(2019, 11, 15),
  DateTime2FromParts(2019, 11, 15, 16, 7, 25, 2920000, 7),
  DateTimeOffsetFromParts(2019, 11, 15, 16, 7, 25, 2920000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 15, 16, 7, 25, 2920000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 15, 16, 7, 25, 2920000, -8, 0, 7),
  TimeFromParts(16, 7, 25, 2920000, 7),
  TimeFromParts(0, 7, 25, 2920000, 7),
  TimeFromParts(0, 7, 25, 2920000, 7),
  7
),
(
  DateFromParts(2019, 11, 16),
  DateTime2FromParts(2019, 11, 16, 13, 32, 16, 9360000, 7),
  DateTimeOffsetFromParts(2019, 11, 16, 13, 32, 16, 9360000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 16, 13, 32, 16, 9360000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 16, 13, 32, 16, 9360000, -8, 0, 7),
  TimeFromParts(13, 32, 16, 9360000, 7),
  TimeFromParts(21, 32, 16, 9360000, 7),
  TimeFromParts(21, 32, 16, 9360000, 7),
  7
),
(
  DateFromParts(2019, 11, 17),
  DateTime2FromParts(2019, 11, 17, 14, 11, 38, 760000, 7),
  DateTimeOffsetFromParts(2019, 11, 17, 14, 11, 38, 760000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 17, 14, 11, 38, 760000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 17, 14, 11, 38, 760000, -8, 0, 7),
  TimeFromParts(14, 11, 38, 760000, 7),
  TimeFromParts(22, 11, 38, 760000, 7),
  TimeFromParts(22, 11, 38, 760000, 7),
  1
),
(
  DateFromParts(2019, 11, 18),
  DateTime2FromParts(2019, 11, 18, 20, 47, 27, 9020000, 7),
  DateTimeOffsetFromParts(2019, 11, 18, 20, 47, 27, 9020000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 18, 20, 47, 27, 9020000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 18, 20, 47, 27, 9020000, -8, 0, 7),
  TimeFromParts(20, 47, 27, 9020000, 7),
  TimeFromParts(4, 47, 27, 9020000, 7),
  TimeFromParts(4, 47, 27, 9020000, 7),
  3
),
(
  DateFromParts(2019, 11, 19),
  DateTime2FromParts(2019, 11, 19, 0, 35, 23, 1460000, 7),
  DateTimeOffsetFromParts(2019, 11, 19, 0, 35, 23, 1460000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 19, 0, 35, 23, 1460000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 19, 0, 35, 23, 1460000, -8, 0, 7),
  TimeFromParts(0, 35, 23, 1460000, 7),
  TimeFromParts(8, 35, 23, 1460000, 7),
  TimeFromParts(8, 35, 23, 1460000, 7),
  5
),
(
  DateFromParts(2019, 11, 20),
  DateTime2FromParts(2019, 11, 20, 20, 9, 55, 7520000, 7),
  DateTimeOffsetFromParts(2019, 11, 20, 20, 9, 55, 7520000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 20, 20, 9, 55, 7520000, -8, 0, 7),
  DateTimeOffsetFromParts(2019, 11, 20, 20, 9, 55, 7520000, -8, 0, 7),
  TimeFromParts(20, 9, 55, 7520000, 7),
  TimeFromParts(4, 9, 55, 7520000, 7),
  TimeFromParts(4, 9, 55, 7520000, 7),
  1
);

