
DROP TABLE IF EXISTS "test-data"."default"."string_times_times"

CREATE TABLE "test-data"."default"."string_times_times" AS
SELECT
  *
FROM
  (
    VALUES
      (
        1,
        cast('' AS VARCHAR),
        cast('' AS VARCHAR),
        cast('' AS VARCHAR),
        cast('' AS VARCHAR)
      )
  ) AS t ("id", "name", "ts", "d", "t")
WHERE
  1 = 0

-- 3 rows
INSERT INTO "test-data"."default"."string_times_times" ("id", "name", "ts", "d", "t")
VALUES
(1, 'foo', '2004-10-19 10:23:54', '2004-10-19', '10:23:54'),
(2, 'bar', '2008-10-19 10:23:54', '2008-10-19', '10:23:54'),
(3, 'baz', '2012-10-19 10:23:54', '2012-10-19', '10:23:54');

