
DROP TABLE IF EXISTS ` dots_in_names `.` objects.stuff `

CREATE EXTERNAL TABLE ` dots_in_names `.` objects.stuff ` (` id ` INT, ` dotted.name ` STRING) LOCATION 's3://metabase-ci-athena-results/dots_in_names/objects.stuff/';

-- 3 rows
INSERT INTO "dots_in_names"."objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

