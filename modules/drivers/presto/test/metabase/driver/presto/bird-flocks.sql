
DROP TABLE IF EXISTS "test-data"."default"."bird_flocks_bird"

CREATE TABLE "test-data"."default"."bird_flocks_bird" AS
SELECT
  *
FROM
  (
    VALUES
      (1, cast('' AS VARCHAR), 1)
  ) AS t ("id", "name", "flock_id")
WHERE
  1 = 0

DROP TABLE IF EXISTS "test-data"."default"."bird_flocks_flock"

CREATE TABLE "test-data"."default"."bird_flocks_flock" AS
SELECT
  *
FROM
  (
    VALUES
      (1, cast('' AS VARCHAR))
  ) AS t ("id", "name")
WHERE
  1 = 0

-- 18 rows
INSERT INTO "test-data"."default"."bird_flocks_bird" ("name", "flock_id")
VALUES
('Russell Crow', 4),
('Big Red', 5),
('Camellia Crow', NULL),
('Peter Pelican', 2),
('Geoff Goose', NULL),
('Greg Goose', 1),
('Callie Crow', 4),
('Patricia Pelican', NULL),
('Gerald Goose', 1),
('Pamela Pelican', NULL),
('Oswald Owl', NULL),
('Chicken Little', 5),
('Paul Pelican', 2),
('McNugget', 5),
('Orville Owl', 3),
('Carson Crow', 4),
('Olita Owl', NULL),
('Oliver Owl', 3);

-- 6 rows
INSERT INTO "test-data"."default"."bird_flocks_flock" ("name")
VALUES
('Green Street Gaggle'),
('SoMa Squadron'),
('Portrero Hill Parliament'),
('Mission Street Murder'),
('Bayview Brood'),
('Fillmore Flock');

