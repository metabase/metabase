
DROP TABLE IF EXISTS "test_data"."default"."yyyymmddhhss_times_times";

CREATE TABLE "test_data"."default"."yyyymmddhhss_times_times" ("id" INTEGER, "name" VARCHAR, "as_text" VARCHAR);

-- 3 rows
INSERT INTO "test_data"."default"."yyyymmddhhss_times_times" ("id", "name", "as_text")
VALUES
(1, 'foo', '20190421164300'),
(2, 'bar', '20200421164300'),
(3, 'baz', '20210421164300');

