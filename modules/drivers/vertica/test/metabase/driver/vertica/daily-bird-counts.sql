SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."daily_bird_counts_bird_count" CASCADE;

CREATE TABLE "public"."daily_bird_counts_bird_count" (
  "id" INTEGER,
  "date" DATE,
  "count" INTEGER,
  PRIMARY KEY ("id")
);
