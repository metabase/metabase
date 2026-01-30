(ns metabase.sql-parsing.core
  "Stateless SQL parsing via sqlglot (Python) and GraalVM Polyglot.

  This module provides dialect-aware SQL parsing with no Metabase dependencies.
  All functions take strings and return strings/simple data structures.

  API:
    (referenced-tables sql dialect) → [[schema table] ...]
    (returned-columns-lineage dialect sql schema schema-map) → [[col pure? deps] ...]
    (validate-query dialect sql schema schema-map) → {:status :ok} | {:status :error ...}"
  (:require
   [medley.core :as m]
   [metabase.sql-parsing.common :as common]
   [metabase.sql-parsing.pool :as python.pool]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.io Closeable)
   (org.graalvm.polyglot Value)))


;;; -------------------------------------------------- Public API --------------------------------------------------

(defn- analyze-sql-impl
  "Internal implementation that takes a context (either raw Context or PooledContext)."
  ^Value [context sql]
  ;; 1. Import the module (ensure sql_tools is loaded)
  (common/eval-python context "import sql_tools")

  ;; 2. Get the Python function object
  (let [analyze-fn (common/eval-python context "sql_tools.analyze")]

    ;; 3. Call it directly with arguments
    ;; GraalVM handles the conversion of the Clojure string to a Python string
    (.execute ^Value analyze-fn (object-array [sql]))))

(defn analyze-sql
  "Analyze SQL using sqlglot. Uses a pooled Python context for thread-safety."
  [sql]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (analyze-sql-impl ctx sql)))

(defn- analyze-table-joins-impl
  "Internal implementation that takes a context and extracts table join information."
  ^Value [context sql]
  ;; 1. Import the module (ensure sql_tools is loaded)
  (common/eval-python context "import sql_tools")

  ;; 2. Get the Python function object
  (let [analyze-joins-fn (common/eval-python context "sql_tools.analyze_table_joins")]

    ;; 3. Call it directly with arguments
    (.execute ^Value analyze-joins-fn (object-array [sql]))))

(defn analyze-table-joins
  "Analyze SQL to extract table names and their join relationships.
  Returns a map with:
  - :tables - vector of table names
  - :joins - vector of join relationships, each containing:
    - :left-table - the left table in the join
    - :right-table - the right table in the join
    - :join-type - the type of join (INNER, LEFT, RIGHT, etc.)

  Example:
  (analyze-table-joins \"SELECT * FROM a LEFT JOIN b ON a.id = b.a_id JOIN c ON a.id = c.a_id\")
  => {:tables [\"a\" \"b\" \"c\"]
      :joins [{:left-table \"a\" :right-table \"b\" :join-type \"LEFT\"}
              {:left-table \"a\" :right-table \"c\" :join-type \"INNER\"}]}"
  [sql]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (json/decode+kw (.asString ^Value (analyze-table-joins-impl ctx sql)))))

(comment
  (analyze-table-joins "
   SELECT *
   FROM a LEFT JOIN b ON a.id = b.a_id
   JOIN c ON a.id = c.a_id
   LEFT JOIN d ON c.id = d.c_id"))

(defn p
  "Parse SQL and return Clojure data structure.

  Returns map with keys:
  - :tables_source - tables referenced (excluding CTEs)
  - :tables_all    - all tables including CTEs
  - :columns       - column references
  - :projections   - output columns/aliases
  - :ast           - full AST as nested maps

  Example:
    (p \"SELECT id, name FROM users WHERE active = true\")
    ;; => {:tables_source [\"users\"]
    ;;     :columns [\"active\" \"id\" \"name\"]
    ;;     :projections [\"id\" \"name\"]
    ;;     ...}"
  [sql]
  ;; TODO: the shim doesn't 100% return json. need to fix that
  ;;   sqlglot=> (p "-- FIXTURE: interpolation/crosstab
  ;; SELECT * FROM crosstab($$
  ;;     SELECT
  ;;         history.page,
  ;;         date_trunc('month', history.h_timestamp)::DATE,
  ;;         count(history.id) as total
  ;;     FROM history
  ;;     WHERE h_timestamp between '2024-01-01' and '2024-12-01'
  ;;     GROUP BY page, date_trunc('month', history.h_timestamp)
  ;; $$,
  ;;         $$
  ;;             SELECT
  ;;                 date_trunc('month', generate_series('2024-01-01', '2024-02-01', '1 month'::INTERVAL))::DATE
  ;; $$
  ;; ) AS ct(
  ;;     page INTEGER,
  ;;     \"Jan\" FLOAT,
  ;;     \"Feb\" FLOAT
  ;; )")
  ;; Execution error (PolyglotException) at <python>/default (encoder.py:161).
  ;; TypeError: Object of type Type is not JSON serializable
  (json/decode+kw (.asString ^Value (analyze-sql sql))))

(comment
  ;; Quick test
  (p "SELECT id, name FROM users WHERE active = true")

  ;; Test with CTE
  (p "WITH active_users AS (SELECT * FROM users WHERE active)
      SELECT * FROM active_users")

  ;; PostgreSQL dollar-quote (this fails in JSqlParser)
  (p "SELECT $tag$hello$tag$")

  ;; Multiple tables with join
  (p "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id")

  ;; Using with-open for manual pool management:
  (with-open [ctx (acquire-context @python-context-pool)]
    (common/eval-python ctx "import sqlglot")
    (common/eval-python ctx "sqlglot.parse_one('SELECT 1'")))

;;;; Shim part

(defn referenced-tables
  "Extract table references from SQL.

   Returns a vector of [schema-or-nil table-name] pairs:
   [[nil \"users\"] [\"public\" \"orders\"]]

   This is the pure parsing layer - it returns what's literally in the SQL.
   Default schema resolution happens in the matching layer (core.clj)."
  ([sql]
   (referenced-tables sql "postgres"))
  ([sql dialect]
   (with-open [^Closeable ctx (python.pool/python-context)]
     (common/eval-python ctx "import sql_tools")
     (-> ^Value (common/eval-python ctx "sql_tools.referenced_tables")
         (.execute ^Value (object-array [sql dialect]))
         .asString
         json/decode
         vec))))

(comment
  (referenced-tables "select * from transactions")
  )

(defn returned-columns-lineage
  "WIP"
  [dialect sql default-table-schema sqlglot-schema]
  (log/warn "I'm using sqlglot-schema, please fix me.")
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.returned_columns_lineage")
        (.execute ^Value (object-array [dialect
                                        sql
                                        default-table-schema
                                        sqlglot-schema]))
        .asString
        json/decode)))

(defn- sanitize-validation-output
  [validation-output]
  (-> validation-output
      (update :status (comp u/->kebab-case-en keyword))
      (m/update-existing :type (comp u/->kebab-case-en keyword))))

;; TODO: Implement so schema is `sqlglot-schema` (generated from appdb sync data) is not needed.
(defn validate-query
  "WIP"
  [dialect sql default-table-schema sqlglot-schema]
  (log/warn "I'm using sqlglot-schema, please fix me.")
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.validate_query")
        (.execute ^Value (object-array [dialect
                                        sql
                                        default-table-schema
                                        sqlglot-schema]))
        .asString
        json/decode+kw
        sanitize-validation-output)))
