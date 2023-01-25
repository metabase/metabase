ALTER SESSION
SET
  TIMEZONE = 'UTC';

DROP TABLE IF EXISTS "yyyymmddhhss-times"."PUBLIC"."times";

CREATE TABLE "yyyymmddhhss-times"."PUBLIC"."times" (
  "id" INTEGER AUTOINCREMENT,
  "name" TEXT,
  "as_text" TEXT,
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "yyyymmddhhss-times"."PUBLIC"."times" ("id", "name", "as_text")
VALUES
(1, 'foo', '20190421164300'),
(2, 'bar', '20200421164300'),
(3, 'baz', '20210421164300');

