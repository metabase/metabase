SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."sample_dataset_products" CASCADE;

CREATE TABLE "public"."sample_dataset_products" (
  "id" INTEGER,
  "ean" VARCHAR(1024),
  "title" VARCHAR(1024),
  "category" VARCHAR(1024),
  "vendor" VARCHAR(1024),
  "price" FLOAT,
  "rating" FLOAT,
  "created_at" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."sample_dataset_people" CASCADE;

CREATE TABLE "public"."sample_dataset_people" (
  "id" INTEGER,
  "address" VARCHAR(1024),
  "email" VARCHAR(1024),
  "password" VARCHAR(1024),
  "name" VARCHAR(1024),
  "city" VARCHAR(1024),
  "longitude" FLOAT,
  "state" VARCHAR(1024),
  "source" VARCHAR(1024),
  "birth_date" DATE,
  "zip" VARCHAR(1024),
  "latitude" FLOAT,
  "created_at" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."sample_dataset_reviews" CASCADE;

CREATE TABLE "public"."sample_dataset_reviews" (
  "id" INTEGER,
  "product_id" INTEGER,
  "reviewer" VARCHAR(1024),
  "rating" INTEGER,
  "body" VARCHAR(1024),
  "created_at" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."sample_dataset_orders" CASCADE;

CREATE TABLE "public"."sample_dataset_orders" (
  "id" INTEGER,
  "user_id" INTEGER,
  "product_id" INTEGER,
  "subtotal" FLOAT,
  "tax" FLOAT,
  "total" FLOAT,
  "discount" FLOAT,
  "created_at" TIMESTAMP WITH TIME ZONE,
  "quantity" INTEGER,
  PRIMARY KEY ("id")
);

ALTER TABLE
  "public"."sample_dataset_reviews"
ADD
  CONSTRAINT "roduct_id_products_-2038959040" FOREIGN KEY ("product_id") REFERENCES "public"."sample_dataset_products" ("id");

ALTER TABLE
  "public"."sample_dataset_orders"
ADD
  CONSTRAINT "ders_user_id_people_1953912621" FOREIGN KEY ("user_id") REFERENCES "public"."sample_dataset_people" ("id");

ALTER TABLE
  "public"."sample_dataset_orders"
ADD
  CONSTRAINT "roduct_id_products_-1127767076" FOREIGN KEY ("product_id") REFERENCES "public"."sample_dataset_products" ("id");
