
DROP TABLE IF EXISTS "TIMES";

CREATE TABLE "TIMES" (
  "ID" BIGINT AUTO_INCREMENT,
  "INDEX" INTEGER,
  "DT" DATETIME,
  "DT_TZ" TIMESTAMP WITH TIME ZONE,
  "D" DATE,
  "AS_DT" VARCHAR,
  "AS_D" VARCHAR,
  PRIMARY KEY ("ID")
);

;

GRANT ALL ON "TIMES" TO GUEST;

DROP TABLE IF EXISTS "WEEKS";

CREATE TABLE "WEEKS" (
  "ID" BIGINT AUTO_INCREMENT,
  "INDEX" INTEGER,
  "DESCRIPTION" VARCHAR,
  "D" DATE,
  PRIMARY KEY ("ID")
);

;

GRANT ALL ON "WEEKS" TO GUEST;

-- 4 rows
INSERT INTO "TIMES" ("ID", "INDEX", "DT", "DT_TZ", "D", "AS_DT", "AS_D")
VALUES
(1, 1, timestamp '2004-03-19 09:19:09.000', timestamp with time zone '2004-03-19 09:19:09.000+07:00', date '2004-03-19', '2004-03-19 09:19:09', '2004-03-19'),
(2, 2, timestamp '2008-06-20 10:20:10.000', timestamp with time zone '2008-06-20 10:20:10.000+07:00', date '2008-06-20', '2008-06-20 10:20:10', '2008-06-20'),
(3, 3, timestamp '2012-11-21 11:21:11.000', timestamp with time zone '2012-11-21 11:21:11.000+07:00', date '2012-11-21', '2012-11-21 11:21:11', '2012-11-21'),
(4, 4, timestamp '2012-11-21 11:21:11.000', timestamp with time zone '2012-11-21 11:21:11.000+07:00', date '2012-11-21', '2012-11-21 11:21:11', '2012-11-21');

-- 10 rows
INSERT INTO "WEEKS" ("ID", "INDEX", "DESCRIPTION", "D")
VALUES
(1, 1, '1st saturday', date '2000-01-01'),
(2, 2, '1st sunday', date '2000-01-02'),
(3, 3, '1st monday', date '2000-01-03'),
(4, 4, '1st wednesday', date '2000-01-04'),
(5, 5, '1st tuesday', date '2000-01-05'),
(6, 6, '1st thursday', date '2000-01-06'),
(7, 7, '1st friday', date '2000-01-07'),
(8, 8, '2nd saturday', date '2000-01-08'),
(9, 9, '2nd sunday', date '2000-01-09'),
(10, 10, '2005 saturday', date '2005-01-01');

