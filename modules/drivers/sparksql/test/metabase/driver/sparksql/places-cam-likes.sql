
DROP TABLE IF EXISTS ` places `

CREATE TABLE ` places ` (` id ` INT, ` name ` STRING, ` liked ` BOOLEAN)

-- 3 rows
INSERT INTO "places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

