
DROP TABLE IF EXISTS ` incidents `

CREATE TABLE ` incidents ` (` id ` INT, ` severity ` INTEGER, ` timestamp ` BIGINT)

-- 2 rows
INSERT INTO "incidents" ("id", "severity", "timestamp")
VALUES
(1, 4, 1433587200000000),
(2, 0, 1433965860000000);

