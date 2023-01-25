
DROP TABLE IF EXISTS ` places_cam_likes `.` places `

CREATE EXTERNAL TABLE ` places_cam_likes `.` places ` (` id ` INT, ` name ` STRING, ` liked ` BOOLEAN) LOCATION 's3://metabase-ci-athena-results/places_cam_likes/places/';

-- 3 rows
INSERT INTO "places_cam_likes"."places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

