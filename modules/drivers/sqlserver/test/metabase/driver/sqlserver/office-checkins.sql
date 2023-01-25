2023-01-21 01:09:13,989 INFO data.sql :: No test data type mapping for driver :sqlserver for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTimeWithTZ

IF object_id('office-checkins.dbo.checkins') IS NOT NULL DROP TABLE "office-checkins".dbo."checkins";

CREATE TABLE "office-checkins"."dbo"."checkins" (
  "id" INT IDENTITY(1, 1),
  "person" VARCHAR(1024),
  "timestamp" DATETIMEOFFSET,
  PRIMARY KEY ("id")
);

-- 10 rows
INSERT INTO "office-checkins"."dbo"."checkins" ("person", "timestamp")
VALUES
('Cam', DateTimeOffsetFromParts(2019, 1, 2, 5, 30, 0, 0, -7, 0, 7)),
('Cam', DateTimeOffsetFromParts(2019, 1, 9, 5, 30, 0, 0, -7, 0, 7)),
('Kyle', DateTimeOffsetFromParts(2019, 1, 6, 8, 30, 0, 0, -7, 0, 7)),
('Cam', DateTimeOffsetFromParts(2019, 1, 7, 4, 0, 0, 0, -7, 0, 7)),
('Sameer', DateTimeOffsetFromParts(2019, 1, 26, 16, 0, 0, 0, -7, 0, 7)),
('Cam', DateTimeOffsetFromParts(2019, 1, 16, 7, 15, 0, 0, -7, 0, 7)),
('Tom', DateTimeOffsetFromParts(2019, 1, 27, 1, 30, 0, 0, -7, 0, 7)),
('Sameer', DateTimeOffsetFromParts(2019, 1, 24, 14, 0, 0, 0, -7, 0, 7)),
('Maz', DateTimeOffsetFromParts(2019, 1, 28, 11, 45, 0, 0, -7, 0, 7)),
('Cam', DateTimeOffsetFromParts(2019, 1, 25, 7, 30, 0, 0, -7, 0, 7));

