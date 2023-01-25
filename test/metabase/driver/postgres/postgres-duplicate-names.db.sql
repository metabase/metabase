SET SESSION TIMEZONE TO 'UTC';

CREATE TABLE birds (
  id SERIAL PRIMARY KEY,
  name TEXT
);

CREATE TABLE people (
  id SERIAL PRIMARY KEY,
  bird_id INTEGER REFERENCES birds (id)
);

INSERT INTO birds (name)
VALUES
('Rasta'),
('Lucky');

INSERT INTO people (name, bird_id)
VALUES
('Cam', 1);
