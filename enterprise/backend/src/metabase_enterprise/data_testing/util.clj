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
  False by default."
  {:arglists '([driver])}
  identity
  :hierarchy #'driver/hierarchy)

(defmethod column-names-ignore-case? :default [_driver] false)

;; Every driver that runs data tests states its answer, so that a new one cannot take the default by omission. SQL
;; Server ignores case under its default collation, and Redshift unless `enable_case_sensitive_identifier` is on.
(doseq [[driver ignores-case?] {:h2         false
                                :postgres   false
                                :clickhouse false
                                :mysql      true
                                :sqlserver  true
                                :motherduck true
                                :redshift   true}]
  (defmethod column-names-ignore-case? driver [_driver] ignores-case?))
