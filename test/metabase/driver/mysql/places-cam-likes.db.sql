SET
  @@session.time_zone = 'UTC';

DROP TABLE IF EXISTS `places`;

CREATE TABLE `places` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` TEXT,
  `liked` BOOLEAN,
  PRIMARY KEY (`id`)
);

-- 3 rows
INSERT INTO "places" ("name", "liked")
VALUES
('Tempest', TRUE),
('Bullit', TRUE),
('The Dentist', FALSE);

