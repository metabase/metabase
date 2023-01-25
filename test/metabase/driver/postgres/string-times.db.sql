SET
  SESSION TIMEZONE TO 'UTC';

DROP TABLE IF EXISTS "times";

CREATE TABLE "times" (
  "id" SERIAL,
  "name" TEXT,
  "ts" TEXT,
  "d" TEXT,
  "t" TEXT,
  PRIMARY KEY ("id")
);

-- 3 rows
INSERT INTO "times" ("id", "name", "ts", "d", "t")
VALUES
(1, 'foo', '2004-10-19 10:23:54', '2004-10-19', '10:23:54'),
(2, 'bar', '2008-10-19 10:23:54', '2008-10-19', '10:23:54'),
(3, 'baz', '2012-10-19 10:23:54', '2012-10-19', '10:23:54');

