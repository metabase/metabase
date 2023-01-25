
DROP TABLE IF EXISTS "test-data"."default"."places_cam_likes_places"

CREATE TABLE "test-data"."default"."places_cam_likes_places" AS
SELECT
  *
FROM
  (
    VALUES
      (1, cast('' AS VARCHAR), TRUE)
  ) AS t ("id", "name", "liked")
WHERE
  1 = 0

-- 3 rows
INSERT INTO "test-data"."default"."places_cam_likes_places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

