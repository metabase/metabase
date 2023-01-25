SET
  TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "schema_20"."dots_in_names_objects.stuff" CASCADE;

CREATE TABLE "schema_20"."dots_in_names_objects.stuff" (
  "id" INTEGER IDENTITY(1, 1),
  "dotted.name" VARCHAR(1024),
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "schema_20"."dots_in_names_objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

