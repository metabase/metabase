
DROP TABLE IF EXISTS ` times `

CREATE TABLE ` times ` (` id ` INT, ` name ` STRING, ` as_text ` STRING)

-- 3 rows
INSERT INTO "times" ("id", "name", "as_text")
VALUES
(1, 'foo', '20190421164300'),
(2, 'bar', '20200421164300'),
(3, 'baz', '20210421164300');

