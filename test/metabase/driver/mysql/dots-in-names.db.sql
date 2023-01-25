SET
  @@session.time_zone = 'UTC';

DROP TABLE IF EXISTS `objects.stuff`;

CREATE TABLE `objects.stuff` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `dotted.name` TEXT,
  PRIMARY KEY (`id`)
);

-- 3 rows
INSERT INTO "objects.stuff" ("dotted.name")
VALUES
('toucan_cage'),
('four_loko'),
('ouija_board');

