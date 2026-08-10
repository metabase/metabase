(ns metabase.metabot.tools.sql.validation
  (:require
   [clojure.string :as str]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def dialect-mapping
  "Maps query dialect (Metabase driver name) to parser dialect. Matches ai-service
  `SQLGLOT_DIALECT_MAP`. Values of `nil` mean the dialect is recognized but validation is skipped.
  Dialects absent from this map are also skipped."
  {;; PostgreSQL family
   "postgres" "postgres",
   "postgresql" "postgres",
   ;; MySQL family
   "mysql" "mysql",
   "mariadb" "mysql",
   ;; Cloud warehouses
   "bigquery-cloud-sdk" "bigquery",
   "bigquery" "bigquery",
   "snowflake" "snowflake",
   "redshift" "redshift",
   ;; Presto/Trino family (Athena uses Trino/Presto syntax)
   "athena" "trino",
   "presto" "presto",
   "presto-jdbc" "presto",
   "trino" "trino",
   "starburst" "trino",
   ;; Analytics engines
   "clickhouse" "clickhouse",
   ;; Spark family
   "databricks" "databricks",
   "sparksql" "spark",
   "spark" "spark",
   ;; Enterprise databases
   "oracle" "oracle",
   "sqlserver" "tsql",
   ;; Embedded/lightweight
   "sqlite" "sqlite",
   ;; H2 uses PostgreSQL compatibility mode in sqlglot but this causes incorrect identifier
   ;; quoting (H2 folds to UPPERCASE internally, postgres quoting forces lowercase), so we
   ;; skip validation. Vertica is not supported by sqlglot.
   "h2" nil
   "vertica" nil})

(def ^:private case-sensitive-dialects
  "Mapped dialects the Python transpilation layer quotes with sqlglot's `identify=True` (its
  `CASE_SENSITIVE_DIALECTS`): they fold unquoted identifiers to a specific case, so quoting locks
  in whatever casing the SQL wrote. Casing correction only matters, and only runs, for these."
  #{"snowflake" "oracle" "redshift" "postgres"})

(defn database-id->dialect
  "Get dialect for database id."
  [db-id]
  (some-> db-id driver.u/database->driver name))

(defn query->dialect
  "Get queries dialect."
  [query]
  (database-id->dialect (:database query)))

(defn- contains-template-tags?
  "Predicate that checks whether sql string contains"
  [sql]
  (boolean (and (string? sql)
                (re-find #"\{\{|\[\[" sql))))

(mr/def ::validation-result
  [:map
   [:valid? :boolean]
   [:dialect {:optional true} [:maybe :string]]
   [:error-message {:optional true} :string]
   [:transpiled-sql {:optional true} :string]])

(defn- referenced-synced-tables
  "The synced tables the query's table references name, matched case-insensitively (and by schema
  when qualified). Catalog-qualified references and names matching several tables are dropped.
  Only the referenced names are resolved and fetched, never the database's whole catalog
  (GHY-4251)."
  [mp mapped-dialect sql]
  (let [refs           (into []
                             (comp (remove (fn [[catalog _ _]] catalog))
                                   (distinct))
                             (sql-parsing/referenced-tables mapped-dialect sql))
        table-ids      (sql-tools/table-ids-by-name (:id (lib.metadata/database mp))
                                                    (mapv (fn [[_ _ table]] table) refs))
        tables-by-name (group-by (comp u/lower-case-en :name)
                                 (lib.metadata/bulk-metadata mp :metadata/table table-ids))]
    (into []
          (comp (keep (fn [[_ schema table]]
                        (let [matches (cond->> (tables-by-name (u/lower-case-en table))
                                        schema (filter #(= (u/lower-case-en schema)
                                                           (some-> (:schema %) u/lower-case-en))))]
                          (when (= 1 (count matches))
                            (first matches)))))
                (distinct))
          refs)))

(defn- correct-identifier-casing
  "Rewrite unquoted identifiers that differ from their synced name only by letter case, so the
  quoting the transpile step adds locks in the right casing (Snowflake folds unquoted to
  uppercase, so an LLM-written `subtotal` must become `SUBTOTAL` before it gets quoted).

  The rewrite itself is scope-aware and conservative, done in Python where the AST lives - see
  `correct_identifier_casing` in `sql_tools.py` for exactly what is left alone. On this side:
  no-op unless `mp` is present and the dialect is one where quoting is case-sensitive, and any
  error falls back to the original `sql`."
  [mp mapped-dialect sql]
  (if-not (and mp (case-sensitive-dialects mapped-dialect))
    sql
    (try
      (let [tables (for [table (referenced-synced-tables mp mapped-dialect sql)]
                     {:schema (:schema table)
                      :name (:name table)
                      :columns (map :name (lib.metadata/active-fields mp (:id table)))})]
        (if (seq tables)
          (sql-parsing/correct-identifier-casing mapped-dialect sql tables)
          sql))
      ;; the exception (and its message) can embed the raw SQL, which must stay out of logs
      (catch Exception e
        (log/warn "Skipping identifier casing correction for metabot SQL fix"
                  {:error-type (.getName (class e))})
        sql))))

(mu/defn validate-sql :- ::validation-result
  "Validate sql query.

  Validation is short-circuited and query is considered valid for following cases:
  - sql string is empty,
  - dialect is `nil` or maps to `nil` (e.g. h2, vertica),
  - dialect is not in [[dialect-mapping]],
  - sql contains Metabase template tags.

  Otherwise the query is transpiled from and into the same dialect; success means valid. When a
  metadata provider `mp` was passed and the dialect quotes case-sensitively, identifier casing is
  corrected against synced metadata first ([[correct-identifier-casing]]).

  `:dialect` in the result echoes the raw driver name this was called with."
  ([dialect :- [:maybe :string]
    sql :- :string]
   (validate-sql dialect sql nil))
  ([dialect :- [:maybe :string]
    sql :- :string
    mp :- [:maybe ::lib.schema.metadata/metadata-provider]]
   (let [mapped-dialect (get dialect-mapping dialect)]
     (if (or (nil? dialect)
             (str/blank? sql)
             (not (contains? dialect-mapping dialect))
             (nil? mapped-dialect)
             (contains-template-tags? sql))
       {:valid? true
        :dialect dialect
        :transpiled-sql sql}
       (let [corrected-sql (correct-identifier-casing mp mapped-dialect sql)
             {:keys [error-message transpiled-sql status]}
             (sql-tools/transpile-sql corrected-sql mapped-dialect mapped-dialect)]
         (merge
          {:dialect dialect}
          (case status
            :success {:valid? true
                      :transpiled-sql transpiled-sql}
            :skipped {:valid? true
                      :transpiled-sql transpiled-sql}
            :error   {:valid? false
                      :error-message error-message})))))))
