SET
  SESSION TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "places";

CREATE TABLE "places" (
  "id" SERIAL,
  "name" TEXT,
  "liked" BOOL,
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

