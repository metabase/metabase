SET
  TIME ZONE TO 'UTC';

DROP TABLE IF EXISTS "public"."icrosecond_incidents_incidents" CASCADE;

CREATE TABLE "public"."icrosecond_incidents_incidents" (
  "id" INTEGER,
  "severity" INTEGER,
  "timestamp" BIGINT,
  PRIMARY KEY ("id")
);
