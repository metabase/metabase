SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."bird_flocks_bird" CASCADE;

CREATE TABLE "public"."bird_flocks_bird" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "flock_id" INTEGER,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."bird_flocks_flock" CASCADE;

CREATE TABLE "public"."bird_flocks_flock" ("id" INTEGER, "name" VARCHAR(1024), PRIMARY KEY ("id"));
