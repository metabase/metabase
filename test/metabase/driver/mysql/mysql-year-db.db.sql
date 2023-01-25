SET @@session.time_zone = 'UTC';

CREATE TABLE years (
  id integer AUTO_INCREMENT NOT NULL PRIMARY KEY,
  year_column YEAR
);

INSERT INTO years (year_column)
VALUES
(2001),
(2002),
(1999);
