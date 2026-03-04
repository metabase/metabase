(ns metabase.driver.sql.query-processor.like-escape-char-built-in
  "In MySQL and some other databases, `LIKE` clause RHS patterns have an escape character defined by default and have
  awkward double-escaping issues with setting a `LIKE pattern ESCAPE '\\'` to the same character.

  This abstract driver overrides [[sql.qp/transform-literal-like-pattern-honeysql]] to an identity function, overriding
  the `:default` behaviour of specifying the `ESCAPE '\\'` clause as the SQL standard suggests.

  See #67667 for more context."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]))

(driver/register! ::like-escape-char-built-in, :abstract? true)

(defmethod sql.qp/transform-literal-like-pattern-honeysql ::like-escape-char-built-in
  [_driver like-rhs-honeysql]
  like-rhs-honeysql)

(prefer-method sql.qp/transform-literal-like-pattern-honeysql ::like-escape-char-built-in :sql)
