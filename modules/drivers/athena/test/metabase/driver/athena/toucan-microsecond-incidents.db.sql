
DROP TABLE IF EXISTS ` toucan_microsecond_incidents `.` incidents `

CREATE EXTERNAL TABLE ` toucan_microsecond_incidents `.` incidents ` (` id ` INT, ` severity ` INT, ` timestamp ` BIGINT) LOCATION 's3://metabase-ci-athena-results/toucan_microsecond_incidents/incidents/';

-- 2 rows
INSERT INTO "toucan_microsecond_incidents"."incidents" ("id", "severity", "timestamp")
VALUES
(1, 4, 1433587200000000),
(2, 0, 1433965860000000);

