SET
  SESSION TIMEZONE TO 'UTC';
2023-01-21 01:02:18,902 INFO data.sql :: No test data type mapping for driver :postgres for base type :type/DateTimeWithLocalTZ, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-21 01:02:18,902 INFO data.sql :: No test data type mapping for driver :postgres for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-21 01:02:18,902 INFO data.sql :: No test data type mapping for driver :postgres for base type :type/DateTimeWithZoneID, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-21 01:02:18,902 INFO data.sql :: No test data type mapping for driver :postgres for base type :type/TimeWithLocalTZ, falling back to ancestor base type :type/TimeWithTZ
2023-01-21 01:02:18,902 INFO data.sql :: No test data type mapping for driver :postgres for base type :type/TimeWithZoneOffset, falling back to ancestor base type :type/TimeWithTZ

DROP TABLE IF EXISTS "attempts";

CREATE TABLE "attempts" (
  "id" SERIAL,
  "date" DATE,
  "datetime" TIMESTAMP,
  "datetime_ltz" TIMESTAMP WITH TIME ZONE,
  "datetime_tz" TIMESTAMP WITH TIME ZONE,
  "datetime_tz_id" TIMESTAMP WITH TIME ZONE,
  "time" TIME,
  "time_ltz" TIME WITH TIME ZONE,
  "time_tz" TIME WITH TIME ZONE,
  "num_crows" INTEGER,
  PRIMARY KEY ("id")
);

-- 20 rows
INSERT INTO "attempts" ("date", "datetime", "datetime_ltz", "datetime_tz", "datetime_tz_id", "time", "time_ltz", "time_tz", "num_crows")
VALUES
(
  date '2019-11-01',
  timestamp '2019-11-01 00:23:18.331',
  timestamp with time zone '2019-11-01 00:23:18.331-07:00',
  timestamp with time zone '2019-11-01 00:23:18.331-07:00',
  timestamp with time zone '2019-11-01 00:23:18.331-07:00',
  time '00:23:18.331',
  time with time zone '00:23:18.331-07:00',
  time with time zone '00:23:18.331-07:00',
  6
),
(
  date '2019-11-02',
  timestamp '2019-11-02 00:14:14.246',
  timestamp with time zone '2019-11-02 00:14:14.246-07:00',
  timestamp with time zone '2019-11-02 00:14:14.246-07:00',
  timestamp with time zone '2019-11-02 00:14:14.246-07:00',
  time '00:14:14.246',
  time with time zone '00:14:14.246-07:00',
  time with time zone '00:14:14.246-07:00',
  8
),
(
  date '2019-11-03',
  timestamp '2019-11-03 23:35:17.906',
  timestamp with time zone '2019-11-03 23:35:17.906-08:00',
  timestamp with time zone '2019-11-03 23:35:17.906-08:00',
  timestamp with time zone '2019-11-03 23:35:17.906-08:00',
  time '23:35:17.906',
  time with time zone '23:35:17.906-08:00',
  time with time zone '23:35:17.906-08:00',
  6
),
(
  date '2019-11-04',
  timestamp '2019-11-04 01:04:09.593',
  timestamp with time zone '2019-11-04 01:04:09.593-08:00',
  timestamp with time zone '2019-11-04 01:04:09.593-08:00',
  timestamp with time zone '2019-11-04 01:04:09.593-08:00',
  time '01:04:09.593',
  time with time zone '01:04:09.593-08:00',
  time with time zone '01:04:09.593-08:00',
  7
),
(
  date '2019-11-05',
  timestamp '2019-11-05 14:23:46.411',
  timestamp with time zone '2019-11-05 14:23:46.411-08:00',
  timestamp with time zone '2019-11-05 14:23:46.411-08:00',
  timestamp with time zone '2019-11-05 14:23:46.411-08:00',
  time '14:23:46.411',
  time with time zone '14:23:46.411-08:00',
  time with time zone '14:23:46.411-08:00',
  8
),
(
  date '2019-11-06',
  timestamp '2019-11-06 18:51:16.270',
  timestamp with time zone '2019-11-06 18:51:16.270-08:00',
  timestamp with time zone '2019-11-06 18:51:16.270-08:00',
  timestamp with time zone '2019-11-06 18:51:16.270-08:00',
  time '18:51:16.270',
  time with time zone '18:51:16.270-08:00',
  time with time zone '18:51:16.270-08:00',
  4
),
(
  date '2019-11-07',
  timestamp '2019-11-07 02:45:34.443',
  timestamp with time zone '2019-11-07 02:45:34.443-08:00',
  timestamp with time zone '2019-11-07 02:45:34.443-08:00',
  timestamp with time zone '2019-11-07 02:45:34.443-08:00',
  time '02:45:34.443',
  time with time zone '02:45:34.443-08:00',
  time with time zone '02:45:34.443-08:00',
  6
),
(
  date '2019-11-08',
  timestamp '2019-11-08 19:51:39.753',
  timestamp with time zone '2019-11-08 19:51:39.753-08:00',
  timestamp with time zone '2019-11-08 19:51:39.753-08:00',
  timestamp with time zone '2019-11-08 19:51:39.753-08:00',
  time '19:51:39.753',
  time with time zone '19:51:39.753-08:00',
  time with time zone '19:51:39.753-08:00',
  4
),
(
  date '2019-11-09',
  timestamp '2019-11-09 09:59:10.483',
  timestamp with time zone '2019-11-09 09:59:10.483-08:00',
  timestamp with time zone '2019-11-09 09:59:10.483-08:00',
  timestamp with time zone '2019-11-09 09:59:10.483-08:00',
  time '09:59:10.483',
  time with time zone '09:59:10.483-08:00',
  time with time zone '09:59:10.483-08:00',
  3
),
(
  date '2019-11-10',
  timestamp '2019-11-10 08:41:35.860',
  timestamp with time zone '2019-11-10 08:41:35.860-08:00',
  timestamp with time zone '2019-11-10 08:41:35.860-08:00',
  timestamp with time zone '2019-11-10 08:41:35.860-08:00',
  time '08:41:35.860',
  time with time zone '08:41:35.860-08:00',
  time with time zone '08:41:35.860-08:00',
  1
),
(
  date '2019-11-11',
  timestamp '2019-11-11 08:09:08.892',
  timestamp with time zone '2019-11-11 08:09:08.892-08:00',
  timestamp with time zone '2019-11-11 08:09:08.892-08:00',
  timestamp with time zone '2019-11-11 08:09:08.892-08:00',
  time '08:09:08.892',
  time with time zone '08:09:08.892-08:00',
  time with time zone '08:09:08.892-08:00',
  5
),
(
  date '2019-11-12',
  timestamp '2019-11-12 07:36:16.088',
  timestamp with time zone '2019-11-12 07:36:16.088-08:00',
  timestamp with time zone '2019-11-12 07:36:16.088-08:00',
  timestamp with time zone '2019-11-12 07:36:16.088-08:00',
  time '07:36:16.088',
  time with time zone '07:36:16.088-08:00',
  time with time zone '07:36:16.088-08:00',
  3
),
(
  date '2019-11-13',
  timestamp '2019-11-13 04:28:40.489',
  timestamp with time zone '2019-11-13 04:28:40.489-08:00',
  timestamp with time zone '2019-11-13 04:28:40.489-08:00',
  timestamp with time zone '2019-11-13 04:28:40.489-08:00',
  time '04:28:40.489',
  time with time zone '04:28:40.489-08:00',
  time with time zone '04:28:40.489-08:00',
  2
),
(
  date '2019-11-14',
  timestamp '2019-11-14 09:52:17.242',
  timestamp with time zone '2019-11-14 09:52:17.242-08:00',
  timestamp with time zone '2019-11-14 09:52:17.242-08:00',
  timestamp with time zone '2019-11-14 09:52:17.242-08:00',
  time '09:52:17.242',
  time with time zone '09:52:17.242-08:00',
  time with time zone '09:52:17.242-08:00',
  9
),
(
  date '2019-11-15',
  timestamp '2019-11-15 16:07:25.292',
  timestamp with time zone '2019-11-15 16:07:25.292-08:00',
  timestamp with time zone '2019-11-15 16:07:25.292-08:00',
  timestamp with time zone '2019-11-15 16:07:25.292-08:00',
  time '16:07:25.292',
  time with time zone '16:07:25.292-08:00',
  time with time zone '16:07:25.292-08:00',
  7
),
(
  date '2019-11-16',
  timestamp '2019-11-16 13:32:16.936',
  timestamp with time zone '2019-11-16 13:32:16.936-08:00',
  timestamp with time zone '2019-11-16 13:32:16.936-08:00',
  timestamp with time zone '2019-11-16 13:32:16.936-08:00',
  time '13:32:16.936',
  time with time zone '13:32:16.936-08:00',
  time with time zone '13:32:16.936-08:00',
  7
),
(
  date '2019-11-17',
  timestamp '2019-11-17 14:11:38.076',
  timestamp with time zone '2019-11-17 14:11:38.076-08:00',
  timestamp with time zone '2019-11-17 14:11:38.076-08:00',
  timestamp with time zone '2019-11-17 14:11:38.076-08:00',
  time '14:11:38.076',
  time with time zone '14:11:38.076-08:00',
  time with time zone '14:11:38.076-08:00',
  1
),
(
  date '2019-11-18',
  timestamp '2019-11-18 20:47:27.902',
  timestamp with time zone '2019-11-18 20:47:27.902-08:00',
  timestamp with time zone '2019-11-18 20:47:27.902-08:00',
  timestamp with time zone '2019-11-18 20:47:27.902-08:00',
  time '20:47:27.902',
  time with time zone '20:47:27.902-08:00',
  time with time zone '20:47:27.902-08:00',
  3
),
(
  date '2019-11-19',
  timestamp '2019-11-19 00:35:23.146',
  timestamp with time zone '2019-11-19 00:35:23.146-08:00',
  timestamp with time zone '2019-11-19 00:35:23.146-08:00',
  timestamp with time zone '2019-11-19 00:35:23.146-08:00',
  time '00:35:23.146',
  time with time zone '00:35:23.146-08:00',
  time with time zone '00:35:23.146-08:00',
  5
),
(
  date '2019-11-20',
  timestamp '2019-11-20 20:09:55.752',
  timestamp with time zone '2019-11-20 20:09:55.752-08:00',
  timestamp with time zone '2019-11-20 20:09:55.752-08:00',
  timestamp with time zone '2019-11-20 20:09:55.752-08:00',
  time '20:09:55.752',
  time with time zone '20:09:55.752-08:00',
  time with time zone '20:09:55.752-08:00',
  1
);

