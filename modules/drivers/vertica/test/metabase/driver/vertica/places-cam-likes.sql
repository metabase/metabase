SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."places_cam_likes_places" CASCADE;

CREATE TABLE "public"."places_cam_likes_places" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "liked" BOOLEAN,
  PRIMARY KEY ("id")
);
