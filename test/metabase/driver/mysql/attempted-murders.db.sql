SET
  @@session.time_zone = 'UTC';
2023-01-21 01:04:11,906 INFO data.sql :: No test data type mapping for driver :mysql for base type :type/DateTimeWithLocalTZ, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-21 01:04:11,906 INFO data.sql :: No test data type mapping for driver :mysql for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-21 01:04:11,906 INFO data.sql :: No test data type mapping for driver :mysql for base type :type/DateTimeWithZoneID, falling back to ancestor base type :type/DateTimeWithTZ
2023-01-21 01:04:11,906 INFO data.sql :: No test data type mapping for driver :mysql for base type :type/TimeWithLocalTZ, falling back to ancestor base type :type/Time
2023-01-21 01:04:11,906 INFO data.sql :: No test data type mapping for driver :mysql for base type :type/TimeWithZoneOffset, falling back to ancestor base type :type/Time

DROP TABLE IF EXISTS `attempts`;

CREATE TABLE `attempts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `date` DATE,
  `datetime` DATETIME(3),
  `datetime_ltz` TIMESTAMP(3) DEFAULT '1970-01-01 00:00:01',
  `datetime_tz` TIMESTAMP(3) DEFAULT '1970-01-01 00:00:01',
  `datetime_tz_id` TIMESTAMP(3) DEFAULT '1970-01-01 00:00:01',
  `time` TIME(3),
  `time_ltz` TIME(3),
  `time_tz` TIME(3),
  `num_crows` INTEGER,
  PRIMARY KEY (`id`)
);

-- 20 rows
INSERT INTO "attempts" ("date", "datetime", "datetime_ltz", "datetime_tz", "datetime_tz_id", "time", "time_ltz", "time_tz", "num_crows")
VALUES
(
  date '2019-11-01',
  timestamp '2019-11-01 00:23:18.331',
  convert_tz('2019-11-01 00:23:18.331', '-07:00', @@session.time_zone),
  convert_tz('2019-11-01 00:23:18.331', '-07:00', @@session.time_zone),
  convert_tz('2019-11-01 00:23:18.331', 'America/Los_Angeles', @@session.time_zone),
  time '00:23:18.331',
  convert_tz('00:23:18.331', '-07:00', @@session.time_zone),
  convert_tz('00:23:18.331', '-07:00', @@session.time_zone),
  6
),
(
  date '2019-11-02',
  timestamp '2019-11-02 00:14:14.246',
  convert_tz('2019-11-02 00:14:14.246', '-07:00', @@session.time_zone),
  convert_tz('2019-11-02 00:14:14.246', '-07:00', @@session.time_zone),
  convert_tz('2019-11-02 00:14:14.246', 'America/Los_Angeles', @@session.time_zone),
  time '00:14:14.246',
  convert_tz('00:14:14.246', '-07:00', @@session.time_zone),
  convert_tz('00:14:14.246', '-07:00', @@session.time_zone),
  8
),
(
  date '2019-11-03',
  timestamp '2019-11-03 23:35:17.906',
  convert_tz('2019-11-03 23:35:17.906', '-08:00', @@session.time_zone),
  convert_tz('2019-11-03 23:35:17.906', '-08:00', @@session.time_zone),
  convert_tz('2019-11-03 23:35:17.906', 'America/Los_Angeles', @@session.time_zone),
  time '23:35:17.906',
  convert_tz('23:35:17.906', '-08:00', @@session.time_zone),
  convert_tz('23:35:17.906', '-08:00', @@session.time_zone),
  6
),
(
  date '2019-11-04',
  timestamp '2019-11-04 01:04:09.593',
  convert_tz('2019-11-04 01:04:09.593', '-08:00', @@session.time_zone),
  convert_tz('2019-11-04 01:04:09.593', '-08:00', @@session.time_zone),
  convert_tz('2019-11-04 01:04:09.593', 'America/Los_Angeles', @@session.time_zone),
  time '01:04:09.593',
  convert_tz('01:04:09.593', '-08:00', @@session.time_zone),
  convert_tz('01:04:09.593', '-08:00', @@session.time_zone),
  7
),
(
  date '2019-11-05',
  timestamp '2019-11-05 14:23:46.411',
  convert_tz('2019-11-05 14:23:46.411', '-08:00', @@session.time_zone),
  convert_tz('2019-11-05 14:23:46.411', '-08:00', @@session.time_zone),
  convert_tz('2019-11-05 14:23:46.411', 'America/Los_Angeles', @@session.time_zone),
  time '14:23:46.411',
  convert_tz('14:23:46.411', '-08:00', @@session.time_zone),
  convert_tz('14:23:46.411', '-08:00', @@session.time_zone),
  8
),
(
  date '2019-11-06',
  timestamp '2019-11-06 18:51:16.270',
  convert_tz('2019-11-06 18:51:16.270', '-08:00', @@session.time_zone),
  convert_tz('2019-11-06 18:51:16.270', '-08:00', @@session.time_zone),
  convert_tz('2019-11-06 18:51:16.270', 'America/Los_Angeles', @@session.time_zone),
  time '18:51:16.270',
  convert_tz('18:51:16.270', '-08:00', @@session.time_zone),
  convert_tz('18:51:16.270', '-08:00', @@session.time_zone),
  4
),
(
  date '2019-11-07',
  timestamp '2019-11-07 02:45:34.443',
  convert_tz('2019-11-07 02:45:34.443', '-08:00', @@session.time_zone),
  convert_tz('2019-11-07 02:45:34.443', '-08:00', @@session.time_zone),
  convert_tz('2019-11-07 02:45:34.443', 'America/Los_Angeles', @@session.time_zone),
  time '02:45:34.443',
  convert_tz('02:45:34.443', '-08:00', @@session.time_zone),
  convert_tz('02:45:34.443', '-08:00', @@session.time_zone),
  6
),
(
  date '2019-11-08',
  timestamp '2019-11-08 19:51:39.753',
  convert_tz('2019-11-08 19:51:39.753', '-08:00', @@session.time_zone),
  convert_tz('2019-11-08 19:51:39.753', '-08:00', @@session.time_zone),
  convert_tz('2019-11-08 19:51:39.753', 'America/Los_Angeles', @@session.time_zone),
  time '19:51:39.753',
  convert_tz('19:51:39.753', '-08:00', @@session.time_zone),
  convert_tz('19:51:39.753', '-08:00', @@session.time_zone),
  4
),
(
  date '2019-11-09',
  timestamp '2019-11-09 09:59:10.483',
  convert_tz('2019-11-09 09:59:10.483', '-08:00', @@session.time_zone),
  convert_tz('2019-11-09 09:59:10.483', '-08:00', @@session.time_zone),
  convert_tz('2019-11-09 09:59:10.483', 'America/Los_Angeles', @@session.time_zone),
  time '09:59:10.483',
  convert_tz('09:59:10.483', '-08:00', @@session.time_zone),
  convert_tz('09:59:10.483', '-08:00', @@session.time_zone),
  3
),
(
  date '2019-11-10',
  timestamp '2019-11-10 08:41:35.860',
  convert_tz('2019-11-10 08:41:35.860', '-08:00', @@session.time_zone),
  convert_tz('2019-11-10 08:41:35.860', '-08:00', @@session.time_zone),
  convert_tz('2019-11-10 08:41:35.860', 'America/Los_Angeles', @@session.time_zone),
  time '08:41:35.860',
  convert_tz('08:41:35.860', '-08:00', @@session.time_zone),
  convert_tz('08:41:35.860', '-08:00', @@session.time_zone),
  1
),
(
  date '2019-11-11',
  timestamp '2019-11-11 08:09:08.892',
  convert_tz('2019-11-11 08:09:08.892', '-08:00', @@session.time_zone),
  convert_tz('2019-11-11 08:09:08.892', '-08:00', @@session.time_zone),
  convert_tz('2019-11-11 08:09:08.892', 'America/Los_Angeles', @@session.time_zone),
  time '08:09:08.892',
  convert_tz('08:09:08.892', '-08:00', @@session.time_zone),
  convert_tz('08:09:08.892', '-08:00', @@session.time_zone),
  5
),
(
  date '2019-11-12',
  timestamp '2019-11-12 07:36:16.088',
  convert_tz('2019-11-12 07:36:16.088', '-08:00', @@session.time_zone),
  convert_tz('2019-11-12 07:36:16.088', '-08:00', @@session.time_zone),
  convert_tz('2019-11-12 07:36:16.088', 'America/Los_Angeles', @@session.time_zone),
  time '07:36:16.088',
  convert_tz('07:36:16.088', '-08:00', @@session.time_zone),
  convert_tz('07:36:16.088', '-08:00', @@session.time_zone),
  3
),
(
  date '2019-11-13',
  timestamp '2019-11-13 04:28:40.489',
  convert_tz('2019-11-13 04:28:40.489', '-08:00', @@session.time_zone),
  convert_tz('2019-11-13 04:28:40.489', '-08:00', @@session.time_zone),
  convert_tz('2019-11-13 04:28:40.489', 'America/Los_Angeles', @@session.time_zone),
  time '04:28:40.489',
  convert_tz('04:28:40.489', '-08:00', @@session.time_zone),
  convert_tz('04:28:40.489', '-08:00', @@session.time_zone),
  2
),
(
  date '2019-11-14',
  timestamp '2019-11-14 09:52:17.242',
  convert_tz('2019-11-14 09:52:17.242', '-08:00', @@session.time_zone),
  convert_tz('2019-11-14 09:52:17.242', '-08:00', @@session.time_zone),
  convert_tz('2019-11-14 09:52:17.242', 'America/Los_Angeles', @@session.time_zone),
  time '09:52:17.242',
  convert_tz('09:52:17.242', '-08:00', @@session.time_zone),
  convert_tz('09:52:17.242', '-08:00', @@session.time_zone),
  9
),
(
  date '2019-11-15',
  timestamp '2019-11-15 16:07:25.292',
  convert_tz('2019-11-15 16:07:25.292', '-08:00', @@session.time_zone),
  convert_tz('2019-11-15 16:07:25.292', '-08:00', @@session.time_zone),
  convert_tz('2019-11-15 16:07:25.292', 'America/Los_Angeles', @@session.time_zone),
  time '16:07:25.292',
  convert_tz('16:07:25.292', '-08:00', @@session.time_zone),
  convert_tz('16:07:25.292', '-08:00', @@session.time_zone),
  7
),
(
  date '2019-11-16',
  timestamp '2019-11-16 13:32:16.936',
  convert_tz('2019-11-16 13:32:16.936', '-08:00', @@session.time_zone),
  convert_tz('2019-11-16 13:32:16.936', '-08:00', @@session.time_zone),
  convert_tz('2019-11-16 13:32:16.936', 'America/Los_Angeles', @@session.time_zone),
  time '13:32:16.936',
  convert_tz('13:32:16.936', '-08:00', @@session.time_zone),
  convert_tz('13:32:16.936', '-08:00', @@session.time_zone),
  7
),
(
  date '2019-11-17',
  timestamp '2019-11-17 14:11:38.076',
  convert_tz('2019-11-17 14:11:38.076', '-08:00', @@session.time_zone),
  convert_tz('2019-11-17 14:11:38.076', '-08:00', @@session.time_zone),
  convert_tz('2019-11-17 14:11:38.076', 'America/Los_Angeles', @@session.time_zone),
  time '14:11:38.076',
  convert_tz('14:11:38.076', '-08:00', @@session.time_zone),
  convert_tz('14:11:38.076', '-08:00', @@session.time_zone),
  1
),
(
  date '2019-11-18',
  timestamp '2019-11-18 20:47:27.902',
  convert_tz('2019-11-18 20:47:27.902', '-08:00', @@session.time_zone),
  convert_tz('2019-11-18 20:47:27.902', '-08:00', @@session.time_zone),
  convert_tz('2019-11-18 20:47:27.902', 'America/Los_Angeles', @@session.time_zone),
  time '20:47:27.902',
  convert_tz('20:47:27.902', '-08:00', @@session.time_zone),
  convert_tz('20:47:27.902', '-08:00', @@session.time_zone),
  3
),
(
  date '2019-11-19',
  timestamp '2019-11-19 00:35:23.146',
  convert_tz('2019-11-19 00:35:23.146', '-08:00', @@session.time_zone),
  convert_tz('2019-11-19 00:35:23.146', '-08:00', @@session.time_zone),
  convert_tz('2019-11-19 00:35:23.146', 'America/Los_Angeles', @@session.time_zone),
  time '00:35:23.146',
  convert_tz('00:35:23.146', '-08:00', @@session.time_zone),
  convert_tz('00:35:23.146', '-08:00', @@session.time_zone),
  5
),
(
  date '2019-11-20',
  timestamp '2019-11-20 20:09:55.752',
  convert_tz('2019-11-20 20:09:55.752', '-08:00', @@session.time_zone),
  convert_tz('2019-11-20 20:09:55.752', '-08:00', @@session.time_zone),
  convert_tz('2019-11-20 20:09:55.752', 'America/Los_Angeles', @@session.time_zone),
  time '20:09:55.752',
  convert_tz('20:09:55.752', '-08:00', @@session.time_zone),
  convert_tz('20:09:55.752', '-08:00', @@session.time_zone),
  1
);

