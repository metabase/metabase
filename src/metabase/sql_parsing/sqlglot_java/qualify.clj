(ns metabase.sql-parsing.sqlglot-java.qualify
  "What a query resolves to once sqlglot has qualified it: `validate_query` and `returned_columns_lineage`."
  (:require
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.sql-parsing.sqlglot-java.references :as references])
  (:import
   (com.metabase.sqlglot.ast Expr Expressions$Alias Expressions$Column Expressions$Query Expressions$Table)
   (com.metabase.sqlglot.reference Lineage Lineage$Node OptimizeError ParseError Qualify Qualify$Options)))

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
  "A parse or qualification failure as a structured error. Unrecognised messages come back as `unhandled`."
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
  schema is empty, against the schema it implies (permissive: only the syntax is checked)."
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

;;; ---------------------------------------------- returned-columns-lineage ----------------------------------------------

(defn- selected [^Lineage$Node node]
  (let [expression (.expression node)]
    (if (instance? Expressions$Alias expression)
      (ast/this expression)
      expression)))

(defn- pure-column?
  "Whether the lineage graph under `root` is a path of columns ending in a table."
  [^Lineage$Node root]
  (every? (fn [^Lineage$Node node]
            (and (<= (count (.downstream node)) 1)
                 (some #(instance? % (selected node)) [Expressions$Column Expressions$Table])))
          (.walk root)))

(defn- leaf-columns
  "`[catalog schema table column]` of the table columns the lineage graph under `root` ends in."
  [^Lineage$Node root]
  (set (for [^Lineage$Node node (.walk root)
             :let  [[^Lineage$Node child :as downstream] (.downstream node)]
             ;; The leaves of the walk are tables; the columns read from them are the level above.
             :when (and (= 1 (count downstream))
                        (instance? Expressions$Table (.expression child))
                        (empty? (.downstream child)))
             :let  [column (ast/this (.expression node))]
             ;; For a table function the level above may not be a column (e.g. FLATTEN results).
             :when (instance? Expressions$Column column)
             :let  [table (references/table-parts (.expression child))]
             :when table]
         (conj table (ast/node-name column)))))

(defn returned-columns-lineage
  "`[name pure? [[catalog schema table column] ...]]` for each column `sql` returns: whether the column is a table
  column passed through unchanged, and the table columns it is computed from."
  [dialect sql default-table-schema schema]
  (let [stmt (qualify! (ast/parse-one sql dialect)
                       {:db            default-table-schema
                        :dialect       dialect
                        :schema        schema
                        :infer-schema? true
                        :validate?     true
                        :sql           sql})
        _    (when-not (instance? Expressions$Query stmt)
               (throw (ast/python-error "AssertionError" "Ast does not represent a `Query`.")))
        qualified-sql (ast/sql stmt dialect)]
    (vec (for [select-name (.namedSelects ^Expr stmt)
               ;; `lineage(column, sql, schema, sources, dialect, scope, trim_selects, copy)` as sql_tools.py calls it,
               ;; then the port's two extras: a node callback (a Consumer) and Qualify$Options for the
               ;; qualification `lineage` runs, both nil.
               :let [^Lineage$Node root (Lineage/lineage select-name qualified-sql nil nil dialect nil true true nil nil)]]
           [select-name (pure-column? root) (vec (leaf-columns root))]))))
