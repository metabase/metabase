SET
  TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "schema_201"."yyyymmddhhss_times_times" CASCADE;

CREATE TABLE "schema_201"."yyyymmddhhss_times_times" (
  "id" INTEGER IDENTITY(1, 1),
  "name" VARCHAR(1024),
  "as_text" VARCHAR(1024),
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "schema_201"."yyyymmddhhss_times_times" ("id", "name", "as_text")
VALUES
(1, 'foo', '20190421164300'),
(2, 'bar', '20200421164300'),
(3, 'baz', '20210421164300');

