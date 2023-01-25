
DROP TABLE IF EXISTS "test_data"."default"."bird_flocks_bird";

CREATE TABLE "test_data"."default"."bird_flocks_bird" ("id" INTEGER, "name" VARCHAR, "flock_id" INTEGER);

DROP TABLE IF EXISTS "test_data"."default"."bird_flocks_flock";

CREATE TABLE "test_data"."default"."bird_flocks_flock" ("id" INTEGER, "name" VARCHAR);

-- 18 rows
INSERT INTO "test_data"."default"."bird_flocks_bird" ("name", "flock_id")
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
INSERT INTO "test_data"."default"."bird_flocks_flock" ("name")
VALUES
('Green Street Gaggle'),
('SoMa Squadron'),
('Portrero Hill Parliament'),
('Mission Street Murder'),
('Bayview Brood'),
('Fillmore Flock');

