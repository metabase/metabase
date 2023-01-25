DROP TABLE IF EXISTS number_table;
CREATE TABLE number_table (
  id serial primary key,
  col_bit bit,
  col_bitvarying varbit,
  col_money money,
  col_numeric numeric,
  col_real real,
  col_doubleprecision double precision,
  col_smallint smallint,
  col_int int,
  col_bigint bigint,
  col_smallserial smallserial,
  col_serial serial,
  col_bigserial bigserial
);

INSERT INTO number_table (
  col_bit,
  col_bitvarying,
  col_money,
  col_numeric,
  col_real,
  col_doubleprecision,
  col_smallint,
  col_int,
  col_bigint
)
SELECT
  generate_series(-10, 10000, 1)::BIT,
  generate_series(-10, 10000, 1)::BIT(16),
  generate_series(-10000, 10000000, 1600),
  generate_series(-100, 100000, 12.4),
  generate_series(-100, 100000, 18.914),
  generate_series(-100, 100000, 112.1108),
  generate_series(-10, 100000, 7),
  generate_series(-10, 100000, 17),
  generate_series(-10, 100000, 171)
LIMIT 100;

DROP TABLE IF EXISTS date_table;
CREATE TABLE date_table (
  id serial primary key,
  col_date date,
  col_time time,
  col_timetz timetz,
  col_timestamp timestamp,
  col_timestamptz timestamptz,
  col_interval interval
);

INSERT INTO date_table (
  col_date,
  col_time,
  col_timetz,
  col_timestamp,
  col_timestamptz,
  col_interval
) SELECT
  generate_series('2020-01-01 01:30:00'::timestamp, '2055-12-01 23:30', '71 days'),
  generate_series('2020-01-01 01:30:00'::timestamp, '2025-12-01 23:30', '71 seconds'),
  generate_series('2020-01-01 01:30:00'::timestamptz, '2025-12-01 23:30', '71 minutes'),
  generate_series('2020-01-01 01:30:00'::timestamp, '2025-12-01 23:30', '71 hours'),
  generate_series('2020-01-01 01:30:00'::timestamptz, '2025-12-01 23:30', '17 days'),
  generate_series(1, 1000000, 1000)::varchar::interval
LIMIT 100;

DROP TABLE IF EXISTS misc_table;
CREATE TABLE misc_table (
  id serial primary key,
  col_boolean boolean,

  col_box box,
  col_circle circle,
  col_line line,
  col_lseg lseg,
  col_path path,
  col_point point,
  col_polygon polygon,

  col_tsquery tsquery,
  col_tsvector tsvector,
  col_macaddr macaddr,
  col_macaddr8 macaddr8,
  col_inet inet,
  col_cidr cidr,

  col_pglsn pg_lsn,
  col_bytea bytea
);

DROP TABLE IF EXISTS string_table;
CREATE TABLE string_table (
  id serial primary key,
  col_char char,
  col_varchar varchar,
  col_text text,
  col_json json,
  col_jsonb jsonb,
  col_uuid uuid,
  col_xml xml
);
