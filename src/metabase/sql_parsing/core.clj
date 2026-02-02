(ns metabase.sql-parsing.core
  "Stateless SQL parsing via sqlglot (Python) and GraalVM Polyglot.

  This module provides dialect-aware SQL parsing with no Metabase dependencies.
  All functions take strings and return strings/simple data structures.

  API:
    (referenced-tables sql dialect) → [[schema table] ...]
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

   Returns a vector of [schema-or-nil table-name] pairs:
   [[nil \"users\"] [\"public\" \"orders\"]]

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

   Returns a vector of [table-name field-name] pairs:
   [[\"users\" \"id\"] [\"users\" \"email\"] [\"orders\" \"total\"]]

   Includes:
   - Wildcards as [\"table-name\" \"*\"] (both qualified like users.* and unqualified SELECT *)
   - All specific column references

   Excludes:
   - Fields from CTEs or subqueries
   - Table aliases (returns actual table names)

   Examples:
   (referenced-fields \"postgres\" \"SELECT t.id, u.* FROM transactions t LEFT JOIN users u ON t.user_id = u.id\")
   => [[\"transactions\" \"id\"] [\"transactions\" \"user_id\"] [\"users\" \"*\"] [\"users\" \"id\"]]

   (referenced-fields \"postgres\" \"SELECT * FROM users\")
   => [[\"users\" \"*\"]]

   (referenced-fields \"postgres\" \"SELECT * FROM users u LEFT JOIN transactions t ON u.id = t.user_id\")
   => [[\"transactions\" \"*\"] [\"transactions\" \"user_id\"] [\"users\" \"*\"] [\"users\" \"id\"]]"
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

(comment
  (referenced-tables "postgres" "select * from transactions")

  (validate-sql-query "postgres" "SELECT * FROM users")

  (validate-sql-query "postgres" "SELECT * FORM users")

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
