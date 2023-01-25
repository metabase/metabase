
DROP TABLE IF EXISTS "test-data"."default"."icrosecond_incidents_incidents"

CREATE TABLE "test-data"."default"."icrosecond_incidents_incidents" AS
SELECT
  *
FROM
  (
    VALUES
      (1, 1, cast(1 AS bigint))
  ) AS t ("id", "severity", "timestamp")
WHERE
  1 = 0

-- 2 rows
INSERT INTO "test-data"."default"."icrosecond_incidents_incidents" ("id", "severity", "timestamp")
VALUES
(1, 4, 1433587200000000),
(2, 0, 1433965860000000);

