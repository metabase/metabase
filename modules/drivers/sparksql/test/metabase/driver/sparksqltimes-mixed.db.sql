2023-01-25 00:30:09,457 INFO data.sql :: No test data type mapping for driver :sparksql for base type :type/DateTimeWithTZ, falling back to ancestor base type :type/DateTime

DROP TABLE IF EXISTS ` times `

CREATE TABLE ` times ` (
  ` id ` INT,
  ` index ` INTEGER,
  ` dt ` TIMESTAMP,
  ` dt_tz ` TIMESTAMP,
  ` d ` DATE,
  ` as_dt ` STRING,
  ` as_d ` STRING
)

DROP TABLE IF EXISTS ` weeks `

CREATE TABLE ` weeks ` (
  ` id ` INT,
  ` index ` INTEGER,
  ` description ` STRING,
  ` d ` DATE
)
