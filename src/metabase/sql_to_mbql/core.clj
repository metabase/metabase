(ns metabase.sql-to-mbql.core
  "Converts SQL to MBQL. For now that is a single SQL expression on its own, in the warehouse's dialect: the argument
  of an aggregation, a computed column or a filter's condition, such as `sales / target` or
  `status = 'Shipped' AND amount > 0`. A whole query, a `SELECT` with its `FROM`, joins and `GROUP BY`, does not
  convert. See the module's README for the subset of SQL that converts, what does not and why."
  (:require
   [metabase.sql-to-mbql.expression :as expression]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(mr/def ::dialect
  "The sqlglot dialect the SQL is written in, see [[metabase.sql-tools.core/driver->dialect]]; nil for sqlglot's
  default."
  ::expression/dialect)

(mr/def ::resolve-column
  "The callback [[expression->mbql]] resolves each column name with, to a new Lib ref on each call."
  ::expression/resolve-column)

(mr/def ::options
  "The options [[expression->mbql]] takes."
  ::expression/options)

(mr/def ::expression
  "What [[expression->mbql]] returns: a Lib expression or filter clause, or a literal."
  ::expression/value)

(p/import-vars
 [expression
  expression->mbql
  truncation-unit
  unsupported?])
