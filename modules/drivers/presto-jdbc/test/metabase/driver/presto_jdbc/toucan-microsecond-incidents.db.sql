
DROP TABLE IF EXISTS "test_data"."default"."icrosecond_incidents_incidents";

CREATE TABLE "test_data"."default"."icrosecond_incidents_incidents" ("id" INTEGER, "severity" INTEGER, "timestamp" BIGINT);

-- 2 rows
INSERT INTO "test_data"."default"."icrosecond_incidents_incidents" ("id", "severity", "timestamp")
VALUES
(1, 4, 1433587200000000),
(2, 0, 1433965860000000);

