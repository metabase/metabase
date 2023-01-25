
IF object_id('daily-bird-counts.dbo.bird-count') IS NOT NULL DROP TABLE "daily-bird-counts".dbo."bird-count";

CREATE TABLE "daily-bird-counts"."dbo"."bird-count" (
  "id" INT IDENTITY(1, 1),
  "date" DATE,
  "count" INTEGER,
  PRIMARY KEY ("id")
);

-- 30 rows
INSERT INTO "daily-bird-counts"."dbo"."bird-count" ("date", "count")
VALUES
(DateFromParts(2018, 9, 20), NULL),
(DateFromParts(2018, 9, 21), 0),
(DateFromParts(2018, 9, 22), 0),
(DateFromParts(2018, 9, 23), 10),
(DateFromParts(2018, 9, 24), 8),
(DateFromParts(2018, 9, 25), 5),
(DateFromParts(2018, 9, 26), 5),
(DateFromParts(2018, 9, 27), NULL),
(DateFromParts(2018, 9, 28), 0),
(DateFromParts(2018, 9, 29), 0),
(DateFromParts(2018, 9, 30), 11),
(DateFromParts(2018, 10, 1), 14),
(DateFromParts(2018, 10, 2), 8),
(DateFromParts(2018, 10, 3), 14),
(DateFromParts(2018, 10, 4), NULL),
(DateFromParts(2018, 10, 5), 6),
(DateFromParts(2018, 10, 6), 4),
(DateFromParts(2018, 10, 7), 0),
(DateFromParts(2018, 10, 8), NULL),
(DateFromParts(2018, 10, 9), 3),
(DateFromParts(2018, 10, 10), 13),
(DateFromParts(2018, 10, 11), NULL),
(DateFromParts(2018, 10, 12), 14),
(DateFromParts(2018, 10, 13), 6),
(DateFromParts(2018, 10, 14), 12),
(DateFromParts(2018, 10, 15), 13),
(DateFromParts(2018, 10, 16), 0),
(DateFromParts(2018, 10, 17), 7),
(DateFromParts(2018, 10, 18), 10),
(DateFromParts(2018, 10, 19), 5);

