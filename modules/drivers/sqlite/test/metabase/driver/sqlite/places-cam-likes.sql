
DROP TABLE IF EXISTS "places";

CREATE TABLE "places" (
  "id" INTEGER,
  "name" TEXT,
  "liked" BOOLEAN,
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

