SET
  TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "schema_201"."string_times_times" CASCADE;

CREATE TABLE "schema_201"."string_times_times" (
  "id" INTEGER IDENTITY(1, 1),
  "name" VARCHAR(1024),
  "ts" VARCHAR(1024),
  "d" VARCHAR(1024),
  "t" VARCHAR(1024),
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "schema_201"."string_times_times" ("id", "name", "ts", "d", "t")
VALUES
(1, 'foo', '2004-10-19 10:23:54', '2004-10-19', '10:23:54'),
(2, 'bar', '2008-10-19 10:23:54', '2008-10-19', '10:23:54'),
(3, 'baz', '2012-10-19 10:23:54', '2012-10-19', '10:23:54');

