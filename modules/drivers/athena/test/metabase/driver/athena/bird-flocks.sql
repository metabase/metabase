
DROP TABLE IF EXISTS ` bird_flocks `.` bird `

CREATE EXTERNAL TABLE ` bird_flocks `.` bird ` (` id ` INT, ` name ` STRING, ` flock_id ` INT) LOCATION 's3://metabase-ci-athena-results/bird_flocks/bird/';

DROP TABLE IF EXISTS ` bird_flocks `.` flock `

CREATE EXTERNAL TABLE ` bird_flocks `.` flock ` (` id ` INT, ` name ` STRING) LOCATION 's3://metabase-ci-athena-results/bird_flocks/flock/';

-- 18 rows
INSERT INTO "bird_flocks"."bird" ("name", "flock_id")
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
INSERT INTO "bird_flocks"."flock" ("name")
VALUES
('Green Street Gaggle'),
('SoMa Squadron'),
('Portrero Hill Parliament'),
('Mission Street Murder'),
('Bayview Brood'),
('Fillmore Flock');

