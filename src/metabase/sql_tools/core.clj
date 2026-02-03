(ns metabase.sql-tools.core
  (:require
   [metabase.sql-tools.settings :as sql-tools.settings]))

(defn- parser-dispatch [parser & _args] parser)

;; TODO: should not be called elsewhere as in this module. Must be public for parser implementations
(defmulti returned-columns-impl
  "Parser specific implementation of [[returned-columns]]. Do not use directly."
  {:arglists '([parser driver native-query])}
  parser-dispatch)

(defn returned-columns
  "Return appdb columns for the `native-query`."
  [driver native-query]
  (returned-columns-impl (sql-tools.settings/sql-tools-parser-backend) driver native-query))

(defmulti referenced-tables-impl
  "Parser specific implementation of [[referenced-tables]]. Do not use directly."
  {:arglists '([parser driver native-query])}
  parser-dispatch)

(defn referenced-tables
  "Return tables referenced by the `native-query`"
  [driver native-query]
  (referenced-tables-impl (sql-tools.settings/sql-tools-parser-backend) driver native-query))

(defmulti validate-query-impl
  "Parser specific implementation of [[validate-query]]. Do not use directly."
  {:arglists '([parser driver native-query])}
  parser-dispatch)

(defn validate-query
  "Validate native query."
  [driver native-query]
  (validate-query-impl (sql-tools.settings/sql-tools-parser-backend) driver native-query))

;; TODO: Workspaces will be merged into master soon. They use `macaw/replace-names`.
;; when that happens we should move their usage behind this API. Later we should
;; implement the Sqlglot's version.
(defmulti replace-names-impl
  "Parser specific implementation of [[replace-names]]. Do not use directly."
  {:arglists '([parser driver query replacements])}
  #'parser-dispatch)

(defn replace-names
  "Replace names in a query."
  [_driver _query _replacements]
  (throw (java.lang.UnsupportedOperationException. "Not implemented."))
  #_(replace-names-impl (sql-tools.settings/sql-tools-parser-backend) driver query))
