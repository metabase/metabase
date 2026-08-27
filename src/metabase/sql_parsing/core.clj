(ns metabase.sql-parsing.core
  "Stateless SQL parsing via sqlglot (Python) and GraalVM Polyglot.

  This module provides dialect-aware SQL parsing with no Metabase dependencies.
  All functions take strings and return strings/simple data structures.

  API:
    (referenced-tables sql dialect) → [[catalog schema table] ...]
    (referenced-fields dialect sql) → [[catalog schema table field] ...]
    (returned-columns-lineage dialect sql schema schema-map) → [[col pure? deps] ...]
    (validate-query dialect sql schema schema-map) → {:status :ok} | {:status :error ...}

  The parsing itself happens behind the [[metabase.sql-parsing.protocol/SqlParser]] protocol (the
  GraalPy or native-CPython implementation, per [[metabase.sql-parsing.parser/parser]]); this namespace
  owns the JVM-side pre- and post-processing around it."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.sql-parsing.parser :as parser]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf])
  (:import
   (java.util.concurrent TimeoutException)))

(set! *warn-on-reflection* true)

(defn- parser
  "The [[metabase.sql-parsing.protocol/SqlParser]] implementation for the configured mode."
  []
  (parser/parser))

(defn parse-error?
  "True if `e` is a sqlglot ParseError — the SQL could not be parsed — regardless of which parser
  backend threw it. Other Python-side failures (and non-sqlglot exceptions) are false."
  [e]
  (let [data (ex-data e)]
    (boolean (and (:sql-parsing/error data)
                  (= "ParseError" (:sql-parsing/python-error-type data))))))

;;; ------------------------------------- Large literal-list stripping -----------------------------------------

;; Large literal lists — VALUES clauses, IN lists (flat or tuple), and ARRAY literals with
;; thousands of items — cause GraalPy OOM/timeouts due to ~114KB per AST node (vs ~1-2KB on
;; CPython). We strip them on the JVM side before passing SQL to Python, because GraalPy is too
;; slow at character-by-character string scanning over multi-MB inputs.

(def ^:private ^:const strip-threshold
  "Strip VALUES clauses with more than this many tuples, and IN lists / ARRAY literals with at
   least this many commas."
  100)

(def ^:private literal-list-keyword-pattern
  "Pattern to find a VALUES, IN, or ARRAY keyword followed by its opening delimiter."
  (re-pattern "(?i)\\b(?:VALUES\\s*\\(|IN\\s*\\(|ARRAY\\s*\\[)"))

(defn- skip-whitespace
  "Return the first non-whitespace position at or after `pos`."
  ^long [^String sql ^long pos ^long n]
  (loop [p pos]
    (if (and (< p n) (Character/isWhitespace (.charAt sql p)))
      (recur (inc p))
      p)))

(defn- skip-string-literal
  "Starting at an opening quote (single or double), advance past the matching closing quote,
   treating a doubled quote as an escape. Returns the position immediately after the closing quote."
  ^long [^String sql ^long pos ^long n]
  (let [q (.charAt sql pos)]
    (loop [i (inc pos)]
      (if (>= i n)
        i
        (if (= (.charAt sql i) q)
          (if (and (< (inc i) n) (= (.charAt sql (inc i)) q))
            (recur (+ i 2)) ; escaped (doubled) quote
            (inc i))
          (recur (inc i)))))))

(defn- skip-balanced-parens
  "Starting at an opening `(`, advance past the matching `)`.
   Handles nested parens and SQL string literals. Returns the position immediately after the closing `)`."
  ^long [^String sql ^long pos ^long n]
  (loop [pos pos, depth 0]
    (if (>= pos n)
      pos
      (let [ch (.charAt sql pos)]
        (cond
          (or (= ch \') (= ch \")) (recur (skip-string-literal sql pos n) depth)
          (= ch \()                (recur (inc pos) (inc depth))
          (= ch \))                (if (= depth 1)
                                     (inc pos) ; done
                                     (recur (inc pos) (dec depth)))
          :else                    (recur (inc pos) depth))))))

(defn- count-top-level-commas
  "Count top-level comma-separated items inside a tuple's content string.
   `(1, 'a', 3)` → inner content `1, 'a', 3` → 3 items."
  ^long [^String content]
  (let [n (.length content)]
    (loop [i 0, depth 0, items 1]
      (if (>= i n)
        items
        (let [ch (.charAt content i)]
          (cond
            (or (= ch \') (= ch \"))    (recur (skip-string-literal content i n) depth items)
            (= ch \()                   (recur (inc i) (inc depth) items)
            (= ch \))                   (recur (inc i) (dec depth) items)
            (and (= ch \,) (= depth 0)) (recur (inc i) depth (inc items))
            :else                       (recur (inc i) depth items)))))))

(defn- count-and-skip-tuples
  "Starting after the first tuple, count how many more `, (...)` tuples follow.
   Returns [total-tuple-count position-after-last-tuple]."
  [^String sql ^long pos ^long n]
  (loop [pos pos, count (int 1)]
    (let [pos (skip-whitespace sql pos n)]
      (if (or (>= pos n) (not= (.charAt sql pos) \,))
        [count pos]
        (let [pos (skip-whitespace sql (inc pos) n)]
          (if (or (>= pos n) (not= (.charAt sql pos) \())
            [count pos]
            (recur (skip-balanced-parens sql pos n) (inc count))))))))

(defn- make-null-placeholder
  "Build `VALUES (NULL, NULL, ...)` preserving the original keyword casing."
  ^String [^String original-keyword ^long col-count]
  (let [nulls (str/join ", " (repeat col-count "NULL"))]
    (str original-keyword " (" nulls ")")))

(defn- extract-keyword
  "Extract just the keyword text from a regex match like `VALUES (`, `IN (`, or `ARRAY [`."
  ^String [^String sql ^long match-start ^long match-end]
  (-> (.substring sql match-start match-end)
      str/trimr
      (str/replace #"[\(\[]$" "")
      str/trimr))

(defn- strip-values-at
  "Decide whether to strip the VALUES clause whose `VALUES (` match spans [match-start, match-end).
   Returns [replacement resume-pos]: a single-row NULL placeholder (column count taken from the
   first tuple) covering the SQL up to resume-pos, or [nil match-end] to leave the clause untouched."
  [^String sql ^long match-start ^long match-end ^long n]
  (let [paren-start (dec match-end)
        first-end   (skip-balanced-parens sql paren-start n)
        [tuple-count end-pos] (count-and-skip-tuples sql first-end n)]
    (if (and (> (long tuple-count) strip-threshold)
             (> first-end (inc paren-start)))
      [(make-null-placeholder (extract-keyword sql match-start match-end)
                              (count-top-level-commas (.substring sql (inc paren-start) (dec first-end))))
       end-pos]
      [nil match-end])))

(defn- simple-list-end
  "Scan the list opening at `open-pos` (`(` or `[`). If it contains only numbers, single-quoted
   strings, signs, commas, whitespace, and balanced parens (VALUES-style tuples), return
   [comma-count end-pos] with end-pos just past the matching closing delimiter. Any other
   character — subqueries, column references, casts, bind parameters — returns nil, leaving the
   list untouched."
  [^String sql ^long open-pos ^long n]
  (let [close-ch (char (if (= (.charAt sql open-pos) \[) \] \)))]
    (loop [i (inc open-pos), depth 1, commas 0]
      (when (< i n)
        (let [ch (.charAt sql i)]
          (cond
            (and (= ch close-ch) (= depth 1)) [commas (inc i)]
            (= ch \')                         (recur (skip-string-literal sql i n) depth commas)
            (= ch \()                         (recur (inc i) (inc depth) commas)
            (= ch \))                         (when (> depth 1) (recur (inc i) (dec depth) commas))
            (= ch \,)                         (recur (inc i) depth (inc commas))
            (or (Character/isDigit ch)
                (Character/isWhitespace ch)
                (= ch \.) (= ch \-) (= ch \+))
            (recur (inc i) depth commas)

            :else nil))))))

(defn- strip-list-at
  "Decide whether to strip the IN list or ARRAY literal whose keyword match spans
   [match-start, match-end). Returns [replacement resume-pos]: `IN (NULL)` / `ARRAY[NULL]`
   covering the whole list, or [nil match-end] to leave it untouched (resuming just inside the
   delimiter, so a large list nested in a subquery — `IN (SELECT ... WHERE x IN (...))` — is
   still found)."
  [^String sql ^long match-start ^long match-end ^long n]
  (let [open-pos         (dec match-end)
        [commas end-pos] (simple-list-end sql open-pos n)]
    (if (and commas (>= (long commas) strip-threshold))
      [(str (extract-keyword sql match-start match-end)
            (if (= (.charAt sql open-pos) \[) "[NULL]" " (NULL)"))
       end-pos]
      [nil match-end])))

(defn- strip-large-literal-lists*
  "Single pass over `sql`, replacing every oversized literal list — VALUES clause or literal-only
   IN list — with a NULL placeholder. Returns `sql` itself when nothing was stripped."
  ^String [^String sql]
  (let [matcher (re-matcher literal-list-keyword-pattern sql)
        n       (.length sql)]
    (if-not (.find matcher)
      sql
      (let [sb (StringBuilder.)]
        (loop [i 0, stripped? false, match? true]
          (if-not match?
            (if stripped?
              (-> sb (.append sql (int i) (int n)) .toString)
              sql)
            (let [match-start (.start matcher)
                  match-end   (.end matcher)
                  [replacement resume] (let [ch (.charAt sql match-start)]
                                         (if (or (= ch \V) (= ch \v))
                                           (strip-values-at sql match-start match-end n)
                                           (strip-list-at sql match-start match-end n)))]
              (if replacement
                (-> sb (.append sql (int i) (int match-start)) (.append ^String replacement))
                (.append sb sql (int i) (int resume)))
              (recur (long resume)
                     (or stripped? (some? replacement))
                     (.find matcher (int resume))))))))))

(defn strip-large-literal-lists
  "Replace large literal lists with NULL placeholders: VALUES clauses with more than
   [[strip-threshold]] tuples become a single-row NULL tuple (preserving the column count from the
   first tuple), and simple IN lists / ARRAY literals — numbers, single-quoted strings, and
   VALUES-style tuples of them — with at least [[strip-threshold]] commas become `IN (NULL)` /
   `ARRAY[NULL]`. All surrounding SQL structure is preserved.

   This runs on the JVM side (fast) before passing SQL to GraalPy (slow at char scanning).
   On any error, returns the original SQL unchanged so parsing can proceed normally.

   Best-effort by design: stripping only feeds fail-soft analysis, and execution paths restore the
   original SQL when anything was stripped ([[is-single-stmt-of-type?]]), so edge cases like
   keyword-shaped text inside string literals or comments are deliberately not guarded against."
  ^String [^String sql]
  (try
    (strip-large-literal-lists* sql)
    (catch Exception e
      (log/warnf "Error stripping large literal lists, passing SQL through unchanged: %s" (ex-message e))
      sql)))

;;; -------------------------------------------------- Public API --------------------------------------------------

(defn referenced-tables
  "Extract table references from SQL.

   Returns a vector of [catalog schema table] 3-tuples:
   [[nil nil \"users\"] [nil \"public\" \"orders\"] [\"myproject\" \"analytics\" \"events\"]]

   This is the pure parsing layer - it returns what's literally in the SQL.
   Default schema resolution happens in the matching layer (core.clj)."
  [dialect sql]
  (protocol/referenced-tables (parser) dialect (strip-large-literal-lists sql)))

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
  (protocol/referenced-fields (parser) dialect (strip-large-literal-lists sql)))

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
  (protocol/returned-columns-lineage (parser) dialect (strip-large-literal-lists sql) default-table-schema sqlglot-schema))

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
  (protocol/validate-query (parser) dialect (strip-large-literal-lists sql) default-table-schema sqlglot-schema))

(defn simple-query?
  "Check if SQL is a simple SELECT without LIMIT, OFFSET, or CTEs.

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
  (protocol/simple-query (parser) dialect (strip-large-literal-lists sql)))

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
  (protocol/add-into-clause (parser) dialect sql table-name))

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
    (let [raw (protocol/field-references (parser) dialect (strip-large-literal-lists sql))
          used-fields (or (:used-fields raw) (:used_fields raw) (get raw "used_fields") [])
          returned-fields (or (:returned-fields raw) (:returned_fields raw) (get raw "returned_fields") [])
          errors (or (:errors raw) (get raw "errors") [])]
      {:used-fields (set (map convert-field used-fields))
       :returned-fields (vec (map convert-field returned-fields))
       :errors (set (map convert-error errors))})
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
  (protocol/replace-names (parser) dialect sql replacements))

(defn is-single-stmt-of-type?
  "Validates that a query is a single read statement (SELECT) or a single write statement (INSERT, UPDATE, DELETE)
   and returns the query reconstructed from the parsed AST."
  [dialect sql stmt-type]
  (let [stripped-sql (strip-large-literal-lists sql)
        result (-> (protocol/single-stmt-of-type (parser) dialect stripped-sql stmt-type)
                   (perf/update-keys (comp keyword u/->kebab-case-en)))]
    ;; The `:sql` in the `result` is the reconstructed SQL from the SQLGlot parser.
    ;; We generally want to use the reconstructed SQL, but if the original SQL had its VALUES/IN
    ;; literal lists stripped (to avoid GraalPy OOM) then we need to return the original SQL to
    ;; preserve the values. (#74284)
    (cond-> result
      (not= sql stripped-sql) (assoc :sql sql))))

(comment
  (referenced-tables "postgres" "select * from transactions")

  (validate-query "postgres" "SELECT * FROM users" nil)

  (referenced-fields "postgres" "SELECT id, name FROM users WHERE active = true"))

;;;; Transpile sql

(defn- normalize-transpilation-result
  [result]
  (-> result
      (perf/update-keys (comp keyword u/->kebab-case-en))
      (m/update-existing :status (comp keyword u/->kebab-case-en))
      (m/update-existing :reason (comp keyword u/->kebab-case-en))))

(defn transpile-sql
  "Transpiles sql string from one dialect to another."
  [sql from-dialect to-dialect]
  (normalize-transpilation-result
   (protocol/transpile-sql (parser) sql from-dialect to-dialect)))
