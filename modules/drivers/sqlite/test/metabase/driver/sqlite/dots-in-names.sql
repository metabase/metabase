
DROP TABLE IF EXISTS "objects.stuff";

CREATE TABLE "objects.stuff" ("id" INTEGER, "dotted.name" TEXT, PRIMARY KEY ("id"));

-- 3 rows
INSERT INTO "objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

