SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."sad_toucan_incidents_incidents" CASCADE;

CREATE TABLE "public"."sad_toucan_incidents_incidents" (
  "id" INTEGER,
  "severity" INTEGER,
  "timestamp" BIGINT,
  PRIMARY KEY ("id")
);
