
IF object_id('dots-in-names.dbo.objects.stuff') IS NOT NULL DROP TABLE "dots-in-names".dbo."objects.stuff";

CREATE TABLE "dots-in-names"."dbo"."objects.stuff" (
  "id" INT IDENTITY(1, 1),
  "dotted.name" VARCHAR(1024),
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "dots-in-names"."dbo"."objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

