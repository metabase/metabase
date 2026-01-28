(ns metabase.sql-tools.core)

(def ^:private default-parser-impl :sqlglot)

;; TODO: respect "other than default" parser choices in implementations
(defn- parser-dispatch [parser & _args] parser)

;; TODO: should not be called elsewhere as in this module. Must be public for parser implementations
(defmulti returned-columns-impl
  "Parser specific implementation of [[returned-columns]]. Do not use directly."
  {:arglists '([parser driver native-query])}
  parser-dispatch)

(defn returned-columns
  "Return appdb columns for the `native-query`."
  [driver native-query]
  (returned-columns-impl default-parser-impl driver native-query))

(defmulti referenced-tables-impl
  "Parser specific implementation of [[referenced-tables]]. Do not use directly."
  {:arglists '([parser driver native-query])}
  parser-dispatch)

(defn referenced-tables
  "Return tables referenced by the `native-query`"
  [driver native-query]
  (referenced-tables-impl default-parser-impl driver native-query))