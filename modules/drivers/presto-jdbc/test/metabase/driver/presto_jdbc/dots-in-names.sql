
DROP TABLE IF EXISTS "test_data"."default"."dots_in_names_objects.stuff";

CREATE TABLE "test_data"."default"."dots_in_names_objects.stuff" ("id" INTEGER, "dotted.name" VARCHAR);

-- 3 rows
INSERT INTO "test_data"."default"."dots_in_names_objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

