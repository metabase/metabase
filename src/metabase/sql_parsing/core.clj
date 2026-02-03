(ns metabase.sql-parsing.core
  "Stateless SQL parsing via sqlglot (Python) and GraalVM Polyglot.

  This module provides dialect-aware SQL parsing with no Metabase dependencies.
  All functions take strings and return strings/simple data structures.

  API:
    (referenced-tables sql dialect) → [[catalog schema table] ...]
    (referenced-fields dialect sql) → [[catalog schema table field] ...]
    (returned-columns-lineage dialect sql schema schema-map) → [[col pure? deps] ...]
    (validate-query dialect sql schema schema-map) → {:status :ok} | {:status :error ...}"
  (:require
   [metabase.sql-parsing.common :as common]
   [metabase.sql-parsing.pool :as python.pool]
   [metabase.util.json :as json])
  (:import
   (java.io Closeable)
   (org.graalvm.polyglot Value)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Public API --------------------------------------------------

(defn referenced-tables
  "Extract table references from SQL.

   Returns a vector of [catalog schema table] 3-tuples:
   [[nil nil \"users\"] [nil \"public\" \"orders\"] [\"myproject\" \"analytics\" \"events\"]]

   This is the pure parsing layer - it returns what's literally in the SQL.
   Default schema resolution happens in the matching layer (core.clj)."
  [dialect sql]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.referenced_tables")
        (.execute ^Value (object-array [sql dialect]))
        .asString
        json/decode
        vec)))

;; TODO: remove in favor of validate-query implemented later in this ns (when done with impl).
(defn validate-sql-query
  "Validate a SQL query using sqlglot's parser.

   Returns a map with validation results:
   - If valid: {:valid true}
   - If invalid: {:valid false :errors [{:message \"...\" :line N :col N} ...]}

   Examples:
   (validate-sql-query \"postgres\" \"SELECT * FROM users\")
   => {:valid true}

   (validate-sql-query \"postgres\" \"SELECT * FORM users\")
   => {:valid false :errors [{:message \"...\" :line 1 :col 10}]}"
  [dialect sql]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.validate_sql_query")
        (.execute ^Value (object-array [sql dialect]))
        .asString
        json/decode+kw)))

(defn referenced-fields
  "Extract field references from SQL, returning only fields from actual database tables.

   Returns a vector of [catalog schema table field] 4-tuples:
   [[nil nil \"users\" \"id\"] [nil \"public\" \"orders\" \"total\"]]

   Includes:
   - Wildcards as [catalog schema table \"*\"]
   - All specific column references

   Excludes:
   - Fields from CTEs or subqueries
   - Table aliases (returns actual table names)

   Examples:
   (referenced-fields \"postgres\" \"SELECT id FROM users\")
   => [[nil nil \"users\" \"id\"]]

   (referenced-fields \"postgres\" \"SELECT * FROM public.users\")
   => [[nil \"public\" \"users\" \"*\"]]

   (referenced-fields \"bigquery\" \"SELECT * FROM myproject.analytics.events\")
   => [[\"myproject\" \"analytics\" \"events\" \"*\"]]"
  [dialect sql]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.referenced_fields")
        (.execute ^Value (object-array [sql dialect]))
        .asString
        json/decode
        vec)))

(defn returned-columns-lineage
  "Extract column lineage from SQL query, showing which output columns depend on which source columns.

   Returns a vector of [alias pure? [[schema table col]...]] tuples:
   - alias: The output column name/alias
   - pure?: Boolean - true if the column is a direct pass-through from a source column
   - deps: Vector of [schema table column] dependencies

   Requires a schema map of the form:
   {\"schema_name\" {\"table_name\" {\"column_name\" \"TYPE\"}}}

   Examples:
   (returned-columns-lineage \"postgres\" \"SELECT id FROM users\" nil {nil {\"users\" {\"id\" \"INT\"}}})
   => [[\"id\" true [[[nil \"users\" \"id\"]]]]]

   (returned-columns-lineage \"postgres\" \"SELECT id + 1 as computed FROM users\" nil schema)
   => [[\"computed\" false [[[nil \"users\" \"id\"]]]]]"
  [dialect sql default-table-schema sqlglot-schema]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    ;; JSON-encode schema to avoid GraalVM polyglot map conversion issues
    (-> ^Value (common/eval-python ctx "sql_tools.returned_columns_lineage")
        (.execute ^Value (object-array [dialect
                                        sql
                                        default-table-schema
                                        (json/encode sqlglot-schema)]))
        .asString
        json/decode
        vec)))

(defn validate-query
  "Validate a SQL query against a schema using sqlglot's qualify optimizer.

   Operates in two modes based on whether a schema is provided:

   **Strict mode** (sqlglot-schema provided):
   Validates that column and table references exist in the provided schema.
   Returns errors for unknown tables, unresolved columns, missing table aliases.

   **Permissive mode** (sqlglot-schema is nil or empty):
   Only checks SQL syntax. Infers schema from query structure.
   Useful for UDTFs and queries where the schema is unknown.

   Parameters:
   - dialect: SQLGlot dialect string (e.g., \"postgres\", \"mysql\"), or nil
   - sql: The SQL query string to validate
   - default-table-schema: Default schema name for unqualified table references
   - sqlglot-schema: Schema map of {schema-name {table-name {column-name type}}},
                     or nil/empty for permissive mode

   Returns a map with:
   - If valid: {:status \"ok\"}
   - If error: {:status \"error\", :type \"...\", :message \"...\", ...}

   Error types (strict mode):
   - \"unknown_table\": Table not found in schema
   - \"column_not_resolved\": Column not found (includes :column key)
   - \"invalid_expression\": Syntax/parse error
   - \"unhandled\": Other errors"
  [dialect sql default-table-schema sqlglot-schema]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    ;; JSON-encode schema to avoid GraalVM polyglot map conversion issues
    (-> ^Value (common/eval-python ctx "sql_tools.validate_query")
        (.execute ^Value (object-array [dialect sql default-table-schema (json/encode sqlglot-schema)]))
        .asString
        json/decode+kw)))

(defn simple-query?
  "Check if SQL is a simple SELECT without LIMIT, OFFSET, or CTEs.

   Used by Workspaces to determine if automatic checkpoints can be inserted.

   Parameters:
   - dialect: SQLGlot dialect string (e.g., \"postgres\", \"mysql\"), or nil for default
   - sql: The SQL query string to check

   Returns a map with:
   - :is_simple - boolean indicating if query is simple
   - :reason - string explaining why query is not simple (when false)

   Examples:
   (simple-query? \"postgres\" \"SELECT * FROM users\")
   => {:is_simple true}

   (simple-query? nil \"SELECT * FROM users LIMIT 10\")
   => {:is_simple false :reason \"Contains a LIMIT\"}"
  [dialect sql]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.simple_query")
        (.execute ^Value (object-array [sql dialect]))
        .asString
        json/decode+kw)))

(defn add-into-clause
  "Add an INTO clause to a SELECT statement for SQL Server SELECT INTO syntax.

   Transforms: 'SELECT * FROM products'
   Into:       'SELECT * INTO \"TABLE\" FROM products'

   Used by SQL Server compile-transform which requires SELECT INTO syntax
   instead of CREATE TABLE AS SELECT.

   Parameters:
   - dialect: SQLGlot dialect string (e.g., \"tsql\" for SQL Server)
   - sql: The SELECT SQL query string
   - table-name: The target table name (already formatted/quoted)

   Returns: Modified SQL string with INTO clause"
  [dialect sql table-name]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.add_into_clause")
        (.execute ^Value (object-array [sql table-name dialect]))
        .asString)))

(defn replace-names
  "Replace schema, table, and column names in SQL.

   Parameters:
   - dialect: SQLGlot dialect string (e.g., \"postgres\", \"mysql\"), or nil
   - sql: The SQL query string
   - replacements: A map with optional keys:
     - :schemas - map of old-schema-name -> new-schema-name
     - :tables - seq of [[{:schema s :table t} new-name] ...]
     - :columns - seq of [[{:schema s :table t :column c} new-name] ...]

   Returns modified SQL string.

   Examples:
   (replace-names \"postgres\" \"SELECT * FROM people\" {:tables [[[{:table \"people\"} \"users\"]]})
   => \"SELECT * FROM users\""
  [dialect sql replacements]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.replace_names")
        (.execute ^Value (object-array [sql (json/encode replacements) dialect]))
        .asString)))

(comment
  (referenced-tables "postgres" "select * from transactions")

  (validate-sql-query "postgres" "SELECT * FROM users")

  (validate-sql-query "postgres" "SELECT * FORM users")

  (validate-query "postgres" "SELECT * FROM users" "public" {"public" {"users" {"id" "INT"}}})

  (referenced-fields "postgres" "SELECT t.id, u.* FROM transactions t LEFT JOIN users u ON t.user_id = u.id")

  (referenced-fields "postgres" "SELECT * from users u left join transactions t on u.id = t.user_id")

  (referenced-fields "postgres" "select * from people")

  (referenced-fields "postgres" "SELECT id, name FROM users WHERE active = true"))

(comment
  (referenced-tables "postgres" "select * from transactions"))

(comment ;; Generate sql parsing reports

  (require '[clojure.string :as str])
  (require '[clojure.pprint :as pp])

  (def sql-block-pattern #"(?s)```sql\n(.*?)```")

  (defn corpus-path [driver]
    ;; You will need to change this!
    (str "/Users/bcm/dv/mb/query_corpus/drivers/" driver ".md"))

  (defn collect-corpus-stats [fxn driver]
    (let [corpus (slurp (corpus-path driver))
          queries (->> (re-seq sql-block-pattern corpus)
                       (map second)
                       (map str/trim)
                       distinct
                       vec)
          ddriver (if (= "sqlserver" driver) "tsql" driver)
          outcome (doall (for [q queries]
                           (do #_(println "---")
                            #_(println "SQL:" (subs q 0 (min 80 (count q))) "...")
                            (try
                              {:tables (fxn ddriver q) :query q}
                              (catch Exception e (do (println "Error:" (.getMessage e)) {:tables ::error :query q}))))))
          total (count outcome)
          success (count (filter #(not= (:tables %) ::error) outcome))
          fail (- total success)]
      {:driver driver
       :total total
       :success success
       :fail fail}))

  ;; (collect-corpus-stats referenced-tables "postgres")

  (def api-function-info
    {:referenced-tables referenced-tables
     :referenced-fields referenced-fields
     :validate-sql-query validate-sql-query})

  (defn create-report [function-kw]
    (let
     [fxn (get api-function-info function-kw)
      all (mapv (fn [driver]
                  (println "\n\n------------\n"
                           "Collecting " function-kw " stats for: " driver)
                  [driver (collect-corpus-stats fxn driver)])
                ["bigquery" "clickhouse" "mysql" "postgres" "redshift" "snowflake" "sqlserver"])]
      [function-kw all]))

  (defn create-all-reports []
    (mapv create-report (keys api-function-info)))

  (defn format-report [[function-kw all]]
    (println (name function-kw))
    (pp/print-table
     (map (fn [[_ {:keys [driver total success fail]}]]
            {:driver driver
             :pct (format "%.1f%%" (* 100.0 (/ success total)))
             :total total
             :success success
             :fail fail})
          all)))

  (def all-reports
    (create-all-reports)
    (println "Done."))

  (doseq [r all-reports]
    (println "```")
    (format-report r)
    (println "```\n")))

(comment

  (validate-sql-query "postgres" "select * FROM no_table")
  (referenced-tables "postgres" "select * FROM no_table"))
