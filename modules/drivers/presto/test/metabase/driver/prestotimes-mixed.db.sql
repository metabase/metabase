
DROP TABLE IF EXISTS "test-data"."default"."times_mixed_times"

CREATE TABLE "test-data"."default"."times_mixed_times" AS
SELECT
  *
FROM
  (
    VALUES
      (
        1,
        1,
        current_timestamp,
        current_timestamp,
        current_timestamp,
        cast('' AS VARCHAR),
        cast('' AS VARCHAR)
      )
  ) AS t ("id", "index", "dt", "dt_tz", "d", "as_dt", "as_d")
WHERE
  1 = 0

DROP TABLE IF EXISTS "test-data"."default"."times_mixed_weeks"

CREATE TABLE "test-data"."default"."times_mixed_weeks" AS
SELECT
  *
FROM
  (
    VALUES
      (1, 1, cast('' AS VARCHAR), current_timestamp)
  ) AS t ("id", "index", "description", "d")
WHERE
  1 = 0
