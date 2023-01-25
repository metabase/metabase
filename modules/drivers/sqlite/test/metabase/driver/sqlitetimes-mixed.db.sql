2023-01-25 00:30:09,460 INFO data.sql :: No test data type mapping for driver :sqlite for base type :type/DateTimeWithTZ, falling back to ancestor base type :type/DateTime

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
