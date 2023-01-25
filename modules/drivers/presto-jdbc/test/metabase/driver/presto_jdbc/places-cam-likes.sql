
DROP TABLE IF EXISTS "test_data"."default"."places_cam_likes_places";

CREATE TABLE "test_data"."default"."places_cam_likes_places" ("id" INTEGER, "name" VARCHAR, "liked" BOOLEAN);

-- 3 rows
INSERT INTO "test_data"."default"."places_cam_likes_places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

