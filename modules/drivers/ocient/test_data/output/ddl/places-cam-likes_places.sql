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

