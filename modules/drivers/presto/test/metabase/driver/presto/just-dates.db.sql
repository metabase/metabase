
DROP TABLE IF EXISTS "test-data"."default"."just_dates_just_dates"

CREATE TABLE "test-data"."default"."just_dates_just_dates" AS
SELECT
  *
FROM
  (
    VALUES
      (
        1,
        cast('' AS VARCHAR),
        cast('' AS VARCHAR),
        cast('' AS VARCHAR)
      )
  ) AS t ("id", "name", "ts", "d")
WHERE
  1 = 0

-- 3 rows
INSERT INTO "test-data"."default"."just_dates_just_dates" ("id", "name", "ts", "d")
VALUES
(1, 'foo', '2004-10-19 10:23:54', '2004-10-19'),
(2, 'bar', '2008-10-19 10:23:54', '2008-10-19'),
(3, 'baz', '2012-10-19 10:23:54', '2012-10-19');

