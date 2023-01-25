
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
