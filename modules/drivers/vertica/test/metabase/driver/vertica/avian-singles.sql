SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."avian_singles_users" CASCADE;

CREATE TABLE "public"."avian_singles_users" ("id" INTEGER, "name" VARCHAR(1024), PRIMARY KEY ("id"));

DROP TABLE IF EXISTS "public"."avian_singles_messages" CASCADE;

CREATE TABLE "public"."avian_singles_messages" (
  "id" INTEGER,
  "sender_id" INTEGER,
  "receiver_id" INTEGER,
  "text" VARCHAR(1024),
  PRIMARY KEY ("id")
);

ALTER TABLE
  "public"."avian_singles_messages"
ADD
  CONSTRAINT "ges_sender_id_users_-610421431" FOREIGN KEY ("sender_id") REFERENCES "public"."avian_singles_users" ("id");

ALTER TABLE
  "public"."avian_singles_messages"
ADD
  CONSTRAINT "_receiver_id_users_-1521680153" FOREIGN KEY ("receiver_id") REFERENCES "public"."avian_singles_users" ("id");
