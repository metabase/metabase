SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."test_data_with_time_users" CASCADE;

CREATE TABLE "public"."test_data_with_time_users" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "last_login_date" DATE,
  "last_login_time" TIME,
  "password" VARCHAR(1024),
  PRIMARY KEY ("id")
);
