SET
  @@session.time_zone = 'UTC';
2023-01-21 01:04:11,932 INFO data.sql :: No test data type mapping for driver :mysql for base type :type/DateTimeWithZoneOffset, falling back to ancestor base type :type/DateTimeWithTZ

DROP TABLE IF EXISTS `checkins`;

CREATE TABLE `checkins` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `person` TEXT,
  `timestamp` TIMESTAMP(3) DEFAULT '1970-01-01 00:00:01',
  PRIMARY KEY (`id`)
);

-- 10 rows
INSERT INTO "checkins" ("person", "timestamp")
VALUES
('Cam', convert_tz('2019-01-02 05:30:00.000', '-07:00', @@session.time_zone)),
('Cam', convert_tz('2019-01-09 05:30:00.000', '-07:00', @@session.time_zone)),
('Kyle', convert_tz('2019-01-06 08:30:00.000', '-07:00', @@session.time_zone)),
('Cam', convert_tz('2019-01-07 04:00:00.000', '-07:00', @@session.time_zone)),
('Sameer', convert_tz('2019-01-26 16:00:00.000', '-07:00', @@session.time_zone)),
('Cam', convert_tz('2019-01-16 07:15:00.000', '-07:00', @@session.time_zone)),
('Tom', convert_tz('2019-01-27 01:30:00.000', '-07:00', @@session.time_zone)),
('Sameer', convert_tz('2019-01-24 14:00:00.000', '-07:00', @@session.time_zone)),
('Maz', convert_tz('2019-01-28 11:45:00.000', '-07:00', @@session.time_zone)),
('Cam', convert_tz('2019-01-25 07:30:00.000', '-07:00', @@session.time_zone));

