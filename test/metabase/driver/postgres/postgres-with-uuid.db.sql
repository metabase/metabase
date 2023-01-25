SET SESSION TIMEZONE TO 'UTC';

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  user_id UUID
);

INSERT INTO users (user_id)
VALUES
('4f01dcfd-13f7-430c-8e6f-e505c0851027'::uuid),
('4652b2e7-d940-4d55-a971-7e484566663e'::uuid),
('da1d6ecc-e775-4008-b366-c38e7a2e8433'::uuid),
('7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a'::uuid),
('84ed434e-80b4-41cf-9c88-e334427104ae'::uuid);
