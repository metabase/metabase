SET
  @@session.time_zone = 'UTC';

DROP TABLE IF EXISTS `times`;

CREATE TABLE `times` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `a_dt_tz` TIMESTAMP(3) DEFAULT '1970-01-01 00:00:01',
  `b_dt_tz` TIMESTAMP(3) DEFAULT '1970-01-01 00:00:01',
  `a_dt_tz_text` TEXT,
  `b_dt_tz_text` TEXT,
  PRIMARY KEY (`id`)
);

-- 35 rows
INSERT INTO "times" ("id", "a_dt_tz", "b_dt_tz", "a_dt_tz_text", "b_dt_tz_text")
VALUES
(1, convert_tz('2022-10-02 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2022-10-03 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-02T00:00:00Z', '2022-10-03T00:00:00+01:00'),
(2, convert_tz('2022-10-02 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2022-10-09 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-02T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(3, convert_tz('2022-10-02 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2022-11-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-02T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(4, convert_tz('2022-10-02 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2023-01-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(5, convert_tz('2022-10-02 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(6, convert_tz('2022-10-02 01:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2022-10-03 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-02T01:00:00+01:00', '2022-10-03T00:00:00Z'),
(7, convert_tz('2022-10-02 01:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2022-10-09 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-02T01:00:00+01:00', '2022-10-09T00:00:00Z'),
(8, convert_tz('2022-10-02 01:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2022-11-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-02T01:00:00+01:00', '2022-11-02T00:00:00Z'),
(9, convert_tz('2022-10-02 01:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-01-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-02T01:00:00+01:00', '2023-01-02T00:00:00Z'),
(10, convert_tz('2022-10-02 01:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-02T01:00:00+01:00', '2023-10-02T00:00:00Z'),
(11, convert_tz('2022-10-03 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2022-10-09 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-03T00:00:00Z', '2022-10-09T00:00:00+01:00'),
(12, convert_tz('2022-10-03 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2022-11-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-03T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(13, convert_tz('2022-10-03 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2023-01-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-03T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(14, convert_tz('2022-10-03 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-03T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(15, convert_tz('2022-10-03 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2022-10-03 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-03T00:00:00+01:00', '2022-10-03T00:00:00Z'),
(16, convert_tz('2022-10-03 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2022-10-09 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-03T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(17, convert_tz('2022-10-03 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2022-11-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-03T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(18, convert_tz('2022-10-03 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-01-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-03T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(19, convert_tz('2022-10-03 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-03T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(20, convert_tz('2022-10-09 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2022-11-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-09T00:00:00Z', '2022-11-02T00:00:00+01:00'),
(21, convert_tz('2022-10-09 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2023-01-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-09T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(22, convert_tz('2022-10-09 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-10-09T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(23, convert_tz('2022-10-09 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2022-10-09 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-09T00:00:00+01:00', '2022-10-09T00:00:00Z'),
(24, convert_tz('2022-10-09 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2022-11-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-09T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(25, convert_tz('2022-10-09 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-01-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-09T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(26, convert_tz('2022-10-09 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-10-09T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(27, convert_tz('2022-11-02 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2023-01-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-11-02T00:00:00Z', '2023-01-02T00:00:00+01:00'),
(28, convert_tz('2022-11-02 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2022-11-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(29, convert_tz('2022-11-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2022-11-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-11-02T00:00:00+01:00', '2022-11-02T00:00:00Z'),
(30, convert_tz('2022-11-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-01-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-11-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(31, convert_tz('2022-11-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'UTC', @@session.time_zone), '2022-11-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(32, convert_tz('2023-01-02 00:00:00.000', 'UTC', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), '2023-01-02T00:00:00Z', '2023-10-02T00:00:00+01:00'),
(33, convert_tz('2023-01-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-01-02 00:00:00.000', 'UTC', @@session.time_zone), '2023-01-02T00:00:00+01:00', '2023-01-02T00:00:00Z'),
(34, convert_tz('2023-01-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'UTC', @@session.time_zone), '2023-01-02T00:00:00+01:00', '2023-10-02T00:00:00Z'),
(35, convert_tz('2023-10-02 00:00:00.000', 'Africa/Lagos', @@session.time_zone), convert_tz('2023-10-02 00:00:00.000', 'UTC', @@session.time_zone), '2023-10-02T00:00:00+01:00', '2023-10-02T00:00:00Z');

