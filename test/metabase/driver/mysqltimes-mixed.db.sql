SET
  @@session.time_zone = 'UTC';

DROP TABLE IF EXISTS `times`;

CREATE TABLE `times` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `index` INTEGER,
  `dt` DATETIME(3),
  `dt_tz` TIMESTAMP(3) DEFAULT '1970-01-01 00:00:01',
  `d` DATE,
  `as_dt` TEXT,
  `as_d` TEXT,
  PRIMARY KEY (`id`)
);

DROP TABLE IF EXISTS `weeks`;

CREATE TABLE `weeks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `index` INTEGER,
  `description` TEXT,
  `d` DATE,
  PRIMARY KEY (`id`)
);
