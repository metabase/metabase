SET @@session.time_zone = 'UTC';

CREATE TABLE `number-of-cans` (
  id integer AUTO_INCREMENT NOT NULL PRIMARY KEY,
  thing text,
  `number-of-cans` tinyint(1)
);

INSERT INTO `number-of-cans` (thing, `number-of-cans`)
VALUES
('Six Pack', 6),
('Toucan', 2),
('Empty Vending Machine', 0);
