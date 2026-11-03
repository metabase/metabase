(ns metabase.sql-to-mbql.core
  "Converts SQL to MBQL. For now that is a single SQL expression on its own, in the warehouse's dialect: a computed
  column or a filter's condition, such as `sales / target` or `status = 'Shipped' AND amount > 0`, or an aggregate
  expression, a metric's, such as `SUM(net_amount) / COUNT(DISTINCT order_id)`. A whole query, a `SELECT` with its
  `FROM`, joins and `GROUP BY`, does not convert. See the module's README for the subset of SQL that converts, what does
  not and why."
  (:require
   [metabase.sql-to-mbql.expression :as expression]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(mr/def ::dialect
  "The sqlglot dialect the SQL is written in, see [[metabase.sql-tools.core/driver->dialect]]; nil for sqlglot's
  default."
  ::expression/dialect)

(mr/def ::resolve-column
  "The callback [[value->mbql]], [[condition->mbql]] and [[aggregation->mbql]] resolve each column name with, to a new
  Lib ref on each call."
  ::expression/resolve-column)

(mr/def ::expression
  "What [[value->mbql]] returns: a Lib expression, or a literal."
  ::expression/value)

(mr/def ::condition
  "What [[condition->mbql]] returns: a Lib filter clause."
  ::expression/condition)

(mr/def ::aggregation
  "What [[aggregation->mbql]] returns: a Lib aggregation clause."
  ::expression/aggregation)

(p/import-vars
 [expression
  aggregation->mbql
  condition->mbql
  truncation-unit
  unsupported?
  value->mbql])
