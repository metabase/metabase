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

(defn validate-query
  "Validate a SQL query against a schema using sqlglot's qualify optimizer.

   Unlike `validate-sql-query` which only checks syntax, this validates that
   column and table references actually exist in the provided schema.

   Parameters:
   - dialect: SQLGlot dialect string (e.g., \"postgres\", \"mysql\")
   - sql: The SQL query string to validate
   - default-table-schema: Default schema name for unqualified table references
   - sqlglot-schema: Schema map of {schema-name {table-name {column-name type}}}

   Returns a map with:
   - If valid: {:status \"ok\"}
   - If error: {:status \"error\", :type \"...\", :message \"...\", ...}

   Error types:
   - \"unknown_table\": Table not found in schema
   - \"column_not_resolved\": Column not found (includes :column key)
   - \"invalid_expression\": Syntax/parse error
   - \"unhandled\": Other errors"
  [dialect sql default-table-schema sqlglot-schema]
  (with-open [^Closeable ctx (python.pool/python-context)]
    (common/eval-python ctx "import sql_tools")
    (-> ^Value (common/eval-python ctx "sql_tools.validate_query")
        (.execute ^Value (object-array [dialect sql default-table-schema sqlglot-schema]))
        .asString
        json/decode+kw)))

(comment
  (referenced-tables "postgres" "select * from transactions")

  (validate-sql-query "postgres" "SELECT * FROM users")

  (validate-sql-query "postgres" "SELECT * FORM users")

  (validate-query "postgres" "SELECT * FROM users" "public" {"public" {"users" {"id" "INT"}}})

  (referenced-fields "postgres" "SELECT t.id, u.* FROM transactions t LEFT JOIN users u ON t.user_id = u.id")

  (referenced-fields "postgres" "SELECT * from users u left join transactions t on u.id = t.user_id")

  (referenced-fields "postgres" "select * from people")

  (referenced-fields "postgres" "SELECT id, name FROM users WHERE active = true"))
