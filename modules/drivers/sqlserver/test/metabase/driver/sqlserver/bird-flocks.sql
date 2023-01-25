
IF object_id('bird-flocks.dbo.bird') IS NOT NULL DROP TABLE "bird-flocks".dbo."bird";

CREATE TABLE "bird-flocks"."dbo"."bird" (
  "id" INT IDENTITY(1, 1),
  "name" VARCHAR(1024),
  "flock_id" INTEGER,
  PRIMARY KEY ("id")
);

IF object_id('bird-flocks.dbo.flock') IS NOT NULL DROP TABLE "bird-flocks".dbo."flock";

CREATE TABLE "bird-flocks"."dbo"."flock" (
  "id" INT IDENTITY(1, 1),
  "name" VARCHAR(1024),
  PRIMARY KEY ("id")
);

-- 18 rows
INSERT INTO "bird-flocks"."dbo"."bird" ("name", "flock_id")
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
INSERT INTO "bird-flocks"."dbo"."flock" ("name")
VALUES
('Green Street Gaggle'),
('SoMa Squadron'),
('Portrero Hill Parliament'),
('Mission Street Murder'),
('Bayview Brood'),
('Fillmore Flock');

