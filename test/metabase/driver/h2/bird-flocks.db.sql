-- Create a non-admin account 'GUEST' which will be used from here on out
CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';

-- Set DB_CLOSE_DELAY here because only admins are allowed to do it, so we can't set it via the connection string.
-- Set it to to -1 (no automatic closing)
SET DB_CLOSE_DELAY -1;

DROP TABLE IF EXISTS "BIRD";

CREATE TABLE "BIRD" (
  "ID" BIGINT AUTO_INCREMENT,
  "NAME" VARCHAR,
  "FLOCK_ID" INTEGER,
  PRIMARY KEY ("ID")
);

;

GRANT ALL ON "BIRD" TO GUEST;

DROP TABLE IF EXISTS "FLOCK";

CREATE TABLE "FLOCK" (
  "ID" BIGINT AUTO_INCREMENT,
  "NAME" VARCHAR,
  PRIMARY KEY ("ID")
);

;

GRANT ALL ON "FLOCK" TO GUEST;

-- 18 rows
INSERT INTO "BIRD" ("NAME", "FLOCK_ID")
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
INSERT INTO "FLOCK" ("NAME")
VALUES
('Green Street Gaggle'),
('SoMa Squadron'),
('Portrero Hill Parliament'),
('Mission Street Murder'),
('Bayview Brood'),
('Fillmore Flock');
