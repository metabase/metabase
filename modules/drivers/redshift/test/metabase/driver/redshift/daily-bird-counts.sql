SET
  TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "schema_20"."daily_bird_counts_bird_count" CASCADE;

CREATE TABLE "schema_20"."daily_bird_counts_bird_count" (
  "id" INTEGER IDENTITY(1, 1),
  "date" DATE,
  "count" INTEGER,
  PRIMARY KEY ("id")
);

-- 30 rows
INSERT INTO "schema_20"."daily_bird_counts_bird_count" ("date", "count")
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

