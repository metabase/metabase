-- Create a non-admin account 'GUEST' which will be used from here on out
CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';

-- Set DB_CLOSE_DELAY here because only admins are allowed to do it, so we can't set it via the connection string.
-- Set it to to -1 (no automatic closing)
SET DB_CLOSE_DELAY -1;

DROP TABLE IF EXISTS "CHECKINS";

CREATE TABLE "CHECKINS" (
  "ID" BIGINT AUTO_INCREMENT,
  "PERSON" VARCHAR,
  "TIMESTAMP" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("ID")
);

GRANT ALL ON "CHECKINS" TO GUEST;

-- 10 rows
INSERT INTO "CHECKINS" ("PERSON", "TIMESTAMP")
VALUES
('Cam', timestamp with time zone '2019-01-02 05:30:00.000-07:00'),
('Cam', timestamp with time zone '2019-01-09 05:30:00.000-07:00'),
('Kyle', timestamp with time zone '2019-01-06 08:30:00.000-07:00'),
('Cam', timestamp with time zone '2019-01-07 04:00:00.000-07:00'),
('Sameer', timestamp with time zone '2019-01-26 16:00:00.000-07:00'),
('Cam', timestamp with time zone '2019-01-16 07:15:00.000-07:00'),
('Tom', timestamp with time zone '2019-01-27 01:30:00.000-07:00'),
('Sameer', timestamp with time zone '2019-01-24 14:00:00.000-07:00'),
('Maz', timestamp with time zone '2019-01-28 11:45:00.000-07:00'),
('Cam', timestamp with time zone '2019-01-25 07:30:00.000-07:00');
