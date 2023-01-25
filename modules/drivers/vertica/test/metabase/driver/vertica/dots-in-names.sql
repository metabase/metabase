SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."dots_in_names_objects.stuff" CASCADE;

CREATE TABLE "public"."dots_in_names_objects.stuff" (
  "id" INTEGER,
  "dotted.name" VARCHAR(1024),
  PRIMARY KEY ("id")
);
