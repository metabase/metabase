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

(defmulti referenced-tables-raw-impl
  "Parser specific implementation of [[referenced-tables-raw]]. Do not use directly."
  {:arglists '([parser driver sql-str])}
  #'parser-dispatch)

(defn referenced-tables-raw
  "Given a driver and sql string, returns a set of form #{{:schema <name> :table <name>}...}."
  [driver sql-str]
  (referenced-tables-raw-impl (sql-tools.settings/sql-tools-parser-backend) driver sql-str))

(defmulti simple-query?-impl
  "Parser specific implementation of [[simple-query?]]. Do not use directly.

  Returns a map with:
  - `:is_simple` - boolean indicating if query is simple
  - `:reason` - string explaining why query is not simple (optional)"
  {:arglists '([parser sql-string])}
  parser-dispatch)

(defn simple-query?
  "Check if SQL string is a simple SELECT (no LIMIT, OFFSET, or CTEs).
  Used by Workspaces to determine if automatic checkpoints can be inserted.

  Returns a map with:
  - `:is_simple` - boolean indicating if query is simple
  - `:reason` - string explaining why query is not simple (when false)"
  [sql-string]
  (simple-query?-impl (sql-tools.settings/sql-tools-parser-backend) sql-string))

(defmulti add-into-clause-impl
  "Parser specific implementation of [[add-into-clause]]. Do not use directly.

  Transforms a SELECT statement to include an INTO clause for SQL Server style
  SELECT INTO syntax."
  {:arglists '([parser driver sql table-name])}
  parser-dispatch)

(defn add-into-clause
  "Add an INTO clause to a SELECT statement.

  Transforms: 'SELECT * FROM products'
  Into:       'SELECT * INTO \"TABLE\" FROM products'

  Used by SQL Server compile-transform which requires SELECT INTO syntax
  instead of CREATE TABLE AS SELECT."
  [driver sql table-name]
  (add-into-clause-impl (sql-tools.settings/sql-tools-parser-backend) driver sql table-name))
