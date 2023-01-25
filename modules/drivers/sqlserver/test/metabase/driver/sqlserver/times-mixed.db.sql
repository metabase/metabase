
IF object_id('times-mixed.dbo.times') IS NOT NULL DROP TABLE "times-mixed".dbo."times";

CREATE TABLE "times-mixed"."dbo"."times" (
  "id" INT IDENTITY(1, 1),
  "index" INTEGER,
  "dt" DATETIME,
  "dt_tz" DATETIMEOFFSET,
  "d" DATE,
  "as_dt" VARCHAR(1024),
  "as_d" VARCHAR(1024),
  PRIMARY KEY ("id")
);

IF object_id('times-mixed.dbo.weeks') IS NOT NULL DROP TABLE "times-mixed".dbo."weeks";

CREATE TABLE "times-mixed"."dbo"."weeks" (
  "id" INT IDENTITY(1, 1),
  "index" INTEGER,
  "description" VARCHAR(1024),
  "d" DATE,
  PRIMARY KEY ("id")
);

-- 4 rows
INSERT INTO "times-mixed"."dbo"."times" ("id", "index", "dt", "dt_tz", "d", "as_dt", "as_d")
VALUES
(1, 1, DateTime2FromParts(2004, 3, 19, 9, 19, 9, 0, 7), DateTimeOffsetFromParts(2004, 3, 19, 9, 19, 9, 0, 7, 0, 7), DateFromParts(2004, 3, 19), '2004-03-19 09:19:09', '2004-03-19'),
(2, 2, DateTime2FromParts(2008, 6, 20, 10, 20, 10, 0, 7), DateTimeOffsetFromParts(2008, 6, 20, 10, 20, 10, 0, 7, 0, 7), DateFromParts(2008, 6, 20), '2008-06-20 10:20:10', '2008-06-20'),
(3, 3, DateTime2FromParts(2012, 11, 21, 11, 21, 11, 0, 7), DateTimeOffsetFromParts(2012, 11, 21, 11, 21, 11, 0, 7, 0, 7), DateFromParts(2012, 11, 21), '2012-11-21 11:21:11', '2012-11-21'),
(4, 4, DateTime2FromParts(2012, 11, 21, 11, 21, 11, 0, 7), DateTimeOffsetFromParts(2012, 11, 21, 11, 21, 11, 0, 7, 0, 7), DateFromParts(2012, 11, 21), '2012-11-21 11:21:11', '2012-11-21');

-- 10 rows
INSERT INTO "times-mixed"."dbo"."weeks" ("id", "index", "description", "d")
VALUES
(1, 1, '1st saturday', DateFromParts(2000, 1, 1)),
(2, 2, '1st sunday', DateFromParts(2000, 1, 2)),
(3, 3, '1st monday', DateFromParts(2000, 1, 3)),
(4, 4, '1st wednesday', DateFromParts(2000, 1, 4)),
(5, 5, '1st tuesday', DateFromParts(2000, 1, 5)),
(6, 6, '1st thursday', DateFromParts(2000, 1, 6)),
(7, 7, '1st friday', DateFromParts(2000, 1, 7)),
(8, 8, '2nd saturday', DateFromParts(2000, 1, 8)),
(9, 9, '2nd sunday', DateFromParts(2000, 1, 9)),
(10, 10, '2005 saturday', DateFromParts(2005, 1, 1));

