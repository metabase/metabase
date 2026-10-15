(ns metabase.sql-parsing.sqlglot-java.qualify
  "What a query resolves to once sqlglot has qualified it: `validate_query` and `returned_columns_lineage`."
  (:require
   [metabase.sql-parsing.sqlglot-java.ast :as ast]
   [metabase.sql-parsing.sqlglot-java.references :as references])
  (:import
   (com.metabase.sqlglot.ast Expr Expressions$Alias Expressions$Column Expressions$Query Expressions$Select
                             Expressions$Table)
   (com.metabase.sqlglot.reference Errors Errors$Position Lineage Lineage$Node OptimizeError ParseError Qualify
                                   Qualify$Options Scope)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ qualify ------------------------------------------------------

(defn- column-position
  "The `Line: n, Col: m` and highlighted-SQL suffixes for an error about `column`, as sqlglot words them."
  [^Expr column sql line-format]
  (let [meta                 (.meta ^Expr (ast/this column))
        [line col start end] (map #(get meta %) ["line" "col" "start" "end"])]
    (str (when (and line col (pos? line) (pos? col))
           (format line-format line col))
         (when (and sql start end)
           (str "\n  " (.formattedSql (Errors/highlightSql sql [(Errors$Position. start end)])))))))

(defn- validate-qualify-columns!
  "Throw an OptimizeError for the first column of `expr` that no source resolves, or that is ambiguous
  (`validate_qualify_columns`).

  Ported here rather than called on the port, whose `validateQualifyColumns` leaves out the position of the column
  that failed. Remove it once the port reports one."
  [expr sql]
  (let [unqualified (volatile! [])]
    (doseq [^Scope scope (Scope/traverseScope expr)
            :when (instance? Expressions$Select (.expression scope))]
      (when (and (seq (.externalColumns scope)) (not (.isCorrelatedSubquery scope)) (empty? (.pivots scope)))
        (let [column    (first (.externalColumns scope))
              table-ref (ast/text column "table")]
          (throw (OptimizeError. (str "Column '" (ast/node-name column) "' could not be resolved"
                                      (when (seq table-ref) (str " for table: '" table-ref "'"))
                                      "."
                                      (column-position column sql " Line: %s, Col: %s"))))))
      (vswap! unqualified into (.unqualifiedColumns scope)))
    (when-let [column (first @unqualified)]
      (throw (OptimizeError. (str "Ambiguous column '" (ast/node-name column) "'"
                                  (column-position column sql " (Line: %s, Col: %s)")))))
    expr))

(defn- qualify!
  "`expr` qualified in place (`qualify.qualify`), with `opts` for the arguments `sql_tools.py` passes."
  [expr {:keys [db dialect schema infer-schema? validate? sql]}]
  (Qualify/qualify expr schema dialect
                   (Qualify$Options. db nil true true infer-schema? false false true true false))
  (when validate?
    (validate-qualify-columns! expr sql))
  expr)

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
               (throw (ex-info "Ast does not represent a `Query`." {:sql-parsing.sqlglot-java/error-type "AssertionError"})))
        qualified-sql (ast/sql stmt dialect)]
    (vec (for [select-name (.namedSelects ^Expr stmt)
               :let [^Lineage$Node root (Lineage/lineage select-name qualified-sql nil nil dialect nil true true nil nil)]]
           [select-name (pure-column? root) (vec (leaf-columns root))]))))
