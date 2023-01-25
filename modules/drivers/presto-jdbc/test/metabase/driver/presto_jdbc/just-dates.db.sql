
DROP TABLE IF EXISTS "test_data"."default"."just_dates_just_dates";

CREATE TABLE "test_data"."default"."just_dates_just_dates" ("id" INTEGER, "name" VARCHAR, "ts" VARCHAR, "d" VARCHAR);

-- 3 rows
INSERT INTO "test_data"."default"."just_dates_just_dates" ("id", "name", "ts", "d")
VALUES
(1, 'foo', '2004-10-19 10:23:54', '2004-10-19'),
(2, 'bar', '2008-10-19 10:23:54', '2008-10-19'),
(3, 'baz', '2012-10-19 10:23:54', '2012-10-19');

