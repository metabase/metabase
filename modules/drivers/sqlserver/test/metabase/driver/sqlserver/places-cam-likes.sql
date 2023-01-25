
IF object_id('places-cam-likes.dbo.places') IS NOT NULL DROP TABLE "places-cam-likes".dbo."places";

CREATE TABLE "places-cam-likes"."dbo"."places" (
  "id" INT IDENTITY(1, 1),
  "name" VARCHAR(1024),
  "liked" BIT,
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "places-cam-likes"."dbo"."places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

