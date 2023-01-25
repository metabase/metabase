SET
  TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "schema_20"."places_cam_likes_places" CASCADE;

CREATE TABLE "schema_20"."places_cam_likes_places" (
  "id" INTEGER IDENTITY(1, 1),
  "name" VARCHAR(1024),
  "liked" BOOL,
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "schema_20"."places_cam_likes_places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

