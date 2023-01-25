SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."ta_self_referencing_user_users" CASCADE;

CREATE TABLE "public"."ta_self_referencing_user_users" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "last_login" TIMESTAMP,
  "password" VARCHAR(1024),
  "created_by" INTEGER,
  PRIMARY KEY ("id")
);

ALTER TABLE
  "public"."ta_self_referencing_user_users"
ADD
  CONSTRAINT "ers_created_by_users_406217275" FOREIGN KEY ("created_by") REFERENCES "public"."ta_self_referencing_user_users" ("id");
