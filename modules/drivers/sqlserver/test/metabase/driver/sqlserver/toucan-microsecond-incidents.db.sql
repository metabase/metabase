
IF object_id('toucan-microsecond-incidents.dbo.incidents') IS NOT NULL DROP TABLE "toucan-microsecond-incidents".dbo."incidents";

CREATE TABLE "toucan-microsecond-incidents"."dbo"."incidents" (
  "id" INT IDENTITY(1, 1),
  "severity" INTEGER,
  "timestamp" BIGINT,
  PRIMARY KEY ("id")
);

-- 2 rows
INSERT INTO "toucan-microsecond-incidents"."dbo"."incidents" ("id", "severity", "timestamp")
VALUES
(1, 4, 1433587200000000),
(2, 0, 1433965860000000);

