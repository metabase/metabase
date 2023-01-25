SET
  TIME ZONE TO 'UTC';
2023-01-24 21:48:50,606 INFO data.sql :: No test data type mapping for driver :vertica for base type :type/DateTimeWithLocalTZ, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-24 21:48:50,606 INFO data.sql :: No test data type mapping for driver :vertica for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-24 21:48:50,606 INFO data.sql :: No test data type mapping for driver :vertica for base type :type/DateTimeWithZoneID, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-24 21:48:50,606 INFO data.sql :: No test data type mapping for driver :vertica for base type :type/TimeWithLocalTZ, falling back to ancestor base type :type/Time
2023-01-24 21:48:50,606 INFO data.sql :: No test data type mapping for driver :vertica for base type :type/TimeWithZoneOffset, falling back to ancestor base type :type/Time

DROP TABLE IF EXISTS "public"."attempted_murders_attempts" CASCADE;

CREATE TABLE "public"."attempted_murders_attempts" (
  "id" INTEGER,
  "date" DATE,
  "datetime" TIMESTAMP,
  "datetime_ltz" TIMESTAMP WITH TIME ZONE,
  "datetime_tz" TIMESTAMP WITH TIME ZONE,
  "datetime_tz_id" TIMESTAMP WITH TIME ZONE,
  "time" TIME,
  "time_ltz" TIME,
  "time_tz" TIME,
  "num_crows" INTEGER,
  PRIMARY KEY ("id")
);
