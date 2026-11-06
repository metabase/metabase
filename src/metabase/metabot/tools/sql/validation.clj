(ns metabase.metabot.tools.sql.validation
  (:require
   [clojure.string :as str]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.i18n :as i18n]
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
   ;; sqlglot has no H2 dialect, and its nearest stand-in, postgres mode, folds the other
   ;; way (H2 folds unquoted identifiers to uppercase, postgres to lowercase), so anything
   ;; the transpiler folds or quotes comes out wrong for H2; skip validation. Vertica is
   ;; not supported by sqlglot.
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

(defn- template-syntax-error
  "The parser message for `{{...}}` or `[[...]]` syntax in `sql` that Metabase rejects, or `nil`.

  Metabase cannot make a query when the lax parse of [[lib/recognize-template-tags]] throws. It does the strict parse
  of SQL drivers before a run only when the query has template tags; it sends other SQL, for example
  `ARRAY[[1,2],[3,4]]`, to the database as it is. This check uses the same two rules. The strict parse marks its
  syntax errors with `:type :invalid-query`. Other exceptions are not about the SQL, so they propagate."
  [sql]
  (when (and (contains-template-tags? sql)
             (try
               (seq (lib/recognize-template-tags sql))
               (catch clojure.lang.ExceptionInfo _
                 true)))
    (try
      ;; Model-facing: the parser builds its messages with `tru`, so get them in English, never in the user's locale.
      (binding [i18n/*user-locale* "en"]
        (lib/parse-parameters sql))
      nil
      (catch clojure.lang.ExceptionInfo e
        (if (= :invalid-query (:type (ex-data e)))
          (ex-message e)
          (throw e))))))

(mr/def ::validation-result
  [:map
   [:valid? :boolean]
   [:dialect {:optional true} [:maybe :string]]
   [:error-message {:optional true} :string]
   [:reason {:optional true} :keyword]
   [:transpiled-sql {:optional true} :string]])

(mu/defn validate-sql :- ::validation-result
  "Validate sql query.

  For every dialect, sql with `{{...}}` or `[[...]]` syntax that Metabase rejects is not valid, with `:reason`
  `:invalid-template-syntax` and the parser message in `:error-message`. Metabase cannot run such sql.

  Otherwise validation is short-circuited and query is considered valid for following cases:
  - sql string is empty,
  - dialect is `nil` or maps to `nil` (e.g. h2, vertica),
  - dialect is not in [[dialect-mapping]],
  - sql contains Metabase template tags.

  When that is not the case, the query is transpiled from and into the same dialect. If that action
  yields successfully, the query is considered valid. Otherwise `:reason` says why, when the parser
  knows (`:multiple-statements`).

  Returns the mapped dialect name in `:dialect` (not the raw driver name) for consistency
  with the Python ai-service."
  [dialect :- [:maybe :string]
   sql :- :string]
  (let [mapped-dialect (get dialect-mapping dialect)
        template-error (template-syntax-error sql)]
    (cond
      template-error
      {:valid? false
       :dialect dialect
       :reason :invalid-template-syntax
       :error-message template-error}

      (or (nil? dialect)
          (str/blank? sql)
          (not (contains? dialect-mapping dialect))
          (nil? mapped-dialect)
          (contains-template-tags? sql))
      {:valid? true
       :dialect dialect
       :transpiled-sql sql}

      :else
      (let [{:keys [error-message reason transpiled-sql status]}
            (sql-tools/transpile-sql sql mapped-dialect mapped-dialect)]
        (merge
         {:dialect dialect}
         (case status
           :success {:valid? true
                     :transpiled-sql transpiled-sql}
           :skipped {:valid? true
                     :transpiled-sql transpiled-sql}
           :error   (cond-> {:valid? false
                             :error-message error-message}
                      reason (assoc :reason reason))))))))
