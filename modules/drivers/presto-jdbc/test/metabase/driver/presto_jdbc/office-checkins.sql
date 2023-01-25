
DROP TABLE IF EXISTS "test_data"."default"."office_checkins_checkins";

CREATE TABLE "test_data"."default"."office_checkins_checkins" (
  "id" INTEGER,
  "person" VARCHAR,
  "timestamp" TIMESTAMP WITH TIME ZONE
);

-- 10 rows
INSERT INTO "test_data"."default"."office_checkins_checkins" ("person", "timestamp")
VALUES
('Cam', timestamp '2019-01-02 05:30 -07:00'),
('Cam', timestamp '2019-01-09 05:30 -07:00'),
('Kyle', timestamp '2019-01-06 08:30 -07:00'),
('Cam', timestamp '2019-01-07 04:00 -07:00'),
('Sameer', timestamp '2019-01-26 16:00 -07:00'),
('Cam', timestamp '2019-01-16 07:15 -07:00'),
('Tom', timestamp '2019-01-27 01:30 -07:00'),
('Sameer', timestamp '2019-01-24 14:00 -07:00'),
('Maz', timestamp '2019-01-28 11:45 -07:00'),
('Cam', timestamp '2019-01-25 07:30 -07:00');

