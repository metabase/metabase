ALTER SESSION
SET
  TIMEZONE = 'UTC';

DROP TABLE IF EXISTS "places-cam-likes"."PUBLIC"."places";

CREATE TABLE "places-cam-likes"."PUBLIC"."places" (
  "id" INTEGER AUTOINCREMENT,
  "name" TEXT,
  "liked" BOOLEAN,
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "places-cam-likes"."PUBLIC"."places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

