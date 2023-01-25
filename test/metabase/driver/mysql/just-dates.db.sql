SET
  @@session.time_zone = 'UTC';

DROP TABLE IF EXISTS `just_dates`;

CREATE TABLE `just_dates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` TEXT,
  `ts` TEXT,
  `d` TEXT,
  PRIMARY KEY (`id`)
);

-- 3 rows
INSERT INTO "just_dates" ("id", "name", "ts", "d")
VALUES
(1, 'foo', '2004-10-19 10:23:54', '2004-10-19'),
(2, 'bar', '2008-10-19 10:23:54', '2008-10-19'),
(3, 'baz', '2012-10-19 10:23:54', '2012-10-19');

