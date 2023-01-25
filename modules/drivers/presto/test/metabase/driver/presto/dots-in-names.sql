
DROP TABLE IF EXISTS "test-data"."default"."dots_in_names_objects.stuff"

CREATE TABLE "test-data"."default"."dots_in_names_objects.stuff" AS
SELECT
  *
FROM
  (
    VALUES
      (1, cast('' AS VARCHAR))
  ) AS t ("id", "dotted.name")
WHERE
  1 = 0

-- 3 rows
INSERT INTO "test-data"."default"."dots_in_names_objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

