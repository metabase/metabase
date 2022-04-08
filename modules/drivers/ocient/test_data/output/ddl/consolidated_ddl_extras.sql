/* This file covers the extra tables that are derived from the original schema */

/* database: test-data-with-time */
CREATE DATABASE IF NOT EXISTS "test-data-with-time";

connect to jdbc:ocient://10.10.110.4:4050/test-data-with-time;
create user mb password = 'mbTesting';
GRANT ROLE "test-data-with-time Analyst" to USER mb;

DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "last_login_date" DATE,
  "last_login_time" TIME,
  "password" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

/* database: test-data-with-null-date-checkins */
CREATE DATABASE IF NOT EXISTS "test-data-with-null-date-checkins";

connect to jdbc:ocient://10.10.110.4:4050/test-data-with-null-date-checkins;
create user mb password = 'mbTesting';
GRANT ROLE "test-data-with-null-date-checkins Analyst" to USER mb;

DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "last_login" TIMESTAMP,
  "password" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

DROP TABLE IF EXISTS "public"."categories";
CREATE TABLE "public"."categories"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

DROP TABLE IF EXISTS "public"."venues";
CREATE TABLE "public"."venues"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "category_id" INT,
  "latitude" DOUBLE,
  "longitude" DOUBLE,
  "price" INT,
  CLUSTERING INDEX idx01 (id)
);

DROP TABLE IF EXISTS "public"."checkins";
CREATE TABLE "public"."checkins"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "date" DATE,
  "user_id" INT,
  "venue_id" INT,
  "null_only_date" DATE,
  CLUSTERING INDEX idx01 (id)
);



/* database: test-data-self-referencing-user */
CREATE DATABASE IF NOT EXISTS "test-data-self-referencing-user";

connect to jdbc:ocient://10.10.110.4:4050/test-data-self-referencing-user;
create user mb password = 'mbTesting';
GRANT ROLE "test-data-self-referencing-user Analyst" to USER mb;

DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "last_login" TIMESTAMP,
  "password" VARCHAR(255),
  "created_by" INT,
  CLUSTERING INDEX idx01 (id)
);

DROP TABLE IF EXISTS "public"."categories";
CREATE TABLE "public"."categories"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

DROP TABLE IF EXISTS "public"."venues";
CREATE TABLE "public"."venues"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "category_id" INT,
  "latitude" DOUBLE,
  "longitude" DOUBLE,
  "price" INT,
  CLUSTERING INDEX idx01 (id)
);

DROP TABLE IF EXISTS "public"."checkins";
CREATE TABLE "public"."checkins"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "date" DATE,
  "user_id" INT,
  "venue_id" INT,
  CLUSTERING INDEX idx01 (id)
);

CREATE DATABASE IF NOT EXISTS "test-data-with-timezones";
connect to jdbc:ocient://10.10.110.4:4050/test-data-with-timezones;
create user mb password = 'mbTesting';
GRANT ROLE "test-data-with-timezones Analyst" to USER mb;

DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "last_login" TIMESTAMP,
  "password" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

DROP TABLE IF EXISTS "public"."categories";
CREATE TABLE "public"."categories"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

DROP TABLE IF EXISTS "public"."venues";
CREATE TABLE "public"."venues"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "category_id" INT,
  "latitude" DOUBLE,
  "longitude" DOUBLE,
  "price" INT,
  CLUSTERING INDEX idx01 (id)
);

DROP TABLE IF EXISTS "public"."checkins";
CREATE TABLE "public"."checkins"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "date" DATE,
  "user_id" INT,
  "venue_id" INT,
  CLUSTERING INDEX idx01 (id)
);
