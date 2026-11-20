(ns metabase-enterprise.data-testing.util
  "Helpers shared across the module."
  (:require
   [metabase.driver :as driver]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn fold-identifier :- [:maybe :string]
  "`identifier`, a schema, table or column name, lower-cased, or nil when there is none: the form in which this module
  compares names without regard to case."
  [identifier :- [:maybe :string]]
  (some-> identifier u/lower-case-en))

(mu/defn column-key :- :string
  "The key by which this module compares the column name `column-name`: two names are one column iff their keys are
  equal. `ignore-case?` says whether the database ignores case in column names."
  [ignore-case? :- :boolean
   column-name  :- :string]
  (if ignore-case? (fold-identifier column-name) column-name))

(defmulti column-names-ignore-case?
  "Whether `driver` treats two column names that differ only in case as one name, so that a table cannot hold both.
  False unless a driver says otherwise."
  {:arglists '([driver])}
  identity
  :hierarchy #'driver/hierarchy)

(defmethod column-names-ignore-case? :default [_driver] false)

;; MySQL and MariaDB, SQL Server with its default collation, and DuckDB compare column names without regard to case.
;; Redshift folds quoted names to lower case too, unless `enable_case_sensitive_identifier` is on.
(doseq [driver [:mysql :sqlserver :motherduck :redshift]]
  (defmethod column-names-ignore-case? driver [_driver] true))
