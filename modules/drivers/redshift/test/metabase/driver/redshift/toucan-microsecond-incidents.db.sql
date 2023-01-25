SET
  TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "schema_201"."icrosecond_incidents_incidents" CASCADE;

CREATE TABLE "schema_201"."icrosecond_incidents_incidents" (
  "id" INTEGER IDENTITY(1, 1),
  "severity" INTEGER,
  "timestamp" BIGINT,
  PRIMARY KEY ("id")
);

-- 2 rows
INSERT INTO "schema_201"."icrosecond_incidents_incidents" ("id", "severity", "timestamp")
VALUES
(1, 4, 1433587200000000),
(2, 0, 1433965860000000);

