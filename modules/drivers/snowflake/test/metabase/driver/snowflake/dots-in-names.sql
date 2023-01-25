ALTER SESSION
SET
  TIMEZONE = 'UTC';

DROP TABLE IF EXISTS "dots-in-names"."PUBLIC"."objects.stuff";

CREATE TABLE "dots-in-names"."PUBLIC"."objects.stuff" (
  "id" INTEGER AUTOINCREMENT,
  "dotted.name" TEXT,
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "dots-in-names"."PUBLIC"."objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

