-- Create a non-admin account 'GUEST' which will be used from here on out
CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';

-- Set DB_CLOSE_DELAY here because only admins are allowed to do it, so we can't set it via the connection string.
-- Set it to to -1 (no automatic closing)
SET DB_CLOSE_DELAY -1;

CREATE TABLE "T" (
  "ID" BIGINT AUTO_INCREMENT PRIMARY KEY,
  "F" INTEGER
);

INSERT INTO "T" ("F")
VALUES
(100000),
(200000),
(300000);
