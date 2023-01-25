
DROP TABLE IF EXISTS "test-data"."default"."yyyymmddhhss_times_times"

CREATE TABLE "test-data"."default"."yyyymmddhhss_times_times" AS
SELECT
  *
FROM
  (
    VALUES
      (1, cast('' AS VARCHAR), cast('' AS VARCHAR))
  ) AS t ("id", "name", "as_text")
WHERE
  1 = 0

-- 3 rows
INSERT INTO "test-data"."default"."yyyymmddhhss_times_times" ("id", "name", "as_text")
VALUES
(1, 'foo', '20190421164300'),
(2, 'bar', '20200421164300'),
(3, 'baz', '20210421164300');

