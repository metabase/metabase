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
   [clojure.string :as str]
   [metabase.analytics.core :as analytics]
   [metabase.sql-parsing.common :as common]
   [metabase.sql-parsing.pool :as python.pool]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.io Closeable)
   (java.util.concurrent ExecutionException TimeoutException)
   (org.graalvm.polyglot Value)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Timeout handling --------------------------------------------------

(def ^:private ^:const default-timeout-ms
  "Default timeout for Python operations in milliseconds.
   GraalVM Python can occasionally hang (DEV-1393), so we wrap calls with a timeout."
  30000) ; 30 seconds

(defn- with-timeout*
  "Execute f in a future with timeout. On timeout, throws TimeoutException.
   The caller is responsible for cleaning up resources (e.g., disposing context)."
  [timeout-ms f]
  (let [fut (future (f))]
    (try
      (deref fut timeout-ms ::timeout)
      (catch ExecutionException e
        ;; Unwrap execution exception to get the real cause
        (throw (or (.getCause e) e)))
      (finally
        ;; If we timed out or got an exception, try to cancel the future
        ;; Note: This won't actually interrupt GraalVM, but prevents resource leaks
        (future-cancel fut)))))

(defmacro ^:private with-python-timeout
  "Execute body with a timeout. If timeout is reached:
   1. Interrupts the GraalVM context (actually stops execution)
   2. Poisons context so it gets disposed rather than returned to pool
   3. Logs warning and throws TimeoutException"
  [ctx timeout-ms & body]
  `(let [result# (with-timeout* ~timeout-ms (^:once fn* [] ~@body))]
     (if (= result# ::timeout)
       (do
         ;; Actually interrupt the GraalVM context (1s grace period for soft interrupt)
         ;; This is necessary because future-cancel doesn't stop GraalVM execution
         (python.pool/interrupt! ~ctx 1000)
         (python.pool/poison! ~ctx)
         (analytics/inc! :metabase-sql-parsing/timeouts)
         (log/warn "Python execution timed out after" ~timeout-ms "ms - GraalVM interrupted")
         (throw (TimeoutException. (str "Python execution timed out after " ~timeout-ms "ms"))))
       result#)))

;;; -------------------------------------------------- Public API --------------------------------------------------

(defn referenced-tables
  "Extract table references from SQL.

   Returns a vector of [catalog schema table] 3-tuples:
   [[nil nil \"users\"] [nil \"public\" \"orders\"] [\"myproject\" \"analytics\" \"events\"]]

   This is the pure parsing layer - it returns what's literally in the SQL.
   Default schema resolution happens in the matching layer (core.clj)."
  [dialect sql]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (with-python-timeout ctx default-timeout-ms
      (-> ^Value (common/eval-python ctx "sql_tools.referenced_tables")
          (.execute ^Value (object-array [sql dialect]))
          .asString
          json/decode
          vec))))

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
    (with-python-timeout ctx default-timeout-ms
      (-> ^Value (common/eval-python ctx "sql_tools.referenced_fields")
          (.execute ^Value (object-array [sql dialect]))
          .asString
          json/decode
          vec))))

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
    (with-python-timeout ctx default-timeout-ms
      ;; JSON-encode schema to avoid GraalVM polyglot map conversion issues
      (-> ^Value (common/eval-python ctx "sql_tools.returned_columns_lineage")
          (.execute ^Value (object-array [dialect
                                          sql
                                          default-table-schema
                                          (json/encode sqlglot-schema)]))
          .asString
          json/decode
          vec))))

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
  [dialect sql default-table-schema & [sqlglot-schema]]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (with-python-timeout ctx default-timeout-ms
      ;; JSON-encode schema to avoid GraalVM polyglot map conversion issues
      (-> ^Value (common/eval-python ctx "sql_tools.validate_query")
          (.execute ^Value (object-array [dialect sql default-table-schema (json/encode (or sqlglot-schema "{}"))]))
          .asString
          json/decode+kw))))

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
    (with-python-timeout ctx default-timeout-ms
      (-> ^Value (common/eval-python ctx "sql_tools.simple_query")
          (.execute ^Value (object-array [sql dialect]))
          .asString
          json/decode+kw))))

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
    (with-python-timeout ctx default-timeout-ms
      (-> ^Value (common/eval-python ctx "sql_tools.add_into_clause")
          (.execute ^Value (object-array [sql table-name dialect]))
          .asString))))

(defn- convert-field-type
  "Convert field type string (snake_case) to keyword (kebab-case)."
  [type-str]
  (-> type-str
      (str/replace "_" "-")
      keyword))

(defn- convert-error
  "Convert Python error format to Metabase lib error format."
  [error]
  (let [;; Get type from various possible key formats
        err-type (or (:type error) (get error "type"))
        ;; Get name/table/column from various possible formats
        table-name (or (:table error) (get error "table"))
        column-name (or (:column error) (get error "column") (:name error) (get error "name"))]
    (cond
      ;; Python frozenset came through as vector of pairs: [["type" "syntax_error"]]
      (and (sequential? error) (sequential? (first error)))
      (let [m (into {} error)
            err-type (get m "type")]
        (case err-type
          "syntax_error" {:type :syntax-error}
          "missing_column" {:type :missing-column :name (get m "column")}
          "missing_table_alias" {:type :missing-table-alias :name (get m "table")}
          {:type (keyword err-type)}))

      ;; Handle string or keyword types
      (or (string? err-type) (keyword? err-type))
      (case (if (keyword? err-type) (name err-type) err-type)
        ("syntax-error" "syntax_error") {:type :syntax-error}
        ("missing-column" "missing_column") {:type :missing-column :name column-name}
        ("missing-table-alias" "missing_table_alias") {:type :missing-table-alias :name table-name}
        {:type (keyword err-type)})

      :else error)))

(defn- convert-field
  "Convert a field spec from Python format to Clojure format."
  [field]
  (when field
    (let [field-type (some-> (or (:type field) (get field "type")) convert-field-type)]
      (case field-type
        :single-column
        {:type :single-column
         :column (or (:column field) (get field "column"))
         :alias (or (:alias field) (get field "alias"))
         :source-columns (mapv (fn [scope]
                                 (mapv convert-field scope))
                               (or (:source-columns field)
                                   (:source_columns field)
                                   (get field "source_columns")
                                   []))}

        :all-columns
        {:type :all-columns
         :table (let [t (or (:table field) (get field "table"))]
                  (cond-> {}
                    (or (:table t) (get t "table"))
                    (assoc :table (or (:table t) (get t "table")))
                    (or (:schema t) (get t "schema"))
                    (assoc :schema (or (:schema t) (get t "schema")))
                    (or (:database t) (get t "database"))
                    (assoc :database (or (:database t) (get t "database")))
                    (or (:table-alias t) (:table_alias t) (get t "table_alias"))
                    (assoc :table-alias (or (:table-alias t) (:table_alias t) (get t "table_alias")))))}

        :custom-field
        {:type :custom-field
         :alias (or (:alias field) (get field "alias"))
         :used-fields (set (map convert-field
                                (or (:used-fields field)
                                    (:used_fields field)
                                    (get field "used_fields")
                                    [])))}

        :composite-field
        {:type :composite-field
         :alias (or (:alias field) (get field "alias"))
         :member-fields (mapv convert-field
                              (or (:member-fields field)
                                  (:member_fields field)
                                  (get field "member_fields")
                                  []))}

        :unknown-columns
        {:type :unknown-columns}

        ;; Fallback - return as-is with type conversion
        (assoc field :type field-type)))))

(defn field-references
  "Extract field references from SQL, returning used and returned fields.

   This is the SQLGlot equivalent of Macaw's field-references function.
   Returns a map with:
   - :used-fields - set of field specs from WHERE, JOIN ON, GROUP BY, ORDER BY
   - :returned-fields - vector of field specs from SELECT clause (ordered)
   - :errors - set of validation errors

   Each field spec has:
   - :type - :single-column, :all-columns, :custom-field, :composite-field, or :unknown-columns
   - :column - column name (for single-column)
   - :alias - column alias (nil if none)
   - :source-columns - nested list of possible source columns
   - :table - table info (for all-columns)
   - :used-fields - set of fields used (for custom-field)
   - :member-fields - list of fields (for composite-field)

   On timeout, returns an error map instead of throwing, consistent with the
   'fail soft' pattern used for parsing failures."
  [dialect sql]
  (try
    (with-open [^Closeable ctx (python.pool/python-context)]
      (with-python-timeout ctx default-timeout-ms
        (let [raw (-> ^Value (common/eval-python ctx "sql_tools.field_references")
                      (.execute ^Value (object-array [sql dialect]))
                      .asString
                      json/decode+kw)
              used-fields (or (:used-fields raw) (:used_fields raw) (get raw "used_fields") [])
              returned-fields (or (:returned-fields raw) (:returned_fields raw) (get raw "returned_fields") [])
              errors (or (:errors raw) (get raw "errors") [])]
          {:used-fields (set (map convert-field used-fields))
           :returned-fields (vec (map convert-field returned-fields))
           :errors (set (map convert-error errors))})))
    (catch TimeoutException e
      {:used-fields #{}
       :returned-fields []
       :errors #{{:type :timeout :message (.getMessage e)}}})))

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

   SECURITY: Replacement values are injected into the SQL AST as identifier names
   without sanitization. Callers MUST ensure replacement values are system-generated.
   See sql_tools.py replace_names for details.

   Examples:
   (replace-names \"postgres\" \"SELECT * FROM people\" {:tables [[{:table \"people\"} \"users\"]]})
   => \"SELECT * FROM users\""
  [dialect sql replacements]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (with-python-timeout ctx default-timeout-ms
      (-> ^Value (common/eval-python ctx "sql_tools.replace_names")
          (.execute ^Value (object-array [sql (json/encode replacements) dialect]))
          .asString))))

(comment
  (referenced-tables "postgres" "select * from transactions")

  (validate-sql-query "postgres" "SELECT * FROM users")

  (referenced-fields "postgres" "SELECT id, name FROM users WHERE active = true"))
