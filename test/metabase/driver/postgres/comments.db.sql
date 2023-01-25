SET SESSION TIMEZONE TO 'UTC';

CREATE TABLE field_with_comment (
  id SERIAL PRIMARY KEY,
  with_comment TEXT,
  no_comment TEXT
);

COMMENT ON COLUMN field_with_comment.with_comment IS 'original comment';

CREATE TABLE table_without_comment (
  id SERIAL PRIMARY KEY,
  foo TEXT
);

CREATE TABLE table_with_comment (
  id SERIAL PRIMARY KEY,
  foo TEXT
);

COMMENT ON TABLE table_with_comment IS 'table comment';

INSERT INTO field_with_comment (with_comment, no_comment)
VALUES
('foo', 'bar');

INSERT INTO table_without_comment (foo)
VALUES
('bar');

INSERT INTO table_with_comment (foo)
VALUES
('bar');
