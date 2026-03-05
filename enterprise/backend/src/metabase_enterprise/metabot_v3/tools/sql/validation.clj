(ns metabase-enterprise.metabot-v3.tools.sql.validation
  (:require
   [clojure.string :as str]
   [metabase.driver.util :as driver.u]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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

;; Dialects where the Python transpilation layer (`sql_tools.py`) passes `identify=True` to
;; sqlglot, quoting all identifiers. These dialects fold unquoted identifiers to a specific case
;; and need quoting to preserve the LLM's intended casing. This set is defined in Python's
;; `CASE_SENSITIVE_DIALECTS`; it is documented here so that any future pure-JVM replacement
;; knows to replicate the behavior.
;;
;;   "snowflake"  — folds unquoted to UPPERCASE
;;   "oracle"     — folds unquoted to UPPERCASE
;;   "redshift"   — PostgreSQL-based, folds to lowercase
;;   "postgres"   — folds unquoted to lowercase

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

(mu/defn validate-sql :- ::validation-result
  "Validate sql query.

  Validation is short-circuited and query is considered valid for following cases:
  - sql string is empty,
  - dialect is `nil` or maps to `nil` (e.g. h2, vertica),
  - dialect is not in [[dialect-mapping]],
  - sql contains Metabase template tags.

  When that is not the case, the query is transpiled from and into the same dialect. If that action
  yields successfully, the query is considered valid.

  Returns the mapped dialect name in `:dialect` (not the raw driver name) for consistency
  with the Python ai-service."
  [dialect :- [:maybe :string]
   sql :- :string]
  (let [mapped-dialect (get dialect-mapping dialect)]
    (if (or (nil? dialect)
            (str/blank? sql)
            (not (contains? dialect-mapping dialect))
            (nil? mapped-dialect)
            (contains-template-tags? sql))
      {:valid? true
       :dialect dialect
       :transpiled-sql sql}
      (let [{:keys [error-message transpiled-sql status]}
            (sql-tools/transpile-sql sql mapped-dialect mapped-dialect)]
        (merge
         {:dialect dialect}
         (case status
           :success {:valid? true
                     :transpiled-sql transpiled-sql}
           :skipped {:valid? true
                     :transpiled-sql transpiled-sql}
           :error   {:valid? false
                     :error-message error-message}))))))
