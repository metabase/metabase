DROP DATABASE IF EXISTS `metabase_test`;
CREATE DATABASE `metabase_test`;

CREATE TABLE `metabase_test`.`metabase_test_lowercases`
(
    id UInt8,
    mystring Nullable(String)
) ENGINE = Memory;

INSERT INTO `metabase_test`.`metabase_test_lowercases`
VALUES (1, 'Я_1'), (2, 'R'), (3, 'Я_2'), (4, 'Я'), (5, 'я'), (6, NULL);

CREATE TABLE `metabase_test`.`enums_test`
(
    enum1 Enum8('foo' = 0, 'bar' = 1, 'foo bar' = 2),
    enum2 Enum16('click' = 0, 'house' = 1),
    enum3 Enum8('qaz' = 42, 'qux' = 23)
) ENGINE = Memory;

INSERT INTO `metabase_test`.`enums_test` (enum1, enum2, enum3)
VALUES ('foo', 'house', 'qaz'),
       ('foo bar', 'click', 'qux'),
       ('bar', 'house', 'qaz');

CREATE TABLE `metabase_test`.`ipaddress_test`
(
    ipvfour Nullable(IPv4),
    ipvsix  Nullable(IPv6)
) Engine = Memory;

INSERT INTO `metabase_test`.`ipaddress_test` (ipvfour, ipvsix)
VALUES (toIPv4('127.0.0.1'), toIPv6('0:0:0:0:0:0:0:1')),
       (toIPv4('0.0.0.0'),   toIPv6('2001:438:ffff:0:0:0:407d:1bc1')),
       (null, null);

CREATE TABLE `metabase_test`.`boolean_test`
(
    ID Int32,
    b1 Bool,
    b2 Nullable(Bool)
) ENGINE = Memory;

INSERT INTO `metabase_test`.`boolean_test` (ID, b1, b2)
VALUES (1, true, true),
       (2, false, true),
       (3, true, false);

CREATE TABLE `metabase_test`.`maps_test`
(
    m Map(String, UInt64)
) ENGINE = Memory;

INSERT INTO `metabase_test`.`maps_test`
VALUES ({'key1':1,'key2':10}),
       ({'key1':2,'key2':20}),
       ({'key1':3,'key2':30});


CREATE TABLE `metabase_test`.`array_of_tuples_test`
(
    t Array(Tuple(String, UInt32))
) Engine = Memory;

INSERT INTO `metabase_test`.`array_of_tuples_test` (t)
VALUES ([('foobar', 1234), ('qaz', 0)]),
       ([]);

-- Used for testing that AggregateFunction columns are excluded,
-- while SimpleAggregateFunction columns are preserved
CREATE TABLE `metabase_test`.`aggregate_functions_filter_test`
(
    idx UInt8,
    a AggregateFunction(uniq, String),
    lowest_value SimpleAggregateFunction(min, UInt8),
    count SimpleAggregateFunction(sum, Int64)
) ENGINE Memory;

INSERT INTO `metabase_test`.`aggregate_functions_filter_test`
    (idx, lowest_value, count)
VALUES (42, 144, 255255);

-- Materialized views (testing .inner tables exclusion)
CREATE TABLE `metabase_test`.`wikistat`
(
    `date`    Date,
    `project` LowCardinality(String),
    `hits`    UInt32
) ENGINE = Memory;

CREATE MATERIALIZED VIEW `metabase_test`.`wikistat_mv` ENGINE =Memory AS
SELECT date, project, sum(hits) AS hits
FROM `metabase_test`.`wikistat`
GROUP BY date, project;

INSERT INTO `metabase_test`.`wikistat`
VALUES (now(), 'foo', 10),
       (now(), 'bar', 10),
       (now(), 'bar', 20);

-- Used in sum-where tests
CREATE TABLE `metabase_test`.`sum_if_test_int`
(
    id            Int64,
    int_value     Int64,
    discriminator String
) ENGINE = Memory;

INSERT INTO `metabase_test`.`sum_if_test_int`
VALUES (1, 1, 'foo'),
       (2, 1, 'foo'),
       (3, 3, 'bar'),
       (4, 5, 'bar');

CREATE TABLE `metabase_test`.`sum_if_test_float`
(
    id            Int64,
    float_value   Float64,
    discriminator String
) ENGINE = Memory;

INSERT INTO `metabase_test`.`sum_if_test_float`
VALUES (1, 1.1,  'foo'),
       (2, 1.44, 'foo'),
       (3, 3.5,  'bar'),
       (4, 5.77, 'bar');

-- Temporal bucketing tests
CREATE TABLE `metabase_test`.`temporal_bucketing_server_tz`
(
    start_of_year DateTime,
    mid_of_year   DateTime,
    end_of_year   DateTime
) ENGINE = Memory;

INSERT INTO `metabase_test`.`temporal_bucketing_server_tz`
VALUES ('2022-01-01 00:00:00',
        '2022-06-20 06:32:54',
        '2022-12-31 23:59:59');

CREATE TABLE `metabase_test`.`temporal_bucketing_column_tz`
(
    start_of_year DateTime('America/Los_Angeles'),
    mid_of_year   DateTime('America/Los_Angeles'),
    end_of_year   DateTime('America/Los_Angeles')
) ENGINE = Memory;

INSERT INTO `metabase_test`.`temporal_bucketing_column_tz`
VALUES (toDateTime('2022-01-01 00:00:00', 'America/Los_Angeles'),
        toDateTime('2022-06-20 06:32:54', 'America/Los_Angeles'),
        toDateTime('2022-12-31 23:59:59', 'America/Los_Angeles'));

CREATE TABLE `metabase_test`.`datetime_diff_nullable` (
    idx  Int32,
    dt64 Nullable(DateTime64(3, 'UTC')),
    dt   Nullable(DateTime('UTC')),
    d    Nullable(Date)
) ENGINE Memory;

INSERT INTO `metabase_test`.`datetime_diff_nullable`
VALUES (42, '2022-01-01 00:00:00.000', '2022-06-20 06:32:54', '2022-07-22'),
       (43, '2022-01-01 00:00:00.000', NULL, NULL),
       (44, NULL, '2022-06-20 06:32:54', '2022-07-22'),
       (45, NULL, NULL, NULL);

DROP DATABASE IF EXISTS `metabase_db_scan_test`;
CREATE DATABASE `metabase_db_scan_test`;

CREATE TABLE `metabase_db_scan_test`.`table1` (i Int32) ENGINE = Memory;
CREATE TABLE `metabase_db_scan_test`.`table2` (i Int64) ENGINE = Memory;

-- Base type matching tests
CREATE TABLE `metabase_test`.`enums_base_types` (
    c1 Nullable(Enum8('America/New_York')),
    c2 Enum8('BASE TABLE' = 1, 'VIEW' = 2, 'FOREIGN TABLE' = 3, 'LOCAL TEMPORARY' = 4, 'SYSTEM VIEW' = 5),
    c3 Enum8('NO', 'YES'),
    c4 Enum16('SHOW DATABASES' = 0, 'SHOW TABLES' = 1, 'SHOW COLUMNS' = 2),
    c5 Nullable(Enum8('GLOBAL' = 0, 'DATABASE' = 1, 'TABLE' = 2)),
    c6 Nullable(Enum16('SHOW DATABASES' = 0, 'SHOW TABLES' = 1, 'SHOW COLUMNS' = 2))
) ENGINE Memory;
CREATE TABLE `metabase_test`.`date_base_types` (
    c1 Date,
    c2 Date32,
    c3 Nullable(Date),
    c4 Nullable(Date32)
) ENGINE Memory;
CREATE TABLE `metabase_test`.`datetime_base_types` (
    c1 Nullable(DateTime('America/New_York')),
    c2 DateTime('America/New_York'),
    c3 DateTime,
    c4 DateTime64(3),
    c5 DateTime64(9, 'America/New_York'),
    c6 Nullable(DateTime64(6, 'America/New_York')),
    c7 Nullable(DateTime64(0)),
    c8 Nullable(DateTime)
) ENGINE Memory;
CREATE TABLE `metabase_test`.`integer_base_types` (
    c1  UInt8,
    c2  UInt16,
    c3  UInt32,
    c4  UInt64,
    c5  UInt128,
    c6  UInt256,
    c7  Int8,
    c8  Int16,
    c9  Int32,
    c10 Int64,
    c11 Int128,
    c12 Int256,
    c13 Nullable(Int32)
) ENGINE Memory;
CREATE TABLE `metabase_test`.`numeric_base_types` (
    c1  Float32,
    c2  Float64,
    c3  Decimal(4, 2),
    c4  Decimal32(7),
    c5  Decimal64(12),
    c6  Decimal128(24),
    c7  Decimal256(42),
    c8  Nullable(Float32),
    c9  Nullable(Decimal(4, 2)),
    c10 Nullable(Decimal256(42))
) ENGINE Memory;
CREATE TABLE `metabase_test`.`string_base_types` (
    c1 String,
    c2 LowCardinality(String),
    c3 FixedString(32),
    c4 Nullable(String),
    c5 LowCardinality(FixedString(4))
) ENGINE Memory;
CREATE TABLE `metabase_test`.`misc_base_types` (
    c1  Boolean,
    c2  UUID,
    c3  IPv4,
    c4  IPv6,
    c5  Map(Int32, String),
    c6  Nullable(Boolean),
    c7  Nullable(UUID),
    c8  Nullable(IPv4),
    c9  Nullable(IPv6),
    c10 Tuple(String, Int32)
) ENGINE Memory;
CREATE TABLE `metabase_test`.`array_base_types` (
    c1 Array(String),
    c2 Array(Nullable(Int32)),
    c3 Array(Array(LowCardinality(FixedString(32)))),
    c4 Array(Array(Array(String)))
) ENGINE Memory;
CREATE TABLE `metabase_test`.`low_cardinality_nullable_base_types` (
    c1 LowCardinality(Nullable(String)),
    c2 LowCardinality(Nullable(FixedString(16)))
) ENGINE Memory;

-- can-connect tests (odd database names)
DROP DATABASE IF EXISTS `Special@Characters~`;
CREATE DATABASE `Special@Characters~`;

-- arrays inner types test
CREATE TABLE `metabase_test`.`arrays_inner_types`
(
    `arr_str`  Array(String),
    `arr_nstr` Array(Nullable(String)),
    `arr_dec`  Array(Decimal(18, 4)),
    `arr_ndec` Array(Nullable(Decimal(18, 4)))
)
ENGINE Memory;
INSERT INTO `metabase_test`.`arrays_inner_types` VALUES (
    ['a', 'b', 'c'],
    [NULL, 'd', 'e'],
    [1, 2, 3],
    [4, NULL, 5]
);

CREATE TABLE `metabase_test`.`unsigned_int_types`
(
    `u8`  UInt8,
    `u16` UInt16,
    `u32` UInt32,
    `u64` UInt64
) ENGINE Memory;
INSERT INTO `metabase_test`.`unsigned_int_types`
VALUES (255, 65535, 4294967295, 18446744073709551615);
