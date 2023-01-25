SET
  SESSION TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "objects.stuff";

CREATE TABLE "objects.stuff" ("id" SERIAL, "dotted.name" TEXT, PRIMARY KEY ("id"));

-- 3 rows
INSERT INTO "objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

