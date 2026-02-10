(ns metabase.sql-tools.interface
  "Multimethod definitions for sql-tools parser implementations.

   This namespace contains only the multimethod definitions. Implementations
   are in metabase.sql-tools.macaw.core and metabase.sql-tools.sqlglot.core."
  (:require
   [metabase.driver :as driver]))

(defn parser-driver-dispatch
  "Dispatch function for sql-tools multimethods. Returns the parser keyword (e.g. :macaw, :sqlglot)."
  [parser driver & _args]
  [parser (driver/dispatch-on-initialized-driver driver)])

(defmulti returned-columns-impl
  "Parser specific implementation of [[metabase.sql-tools.core/returned-columns]]. Do not use directly."
  {:arglists '([parser driver native-query])}
  parser-driver-dispatch)

(defmulti referenced-tables-impl
  "Parser specific implementation of [[metabase.sql-tools.core/referenced-tables]]. Do not use directly."
  {:arglists '([parser driver native-query])}
  parser-driver-dispatch)

(defmulti referenced-fields-impl
  "Parser specific implementation of [[metabase.sql-tools.core/referenced-fields]]. Do not use directly."
  {:arglists '([parser driver native-query])}
  parser-driver-dispatch)

(defmulti field-references-impl
  "Parser specific implementation of [[metabase.sql-tools.core/field-references]]. Do not use directly.

  Returns a map with:
  - :used-fields - set of field specs from WHERE, JOIN ON, GROUP BY, ORDER BY
  - :returned-fields - vector of field specs from SELECT clause (ordered)
  - :errors - set of validation errors"
  {:arglists '([parser driver sql-string])}
  parser-driver-dispatch)

(defmulti validate-query-impl
  "Parser specific implementation of [[metabase.sql-tools.core/validate-query]]. Do not use directly."
  {:arglists '([parser driver native-query])}
  parser-driver-dispatch)

(defmulti replace-names-impl
  "Parser specific implementation of [[metabase.sql-tools.core/replace-names]]. Do not use directly."
  {:arglists '([parser driver sql-string replacements opts])}
  parser-driver-dispatch)

(defmulti referenced-tables-raw-impl
  "Parser specific implementation of [[metabase.sql-tools.core/referenced-tables-raw]]. Do not use directly."
  {:arglists '([parser driver sql-str])}
  parser-driver-dispatch)

(defmulti simple-query?-impl
  "Parser specific implementation of [[metabase.sql-tools.core/simple-query?]]. Do not use directly.

  Returns a map with:
  - `:is_simple` - boolean indicating if query is simple
  - `:reason` - string explaining why query is not simple (optional)"
  {:arglists '([parser sql-string])}
  parser-driver-dispatch)

(defmulti add-into-clause-impl
  "Parser specific implementation of [[metabase.sql-tools.core/add-into-clause]]. Do not use directly.

  Transforms a SELECT statement to include an INTO clause for SQL Server style
  SELECT INTO syntax."
  {:arglists '([parser driver sql table-name])}
  parser-driver-dispatch)
