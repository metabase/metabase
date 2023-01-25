
DROP TABLE IF EXISTS "test_data"."default"."string_times_times";

CREATE TABLE "test_data"."default"."string_times_times" (
  "id" INTEGER,
  "name" VARCHAR,
  "ts" VARCHAR,
  "d" VARCHAR,
  "t" VARCHAR
);

-- 3 rows
INSERT INTO "test_data"."default"."string_times_times" ("id", "name", "ts", "d", "t")
VALUES
(1, 'foo', '2004-10-19 10:23:54', '2004-10-19', '10:23:54'),
(2, 'bar', '2008-10-19 10:23:54', '2008-10-19', '10:23:54'),
(3, 'baz', '2012-10-19 10:23:54', '2012-10-19', '10:23:54');

