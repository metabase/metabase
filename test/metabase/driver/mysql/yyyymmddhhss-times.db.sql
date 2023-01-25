SET
  @@session.time_zone = 'UTC';

DROP TABLE IF EXISTS `times`;

CREATE TABLE `times` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` TEXT,
  `as_text` TEXT,
  PRIMARY KEY (`id`)
);

-- 3 rows
INSERT INTO "times" ("id", "name", "as_text")
VALUES
(1, 'foo', '20190421164300'),
(2, 'bar', '20200421164300'),
(3, 'baz', '20210421164300');

