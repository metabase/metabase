SET
  TIME ZONE TO 'UTC';
2023-01-24 21:49:02,546 INFO data.sql :: No test data type mapping for driver :vertica for base type :type/JSON, falling back to ancestor base type :type/Text
2023-01-24 21:49:02,546 INFO data.sql :: No test data type mapping for driver :vertica for base type :type/JSON, falling back to ancestor base type :type/Text

DROP TABLE IF EXISTS "public"."json_json" CASCADE;

CREATE TABLE "public"."json_json" (
  "id" INTEGER,
  "bloop" VARCHAR(1024),
  "json_bit" VARCHAR(1024),
  PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."json_big_json" CASCADE;

CREATE TABLE "public"."json_big_json" (
  "id" INTEGER,
  "bloop" VARCHAR(1024),
  "json_bit" VARCHAR(1024),
  PRIMARY KEY ("id")
);
