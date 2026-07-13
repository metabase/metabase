(ns metabase.sql-parsing.core
  "Stateless, dialect-aware SQL parsing with no Metabase dependencies: all functions take strings
  and return strings or simple data structures.

  Parsing runs in-process on the polyglot-sql-ffi native library (a Rust SQL parser/transpiler
  with sqlglot-compatible dialect behavior) loaded via JNA — see [[metabase.sql-parsing.ffi]].
  Calls are thread-safe and need no pooling; memory is bounded by the library's built-in input
  guards, and panics inside the library surface as exceptions rather than crashing the JVM."
  (:require
   [metabase.sql-parsing.analysis :as analysis]
   [metabase.sql-parsing.ffi :as ffi]
   [metabase.sql-parsing.references :as references]
   [metabase.sql-parsing.rewrite :as rewrite]
   [metabase.sql-parsing.values :as values]))

(set! *warn-on-reflection* true)

(defn strip-large-values
  "Replace large VALUES clauses with a single-row NULL placeholder.

   Preserves the column count from the first tuple and all surrounding SQL structure. Applied
   before parsing so multi-megabyte VALUES lists don't blow through the parser's input budget."
  ^String [^String sql]
  (values/strip-large-values sql))

(defn parse-error?
  "Whether `e` was thrown because SQL could not be parsed. Callers that treat unparseable SQL as
  \"no references\" should catch and check with this rather than matching messages."
  [e]
  (ffi/parse-error? e))

(defn referenced-tables
  "Extract table references from SQL.

   Returns a vector of [catalog schema table] 3-tuples:
   [[nil nil \"users\"] [nil \"public\" \"orders\"] [\"myproject\" \"analytics\" \"events\"]]

   This is the pure parsing layer - it returns what's literally in the SQL.
   Default schema resolution happens in the matching layer (sql-tools). Throws on unparseable SQL
   (see [[parse-error?]])."
  [dialect sql]
  (references/referenced-tables dialect (values/strip-large-values sql)))

(defn referenced-fields
  "Extract field references from SQL, returning only fields from actual database tables.

   Returns a vector of [catalog schema table field] 4-tuples:
   [[nil nil \"users\" \"id\"] [nil \"public\" \"orders\" \"total\"]]

   Includes wildcards as [catalog schema table \"*\"] and all specific column references.
   Excludes fields from CTEs or subqueries and table aliases (returns actual table names).

   Examples:
   (referenced-fields \"postgres\" \"SELECT id FROM users\")
   => [[nil nil \"users\" \"id\"]]

   (referenced-fields \"bigquery\" \"SELECT * FROM myproject.analytics.events\")
   => [[\"myproject\" \"analytics\" \"events\" \"*\"]]"
  [dialect sql]
  (references/referenced-fields dialect (values/strip-large-values sql)))

(defn field-references
  "Extract field references from SQL, returning used and returned fields.

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

   Unparseable SQL yields an empty result with a :syntax-error rather than throwing."
  [dialect sql]
  (references/field-references dialect (values/strip-large-values sql)))

(defn returned-columns-lineage
  "Extract column lineage from SQL query, showing which output columns depend on which source
   columns.

   Returns a vector of [alias pure? [[catalog schema table col] ...]] tuples:
   - alias: The output column name/alias
   - pure?: Boolean - true if the column is a direct pass-through from a source column
   - deps: Vector of [catalog schema table column] dependencies

   Requires a schema map of the form:
   {\"schema_name\" {\"table_name\" {\"column_name\" \"TYPE\"}}}"
  [dialect sql default-table-schema sqlglot-schema]
  (analysis/returned-columns-lineage dialect (values/strip-large-values sql) default-table-schema sqlglot-schema))

(defn validate-query
  "Validate a SQL query, optionally against a schema.

   **Strict mode** (sqlglot-schema provided): also validates that column references can be
   resolved against the provided schema.

   **Permissive mode** (sqlglot-schema nil or empty): only checks SQL syntax.

   Parameters:
   - dialect: dialect string (e.g. \"postgres\", \"mysql\"), or nil
   - sql: the SQL query string to validate
   - default-table-schema: default schema name for unqualified table references
   - sqlglot-schema: {schema-name {table-name {column-name type}}}, or nil/empty

   Returns {:status \"ok\"} or {:status \"error\", :type \"...\", :message \"...\", ...} with
   error types \"column_not_resolved\", \"unknown_table\", \"invalid_expression\", \"unhandled\".
   Unknown tables are not reported - that detection happens in the sql-tools layer against actual
   database metadata."
  [dialect sql default-table-schema & [sqlglot-schema]]
  (analysis/validate-query dialect (values/strip-large-values sql) default-table-schema sqlglot-schema))

(defn simple-query?
  "Check if SQL is a simple SELECT without LIMIT, OFFSET, or CTEs.

   Used by Workspaces to determine if automatic checkpoints can be inserted.

   Returns {:is_simple true} or {:is_simple false :reason \"...\"}.

   Examples:
   (simple-query? \"postgres\" \"SELECT * FROM users\")
   => {:is_simple true}

   (simple-query? nil \"SELECT * FROM users LIMIT 10\")
   => {:is_simple false :reason \"Contains a LIMIT\"}"
  [dialect sql]
  (analysis/simple-query? dialect (values/strip-large-values sql)))

(defn add-into-clause
  "Add an INTO clause to a SELECT statement for SQL Server SELECT INTO syntax.

   Transforms: 'SELECT * FROM products'
   Into:       'SELECT * INTO \"TABLE\" FROM products'

   `table-name` is the target table name, already formatted/quoted. Throws if `sql` is not a
   SELECT statement."
  [dialect sql table-name]
  (rewrite/add-into-clause dialect sql table-name))

(defn replace-names
  "Replace schema, table, and column names in SQL.

   Parameters:
   - dialect: dialect string (e.g. \"postgres\", \"mysql\"), or nil
   - sql: the SQL query string
   - replacements: a map with optional keys:
     - :schemas - map of old-schema-name -> new-schema-name
     - :tables - seq of [{:db? d :schema? s :table t} target] pairs; target is a new name string
       or a {:db? :schema? :table?} map where a present-but-nil key clears that qualifier
     - :columns - seq of [{:schema? s :table? t :column c} new-name] pairs

   Returns modified SQL string.

   SECURITY: Replacement values are injected into the SQL AST as identifier names without
   sanitization. Callers MUST ensure replacement values are system-generated.

   Examples:
   (replace-names \"postgres\" \"SELECT * FROM people\" {:tables [[{:table \"people\"} \"users\"]]})
   => \"SELECT * FROM users\""
  [dialect sql replacements]
  (rewrite/replace-names dialect sql replacements))

(defn is-single-stmt-of-type?
  "Validates that a query is a single read statement (SELECT) or a single write statement (INSERT,
   UPDATE, DELETE) and returns the query reconstructed from the parsed AST."
  [dialect sql stmt-type]
  (let [stripped-sql (values/strip-large-values sql)
        result       (analysis/is-single-stmt-of-type? dialect stripped-sql stmt-type)]
    ;; The :sql in the result is reconstructed from the parsed AST. We generally want the
    ;; reconstructed SQL, but if the original had its VALUES stripped we return the original to
    ;; preserve the values. (#74284)
    (cond-> result
      (not= sql stripped-sql) (assoc :sql sql))))

(defn transpile-sql
  "Transpiles sql string from one dialect to another. Returns
   {:status :success :transpiled-sql ..}, {:status :skipped :reason .. :transpiled-sql ..} for
   templated queries or missing dialects, or {:status :error :error-message ..}."
  [sql from-dialect to-dialect]
  (rewrite/transpile-sql sql from-dialect to-dialect))
