SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."_with_null_date_checkins_users" CASCADE;

CREATE TABLE "public"."_with_null_date_checkins_users" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "last_login" TIMESTAMP,
  "password" VARCHAR(1024),
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."_null_date_checkins_categories" CASCADE;

CREATE TABLE "public"."_null_date_checkins_categories" (
  "id" INTEGER,
  "name" VARCHAR(1024) NOT NULL,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."with_null_date_checkins_venues" CASCADE;

CREATE TABLE "public"."with_null_date_checkins_venues" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "category_id" INTEGER,
  "latitude" FLOAT,
  "longitude" FLOAT,
  "price" INTEGER,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."th_null_date_checkins_checkins" CASCADE;

CREATE TABLE "public"."th_null_date_checkins_checkins" (
  "id" INTEGER,
  "date" DATE,
  "null_only_date" DATE,
  "user_id" INTEGER,
  "venue_id" INTEGER,
  PRIMARY KEY ("id")
);

ALTER TABLE
  "public"."with_null_date_checkins_venues"
ADD
  CONSTRAINT "gory_id_categories_-1015326056" FOREIGN KEY ("category_id") REFERENCES "public"."_null_date_checkins_categories" ("id");

ALTER TABLE
  "public"."th_null_date_checkins_checkins"
ADD
  CONSTRAINT "ckins_user_id_users_-678228030" FOREIGN KEY ("user_id") REFERENCES "public"."_with_null_date_checkins_users" ("id");

ALTER TABLE
  "public"."th_null_date_checkins_checkins"
ADD
  CONSTRAINT "ins_venue_id_venues_1706439434" FOREIGN KEY ("venue_id") REFERENCES "public"."with_null_date_checkins_venues" ("id");
