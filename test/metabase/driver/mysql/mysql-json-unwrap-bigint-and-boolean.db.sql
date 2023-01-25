SET @@session.time_zone = 'UTC';

CREATE TABLE `bigint-and-bool-table` (
  id INTEGER AUTO_INCREMENT NOT NULL PRIMARY KEY,
  jsoncol JSON
);

INSERT INTO `bigint-and-bool-table` (jsoncol)
VALUES
('{"mybool":true, "myint":1234567890123456789}'),
('{"mybool":false,"myint":12345678901234567890}'),
('{"mybool":true, "myint":123}');
