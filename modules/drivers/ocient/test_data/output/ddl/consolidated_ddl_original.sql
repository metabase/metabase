/* database: bird-flocks */
CREATE DATABASE IF NOT EXISTS "bird-flocks";

connect to jdbc:ocient://10.10.110.4:4050/bird-flocks;

DROP TABLE IF EXISTS "public"."bird";
CREATE TABLE "public"."bird"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "flock_id" INT,
  CLUSTERING INDEX idx01 (id)
);

/* database: bird-flocks */
CREATE DATABASE IF NOT EXISTS "bird-flocks";

connect to jdbc:ocient://10.10.110.4:4050/bird-flocks;

DROP TABLE IF EXISTS "public"."flock";
CREATE TABLE "public"."flock"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

/* database: sad-toucan-incidents */
CREATE DATABASE IF NOT EXISTS "sad-toucan-incidents";

connect to jdbc:ocient://10.10.110.4:4050/sad-toucan-incidents;

DROP TABLE IF EXISTS "public"."incidents";
CREATE TABLE "public"."incidents"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "severity" INT,
  "timestamp" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

/* database: test-data */
CREATE DATABASE IF NOT EXISTS "test-data";

connect to jdbc:ocient://10.10.110.4:4050/test-data;

DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "last_login" TIMESTAMP,
  "password" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

/* database: test-data */
CREATE DATABASE IF NOT EXISTS "test-data";

connect to jdbc:ocient://10.10.110.4:4050/test-data;

DROP TABLE IF EXISTS "public"."categories";
CREATE TABLE "public"."categories"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

/* database: test-data */
CREATE DATABASE IF NOT EXISTS "test-data";

connect to jdbc:ocient://10.10.110.4:4050/test-data;

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

/* database: test-data */
CREATE DATABASE IF NOT EXISTS "test-data";

connect to jdbc:ocient://10.10.110.4:4050/test-data;

DROP TABLE IF EXISTS "public"."checkins";
CREATE TABLE "public"."checkins"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "date" DATE,
  "user_id" INT,
  "venue_id" INT,
  CLUSTERING INDEX idx01 (id)
);

/* database: places-cam-likes */
CREATE DATABASE IF NOT EXISTS "places-cam-likes";

connect to jdbc:ocient://10.10.110.4:4050/places-cam-likes;

DROP TABLE IF EXISTS "public"."places";
CREATE TABLE "public"."places"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "liked" BOOLEAN,
  CLUSTERING INDEX idx01 (id)
);

/* database: daily-bird-counts */
CREATE DATABASE IF NOT EXISTS "daily-bird-counts";

connect to jdbc:ocient://10.10.110.4:4050/daily-bird-counts;

DROP TABLE IF EXISTS "public"."bird-count";
CREATE TABLE "public"."bird-count"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "date" DATE,
  "count" INT,
  CLUSTERING INDEX idx01 (id)
);

/* database: sample-dataset */
CREATE DATABASE IF NOT EXISTS "sample-dataset";

connect to jdbc:ocient://10.10.110.4:4050/sample-dataset;

DROP TABLE IF EXISTS "public"."products";
CREATE TABLE "public"."products"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "ean" VARCHAR(255),
  "title" VARCHAR(255),
  "category" VARCHAR(255),
  "vendor" VARCHAR(255),
  "price" DOUBLE,
  "rating" DOUBLE,
  "created_at" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

/* database: sample-dataset */
CREATE DATABASE IF NOT EXISTS "sample-dataset";

connect to jdbc:ocient://10.10.110.4:4050/sample-dataset;

DROP TABLE IF EXISTS "public"."people";
CREATE TABLE "public"."people"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "address" VARCHAR(255),
  "email" VARCHAR(255),
  "password" VARCHAR(255),
  "name" VARCHAR(255),
  "city" VARCHAR(255),
  "longitude" DOUBLE,
  "state" VARCHAR(255),
  "source" VARCHAR(255),
  "birth_date" DATE,
  "zip" VARCHAR(255),
  "latitude" DOUBLE,
  "created_at" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

/* database: sample-dataset */
CREATE DATABASE IF NOT EXISTS "sample-dataset";

connect to jdbc:ocient://10.10.110.4:4050/sample-dataset;

DROP TABLE IF EXISTS "public"."reviews";
CREATE TABLE "public"."reviews"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "product_id" INT,
  "reviewer" VARCHAR(255),
  "rating" INT,
  "body" VARCHAR(255),
  "created_at" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

/* database: sample-dataset */
CREATE DATABASE IF NOT EXISTS "sample-dataset";

connect to jdbc:ocient://10.10.110.4:4050/sample-dataset;

DROP TABLE IF EXISTS "public"."orders";
CREATE TABLE "public"."orders"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "user_id" INT,
  "product_id" INT,
  "subtotal" DOUBLE,
  "tax" DOUBLE,
  "total" DOUBLE,
  "discount" DOUBLE,
  "created_at" TIMESTAMP,
  "quantity" INT,
  CLUSTERING INDEX idx01 (id)
);

/* database: geographical-tips */
CREATE DATABASE IF NOT EXISTS "geographical-tips";

connect to jdbc:ocient://10.10.110.4:4050/geographical-tips;

DROP TABLE IF EXISTS "public"."tips";
CREATE TABLE "public"."tips"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "source" VARCHAR(255),
  "text" VARCHAR(255),
  "url" VARCHAR(255),
  "venue" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

/* database: office-checkins */
CREATE DATABASE IF NOT EXISTS "office-checkins";

connect to jdbc:ocient://10.10.110.4:4050/office-checkins;

DROP TABLE IF EXISTS "public"."checkins";
CREATE TABLE "public"."checkins"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "person" VARCHAR(255),
  "timestamp" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

/* database: tupac-sightings */
CREATE DATABASE IF NOT EXISTS "tupac-sightings";

connect to jdbc:ocient://10.10.110.4:4050/tupac-sightings;

DROP TABLE IF EXISTS "public"."cities";
CREATE TABLE "public"."cities"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "latitude" DOUBLE,
  "longitude" DOUBLE,
  CLUSTERING INDEX idx01 (id)
);

/* database: tupac-sightings */
CREATE DATABASE IF NOT EXISTS "tupac-sightings";

connect to jdbc:ocient://10.10.110.4:4050/tupac-sightings;

DROP TABLE IF EXISTS "public"."categories";
CREATE TABLE "public"."categories"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

/* database: tupac-sightings */
CREATE DATABASE IF NOT EXISTS "tupac-sightings";

connect to jdbc:ocient://10.10.110.4:4050/tupac-sightings;

DROP TABLE IF EXISTS "public"."sightings";
CREATE TABLE "public"."sightings"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "city_id" INT,
  "category_id" INT,
  "timestamp" TIMESTAMP,
  CLUSTERING INDEX idx01 (id)
);

/* database: airports */
CREATE DATABASE IF NOT EXISTS "airports";

connect to jdbc:ocient://10.10.110.4:4050/airports;

DROP TABLE IF EXISTS "public"."continent";
CREATE TABLE "public"."continent"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "iso-code" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

/* database: airports */
CREATE DATABASE IF NOT EXISTS "airports";

connect to jdbc:ocient://10.10.110.4:4050/airports;

DROP TABLE IF EXISTS "public"."country";
CREATE TABLE "public"."country"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "iso-code" VARCHAR(255),
  "continent-id" INT,
  CLUSTERING INDEX idx01 (id)
);

/* database: airports */
CREATE DATABASE IF NOT EXISTS "airports";

connect to jdbc:ocient://10.10.110.4:4050/airports;

DROP TABLE IF EXISTS "public"."region";
CREATE TABLE "public"."region"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "iso-code" VARCHAR(255),
  "country-id" INT,
  CLUSTERING INDEX idx01 (id)
);

/* database: airports */
CREATE DATABASE IF NOT EXISTS "airports";

connect to jdbc:ocient://10.10.110.4:4050/airports;

DROP TABLE IF EXISTS "public"."municipality";
CREATE TABLE "public"."municipality"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "region-id" INT,
  CLUSTERING INDEX idx01 (id)
);

/* database: airports */
CREATE DATABASE IF NOT EXISTS "airports";

connect to jdbc:ocient://10.10.110.4:4050/airports;

DROP TABLE IF EXISTS "public"."airport";
CREATE TABLE "public"."airport"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  "code" VARCHAR(255),
  "latitude" DOUBLE,
  "longitude" DOUBLE,
  "municipality-id" INT,
  CLUSTERING INDEX idx01 (id)
);

/* database: avian-singles */
CREATE DATABASE IF NOT EXISTS "avian-singles";

connect to jdbc:ocient://10.10.110.4:4050/avian-singles;

DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "name" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

/* database: avian-singles */
CREATE DATABASE IF NOT EXISTS "avian-singles";

connect to jdbc:ocient://10.10.110.4:4050/avian-singles;

DROP TABLE IF EXISTS "public"."messages";
CREATE TABLE "public"."messages"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "sender_id" INT,
  "receiver_id" INT,
  "text" VARCHAR(255),
  CLUSTERING INDEX idx01 (id)
);

/* database: attempted-murders */
CREATE DATABASE IF NOT EXISTS "attempted-murders";

connect to jdbc:ocient://10.10.110.4:4050/attempted-murders;

DROP TABLE IF EXISTS "public"."attempts";
CREATE TABLE "public"."attempts"(
  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',
  id INT NOT NULL,
  "date" DATE,
  "datetime" TIMESTAMP,
  "datetime_ltz" TIMESTAMP,
  "datetime_tz" TIMESTAMP,
  "datetime_tz_id" TIMESTAMP,
  "time" TIME,
  "time_ltz" TIME,
  "time_tz" TIME,
  "num_crows" INT,
  CLUSTERING INDEX idx01 (id)
);
