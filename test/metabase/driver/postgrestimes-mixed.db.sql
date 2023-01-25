SET
  SESSION TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "times";

CREATE TABLE "times" (
  "id" SERIAL,
  "index" INTEGER,
  "dt" TIMESTAMP,
  "dt_tz" TIMESTAMP WITH TIME ZONE,
  "d" DATE,
  "as_dt" TEXT,
  "as_d" TEXT,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "weeks";

CREATE TABLE "weeks" (
  "id" SERIAL,
  "index" INTEGER,
  "description" TEXT,
  "d" DATE,
  PRIMARY KEY ("id")
);
