(ns metabase-enterprise.metabot-v3.tools.sql.validation
  (:require
   [clojure.string :as str]
   [metabase.driver.util :as driver.u]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def dialect-mapping
  "Maps query dialect into parser dialect representation. Matches ai-service py implmentation."
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
   ;; H2 and Vertica are not fully supported by parser hence skipping the validation
   "h2" nil
   "vertica" nil})

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
  - dialect is `nil`,
  - sql contains Metabase template tags.

  When that is not the case, the query is transpiled into from and into the same dialect. If that action yields
  successfully, the query is considered valid."
  [dialect :- [:maybe :string]
   sql :- :string]
  (if (or (nil? dialect)
          (str/blank? sql)
          (not (contains? dialect-mapping dialect))
          (contains-template-tags? sql))
    {:valid? true
     :dialect dialect
     :transpiled-sql sql}
    (let [dialect* (dialect-mapping dialect)
          {:keys [error-message transpiled-sql status]}
          (sql-tools/transpile-sql sql dialect* dialect*)]
      (merge
       ;; Return contains original input dialect, not the mapping.
       {:dialect dialect}
       (cond (= :success status)
             {:valid? true
              :transpiled-sql transpiled-sql}

             (= :skipped status)
             {:valid? true
              :transpiled-sql transpiled-sql}

             (= :error status)
             {:valid? false
              :error-message error-message})))))
