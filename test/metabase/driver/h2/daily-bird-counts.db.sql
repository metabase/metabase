-- Create a non-admin account 'GUEST' which will be used from here on out
CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';

-- Set DB_CLOSE_DELAY here because only admins are allowed to do it, so we can't set it via the connection string.
-- Set it to to -1 (no automatic closing)
SET DB_CLOSE_DELAY -1;

DROP TABLE IF EXISTS "BIRD-COUNT";

CREATE TABLE "BIRD-COUNT" (
  "ID" BIGINT AUTO_INCREMENT,
  "DATE" DATE,
  "COUNT" INTEGER,
  PRIMARY KEY ("ID")
);

;

GRANT ALL ON "BIRD-COUNT" TO GUEST;

-- 30 rows
INSERT INTO "BIRD-COUNT" ("DATE", "COUNT")
VALUES
(date '2018-09-20', NULL),
(date '2018-09-21', 0),
(date '2018-09-22', 0),
(date '2018-09-23', 10),
(date '2018-09-24', 8),
(date '2018-09-25', 5),
(date '2018-09-26', 5),
(date '2018-09-27', NULL),
(date '2018-09-28', 0),
(date '2018-09-29', 0),
(date '2018-09-30', 11),
(date '2018-10-01', 14),
(date '2018-10-02', 8),
(date '2018-10-03', 14),
(date '2018-10-04', NULL),
(date '2018-10-05', 6),
(date '2018-10-06', 4),
(date '2018-10-07', 0),
(date '2018-10-08', NULL),
(date '2018-10-09', 3),
(date '2018-10-10', 13),
(date '2018-10-11', NULL),
(date '2018-10-12', 14),
(date '2018-10-13', 6),
(date '2018-10-14', 12),
(date '2018-10-15', 13),
(date '2018-10-16', 0),
(date '2018-10-17', 7),
(date '2018-10-18', 10),
(date '2018-10-19', 5);
