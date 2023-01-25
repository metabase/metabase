
IF object_id('yyyymmddhhss-times.dbo.times') IS NOT NULL DROP TABLE "yyyymmddhhss-times".dbo."times";

CREATE TABLE "yyyymmddhhss-times"."dbo"."times" (
  "id" INT IDENTITY(1, 1),
  "name" VARCHAR(1024),
  "as_text" VARCHAR(1024),
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "yyyymmddhhss-times"."dbo"."times" ("id", "name", "as_text")
VALUES
(1, 'foo', '20190421164300'),
(2, 'bar', '20200421164300'),
(3, 'baz', '20210421164300');

