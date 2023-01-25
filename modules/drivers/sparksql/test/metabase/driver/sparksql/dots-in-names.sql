
DROP TABLE IF EXISTS ` objects.stuff `

CREATE TABLE ` objects.stuff ` (` id ` INT, ` dotted.name ` STRING)

-- 3 rows
INSERT INTO "objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

