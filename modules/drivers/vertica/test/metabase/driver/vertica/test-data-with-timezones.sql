SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."test_data_with_timezones_users" CASCADE;

CREATE TABLE "public"."test_data_with_timezones_users" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "last_login" TIMESTAMP WITH TIME ZONE,
  "password" VARCHAR(1024),
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."data_with_timezones_categories" CASCADE;

CREATE TABLE "public"."data_with_timezones_categories" (
  "id" INTEGER,
  "name" VARCHAR(1024) NOT NULL,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."est_data_with_timezones_venues" CASCADE;

CREATE TABLE "public"."est_data_with_timezones_venues" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "category_id" INTEGER,
  "latitude" FLOAT,
  "longitude" FLOAT,
  "price" INTEGER,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."t_data_with_timezones_checkins" CASCADE;

CREATE TABLE "public"."t_data_with_timezones_checkins" (
  "id" INTEGER,
  "date" DATE,
  "user_id" INTEGER,
  "venue_id" INTEGER,
  PRIMARY KEY ("id")
);

ALTER TABLE
  "public"."est_data_with_timezones_venues"
ADD
  CONSTRAINT "tegory_id_categories_341257635" FOREIGN KEY ("category_id") REFERENCES "public"."data_with_timezones_categories" ("id");

ALTER TABLE
  "public"."t_data_with_timezones_checkins"
ADD
  CONSTRAINT "eckins_user_id_users_660849906" FOREIGN KEY ("user_id") REFERENCES "public"."test_data_with_timezones_users" ("id");

ALTER TABLE
  "public"."t_data_with_timezones_checkins"
ADD
  CONSTRAINT "ins_venue_id_venues_1367144309" FOREIGN KEY ("venue_id") REFERENCES "public"."est_data_with_timezones_venues" ("id");
