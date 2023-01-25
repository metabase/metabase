-- Create a non-admin account 'GUEST' which will be used from here on out
CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';

-- Set DB_CLOSE_DELAY here because only admins are allowed to do it, so we can't set it via the connection string.
-- Set it to to -1 (no automatic closing)
SET DB_CLOSE_DELAY -1;

CREATE TABLE "ACQUIRED_TOUCANS" (
  "ID" BIGINT AUTO_INCREMENT PRIMARY KEY,
  "SPECIES" TEXT,
  "CAM_HAS_ACQUIRED_ONE" BOOLEAN
);

CREATE TABLE "SOUTH_MIGRATIONHISTORY" (
  "ID" BIGINT AUTO_INCREMENT PRIMARY KEY,
  "APP_NAME" TEXT,
  "MIGRATION" TEXT
);

INSERT INTO "ACQUIRED_TOUCANS" ("SPECIES", "CAM_HAS_ACQUIRED_ONE")
VALUES
('Toco', false),
('Chestnut-Mandibled', true),
('Keel-billed', false),
('Channel-billed', false);

INSERT INTO "SOUTH_MIGRATIONHISTORY" ("APP_NAME", "MIGRATION")
VALUES
('main', '0001_initial'),
('main', '0002_add_toucans');
