(ns metabase.sql-parsing.sqlglot-java.qualify
  "What a query resolves to once sqlglot has qualified it: `validate_query`."
  (:require
   [metabase.sql-parsing.sqlglot-java.ast :as ast])
  (:import
   (com.metabase.sqlglot.ast Expr)
   (com.metabase.sqlglot.reference OptimizeError ParseError Qualify Qualify$Options)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ qualify ------------------------------------------------------

(defn- qualify!
  "`expr` qualified in place (`qualify.qualify`), with `opts` for the arguments `sql_tools.py` passes. `sql` is the
  text `expr` was parsed from, which an unresolved column's error highlights."
  [expr {:keys [db dialect schema infer-schema? validate? sql]}]
  (Qualify/qualify ^Expr expr schema ^String dialect
                   ;; db catalog expand-alias-refs expand-stars infer-schema allow-partial-qualification
                   ;; validate-columns quote-identifiers identify canonicalize-table-aliases
                   (Qualify$Options. db nil true true infer-schema? false (boolean validate?) true true false)
                   ^String sql))

;;; --------------------------------------------------- validate-query ---------------------------------------------------

(defn- serialize-error
  "A parse or qualification failure as a structured error. Unrecognised messages come back as `unhandled`.
  Port of `serialize_error`."
  [^Exception e]
  (let [message (ex-message e)]
    (if-let [[whole table] (re-find #"^Unknown table:\s*(.*)" message)]
      {:status "error" :type "unknown_table" :message whole :table table}
      (if-let [[_ column-message column details] (re-find #"^(Column '(\S+)' could not be resolved.)(.*)" message)]
        {:status "error" :type "column_not_resolved" :message column-message :column column :details details}
        (if-let [[_ invalid-message details] (re-find #"^(Invalid expression.*?\.)(.*)" message)]
          {:status "error" :type "invalid_expression" :message invalid-message :details details}
          {:status "error" :type "unhandled" :message message})))))

(defn validate-query
  "Whether `sql` qualifies against `schema` (strict: unknown tables and unresolved columns are errors) or, when the
  schema is empty, against the schema it implies (permissive: only the syntax is checked). Port of `validate_query`."
  [dialect sql default-table-schema schema]
  (let [strict? (boolean (seq schema))]
    (try
      (qualify! (ast/parse-one sql dialect)
                {:db            default-table-schema
                 :dialect       dialect
                 :schema        (when strict? schema)
                 :infer-schema? (not strict?)
                 :validate?     strict?
                 :sql           sql})
      {:status "ok"}
      (catch ParseError e
        (serialize-error e))
      (catch OptimizeError e
        (serialize-error e)))))
