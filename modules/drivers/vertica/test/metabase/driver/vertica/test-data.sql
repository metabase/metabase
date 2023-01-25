SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."test_data_users" CASCADE;

CREATE TABLE "public"."test_data_users" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "last_login" TIMESTAMP,
  "password" VARCHAR(1024),
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."test_data_categories" CASCADE;

CREATE TABLE "public"."test_data_categories" (
  "id" INTEGER,
  "name" VARCHAR(1024) NOT NULL,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."test_data_venues" CASCADE;

CREATE TABLE "public"."test_data_venues" (
  "id" INTEGER,
  "name" VARCHAR(1024),
  "category_id" INTEGER,
  "latitude" FLOAT,
  "longitude" FLOAT,
  "price" INTEGER,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."test_data_checkins" CASCADE;

CREATE TABLE "public"."test_data_checkins" (
  "id" INTEGER,
  "date" DATE,
  "user_id" INTEGER,
  "venue_id" INTEGER,
  PRIMARY KEY ("id")
);

ALTER TABLE
  "public"."test_data_venues"
ADD
  CONSTRAINT "tegory_id_categories_927642602" FOREIGN KEY ("category_id") REFERENCES "public"."test_data_categories" ("id");

ALTER TABLE
  "public"."test_data_checkins"
ADD
  CONSTRAINT "ckins_user_id_users_-815717481" FOREIGN KEY ("user_id") REFERENCES "public"."test_data_users" ("id");

ALTER TABLE
  "public"."test_data_checkins"
ADD
  CONSTRAINT "ns_venue_id_venues_-1854903846" FOREIGN KEY ("venue_id") REFERENCES "public"."test_data_venues" ("id");
