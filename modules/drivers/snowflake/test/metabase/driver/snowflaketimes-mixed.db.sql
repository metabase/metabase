ALTER SESSION
SET
  TIMEZONE = 'UTC';

DROP TABLE IF EXISTS "times-mixed"."PUBLIC"."times";

CREATE TABLE "times-mixed"."PUBLIC"."times" (
  "id" INTEGER AUTOINCREMENT,
  "index" INTEGER,
  "dt" TIMESTAMP_NTZ,
  "dt_tz" TIMESTAMP_TZ,
  "d" DATE,
  "as_dt" TEXT,
  "as_d" TEXT,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "times-mixed"."PUBLIC"."weeks";

CREATE TABLE "times-mixed"."PUBLIC"."weeks" (
  "id" INTEGER AUTOINCREMENT,
  "index" INTEGER,
  "description" TEXT,
  "d" DATE,
  PRIMARY KEY ("id")
);
