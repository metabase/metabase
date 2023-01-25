
DROP TABLE IF EXISTS "TIMES";

CREATE TABLE "TIMES" (
  "ID" BIGINT AUTO_INCREMENT,
  "NAME" VARCHAR,
  "AS_BYTES" BYTEA,
  PRIMARY KEY ("ID")
);

;

GRANT ALL ON "TIMES" TO GUEST;

-- 3 rows
INSERT INTO "TIMES" ("ID", "NAME", "AS_BYTES")
VALUES
(
  1,
  'foo',
  2023 -01 -25 02: 03: 25,
  369 WARN util.unprepare:: Don 't know how to unprepare values of class [B
[B@7cc51dd9),
(
  2,
  'bar',
  2023 -01 -25 02: 03: 25,
  369 WARN util.unprepare:: Don 't know how to unprepare values of class [B
[B@188b50a5),
(
  3,
  'baz',
  2023 -01 -25 02: 03: 25,
  369 WARN util.unprepare:: Don 't know how to unprepare values of class [B
[B@36c845d6);

