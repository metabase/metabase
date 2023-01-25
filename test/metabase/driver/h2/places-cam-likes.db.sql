-- Create a non-admin account 'GUEST' which will be used from here on out
CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';

-- Set DB_CLOSE_DELAY here because only admins are allowed to do it, so we can't set it via the connection string.
-- Set it to to -1 (no automatic closing)
SET DB_CLOSE_DELAY -1;

DROP TABLE IF EXISTS "PLACES";

CREATE TABLE "PLACES" (
  "ID" BIGINT AUTO_INCREMENT,
  "NAME" VARCHAR,
  "LIKED" BOOLEAN,
  PRIMARY KEY ("ID")
);

GRANT ALL ON "PLACES" TO GUEST;

-- 3 rows
INSERT INTO "PLACES" ("NAME", "LIKED")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);
