
DROP TABLE IF EXISTS "TIMES";

CREATE TABLE "TIMES" (
  "ID" BIGINT AUTO_INCREMENT,
  "A_DT_TZ" TIMESTAMP WITH TIME ZONE,
  "B_DT_TZ" TIMESTAMP WITH TIME ZONE,
  "A_DT_TZ_TEXT" VARCHAR,
  "B_DT_TZ_TEXT" VARCHAR,
  PRIMARY KEY ("ID")
);

;

GRANT ALL ON "TIMES" TO GUEST;

-- 35 rows
INSERT INTO "TIMES" ("ID", "A_DT_TZ", "B_DT_TZ", "A_DT_TZ_TEXT", "B_DT_TZ_TEXT")
VALUES
(1, timestamp with time zone '2022-10-02 00:00:00.000Z', timestamp with time zone '2022-10-03 00:00:00.000+01:00', '2022-10-02T00:00:00Z', '2022-10-03T00:00:00+01:00'),
(2, timestamp with time zone '2022-10-02 00:00:00.000Z', timestamp with time zone '2022-10-09 00:00:00.000+01:00', '2022-10-02T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(3, timestamp with time zone '2022-10-02 00:00:00.000Z', timestamp with time zone '2022-11-02 00:00:00.000+01:00', '2022-10-02T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(4, timestamp with time zone '2022-10-02 00:00:00.000Z', timestamp with time zone '2023-01-02 00:00:00.000+01:00', '2022-10-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(5, timestamp with time zone '2022-10-02 00:00:00.000Z', timestamp with time zone '2023-10-02 00:00:00.000+01:00', '2022-10-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(6, timestamp with time zone '2022-10-02 01:00:00.000+01:00', timestamp with time zone '2022-10-03 00:00:00.000Z', '2022-10-02T01:00:00+01:00', '2022-10-03T00:00:00Z'),
(7, timestamp with time zone '2022-10-02 01:00:00.000+01:00', timestamp with time zone '2022-10-09 00:00:00.000Z', '2022-10-02T01:00:00+01:00', '2022-10-09T00:00:00Z'),
(8, timestamp with time zone '2022-10-02 01:00:00.000+01:00', timestamp with time zone '2022-11-02 00:00:00.000Z', '2022-10-02T01:00:00+01:00', '2022-11-02T00:00:00Z'),
(9, timestamp with time zone '2022-10-02 01:00:00.000+01:00', timestamp with time zone '2023-01-02 00:00:00.000Z', '2022-10-02T01:00:00+01:00', '2023-01-02T00:00:00Z'),
(10, timestamp with time zone '2022-10-02 01:00:00.000+01:00', timestamp with time zone '2023-10-02 00:00:00.000Z', '2022-10-02T01:00:00+01:00', '2023-10-02T00:00:00Z'),
(11, timestamp with time zone '2022-10-03 00:00:00.000Z', timestamp with time zone '2022-10-09 00:00:00.000+01:00', '2022-10-03T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(12, timestamp with time zone '2022-10-03 00:00:00.000Z', timestamp with time zone '2022-11-02 00:00:00.000+01:00', '2022-10-03T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(13, timestamp with time zone '2022-10-03 00:00:00.000Z', timestamp with time zone '2023-01-02 00:00:00.000+01:00', '2022-10-03T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(14, timestamp with time zone '2022-10-03 00:00:00.000Z', timestamp with time zone '2023-10-02 00:00:00.000+01:00', '2022-10-03T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(15, timestamp with time zone '2022-10-03 00:00:00.000+01:00', timestamp with time zone '2022-10-03 00:00:00.000Z', '2022-10-03T00:00:00+01:00', '2022-10-03T00:00:00Z'),
(16, timestamp with time zone '2022-10-03 00:00:00.000+01:00', timestamp with time zone '2022-10-09 00:00:00.000Z', '2022-10-03T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(17, timestamp with time zone '2022-10-03 00:00:00.000+01:00', timestamp with time zone '2022-11-02 00:00:00.000Z', '2022-10-03T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(18, timestamp with time zone '2022-10-03 00:00:00.000+01:00', timestamp with time zone '2023-01-02 00:00:00.000Z', '2022-10-03T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(19, timestamp with time zone '2022-10-03 00:00:00.000+01:00', timestamp with time zone '2023-10-02 00:00:00.000Z', '2022-10-03T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(20, timestamp with time zone '2022-10-09 00:00:00.000Z', timestamp with time zone '2022-11-02 00:00:00.000+01:00', '2022-10-09T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(21, timestamp with time zone '2022-10-09 00:00:00.000Z', timestamp with time zone '2023-01-02 00:00:00.000+01:00', '2022-10-09T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(22, timestamp with time zone '2022-10-09 00:00:00.000Z', timestamp with time zone '2023-10-02 00:00:00.000+01:00', '2022-10-09T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(23, timestamp with time zone '2022-10-09 00:00:00.000+01:00', timestamp with time zone '2022-10-09 00:00:00.000Z', '2022-10-09T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(24, timestamp with time zone '2022-10-09 00:00:00.000+01:00', timestamp with time zone '2022-11-02 00:00:00.000Z', '2022-10-09T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(25, timestamp with time zone '2022-10-09 00:00:00.000+01:00', timestamp with time zone '2023-01-02 00:00:00.000Z', '2022-10-09T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(26, timestamp with time zone '2022-10-09 00:00:00.000+01:00', timestamp with time zone '2023-10-02 00:00:00.000Z', '2022-10-09T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(27, timestamp with time zone '2022-11-02 00:00:00.000Z', timestamp with time zone '2023-01-02 00:00:00.000+01:00', '2022-11-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(28, timestamp with time zone '2022-11-02 00:00:00.000Z', timestamp with time zone '2023-10-02 00:00:00.000+01:00', '2022-11-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(29, timestamp with time zone '2022-11-02 00:00:00.000+01:00', timestamp with time zone '2022-11-02 00:00:00.000Z', '2022-11-02T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(30, timestamp with time zone '2022-11-02 00:00:00.000+01:00', timestamp with time zone '2023-01-02 00:00:00.000Z', '2022-11-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(31, timestamp with time zone '2022-11-02 00:00:00.000+01:00', timestamp with time zone '2023-10-02 00:00:00.000Z', '2022-11-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(32, timestamp with time zone '2023-01-02 00:00:00.000Z', timestamp with time zone '2023-10-02 00:00:00.000+01:00', '2023-01-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(33, timestamp with time zone '2023-01-02 00:00:00.000+01:00', timestamp with time zone '2023-01-02 00:00:00.000Z', '2023-01-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(34, timestamp with time zone '2023-01-02 00:00:00.000+01:00', timestamp with time zone '2023-10-02 00:00:00.000Z', '2023-01-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(35, timestamp with time zone '2023-10-02 00:00:00.000+01:00', timestamp with time zone '2023-10-02 00:00:00.000Z', '2023-10-02T00:00:00+01:00', '2023-10-02T00:00:00Z');

