ALTER SESSION
SET
  TIMEZONE = 'UTC';

DROP TABLE IF EXISTS "toucan-microsecond-incidents"."PUBLIC"."incidents";

CREATE TABLE "toucan-microsecond-incidents"."PUBLIC"."incidents" (
  "id" INTEGER AUTOINCREMENT,
  "severity" INTEGER,
  "timestamp" BIGINT,
  PRIMARY KEY ("id")
);

-- 2 rows
INSERT INTO "toucan-microsecond-incidents"."PUBLIC"."incidents" ("id", "severity", "timestamp")
VALUES
(1, 4, 1433587200000000),
(2, 0, 1433965860000000);

