SET SESSION TIMEZONE TO 'UTC';

CREATE TABLE addresses (
  id SERIAL PRIMARY KEY,
  ip INET
);

INSERT INTO addresses (ip)
VALUES
('192.168.1.1'::inet),
('10.4.4.15'::inet);
