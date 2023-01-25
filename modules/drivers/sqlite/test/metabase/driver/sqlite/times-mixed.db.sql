2023-01-25 00:39:02,877 INFO data.sql :: No test data type mapping for driver :sqlite for base type :type/DateTimeWithTZ, falling back to ancestor base type :type/DateTime

DROP TABLE IF EXISTS "times";

CREATE TABLE "times" (
  "id" INTEGER,
  "index" INTEGER,
  "dt" DATETIME,
  "dt_tz" DATETIME,
  "d" DATE,
  "as_dt" TEXT,
  "as_d" TEXT,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "weeks";

CREATE TABLE "weeks" (
  "id" INTEGER,
  "index" INTEGER,
  "description" TEXT,
  "d" DATE,
  PRIMARY KEY ("id")
);

-- 4 rows
INSERT INTO "times" ("id", "index", "dt", "dt_tz", "d", "as_dt", "as_d")
VALUES
(1, 1, timestamp '2004-03-19 09:19:09.000', timestamp with time zone '2004-03-19 09:19:09.000+07:00', date '2004-03-19', '2004-03-19 09:19:09', '2004-03-19'),
(2, 2, timestamp '2008-06-20 10:20:10.000', timestamp with time zone '2008-06-20 10:20:10.000+07:00', date '2008-06-20', '2008-06-20 10:20:10', '2008-06-20'),
(3, 3, timestamp '2012-11-21 11:21:11.000', timestamp with time zone '2012-11-21 11:21:11.000+07:00', date '2012-11-21', '2012-11-21 11:21:11', '2012-11-21'),
(4, 4, timestamp '2012-11-21 11:21:11.000', timestamp with time zone '2012-11-21 11:21:11.000+07:00', date '2012-11-21', '2012-11-21 11:21:11', '2012-11-21');

-- 10 rows
INSERT INTO "weeks" ("id", "index", "description", "d")
VALUES
(1, 1, '1st saturday', date '2000-01-01'),
(2, 2, '1st sunday', date '2000-01-02'),
(3, 3, '1st monday', date '2000-01-03'),
(4, 4, '1st wednesday', date '2000-01-04'),
(5, 5, '1st tuesday', date '2000-01-05'),
(6, 6, '1st thursday', date '2000-01-06'),
(7, 7, '1st friday', date '2000-01-07'),
(8, 8, '2nd saturday', date '2000-01-08'),
(9, 9, '2nd sunday', date '2000-01-09'),
(10, 10, '2005 saturday', date '2005-01-01');

