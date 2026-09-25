(ns metabase.metabot.tools.sql.validation
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
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
   [:transpiled-sql {:optional true} :string]
   [:warnings {:optional true} [:sequential :string]]])

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

;;;; Reference checks for SQL with template tags
;;;
;;; [[validate-sql]] can't parse SQL containing `{{...}}`, so a query referencing a card or snippet used to be accepted
;;; unchecked -- including references to the wrong card or to tables that don't exist. Here we compile the query (which
;;; expands card and snippet references into their SQL) and check the table and column references against metadata.
;;;
;;; Column/table problems are returned as warnings rather than errors: the checker reports false positives on a
;;; noticeable share of working queries, so a hard failure would leave the agent stuck on valid SQL.

(defn- error->warning
  [{error-type :type error-name :name message :message}]
  (case (keyword error-type)
    :missing-column             (tru "Column `{0}` was not found in any table, model, or question this query reads from." error-name)
    :missing-table-alias        (tru "Table alias `{0}` is used but not defined in this query." error-name)
    :missing-table              (tru "This query references a table that does not exist.")
    :missing-card               (tru "This query references a model or question that does not exist.")
    :duplicate-column           (tru "Column `{0}` is returned more than once." error-name)
    :syntax-error               (tru "The SQL could not be parsed after its model, question, and snippet references were expanded.")
    :validation-exception-error (tru "Validation failed: {0}" message)
    (tru "Validation problem: {0}" (pr-str error-type))))

(defn- invalid-query-cause
  "The exception in `e`'s cause chain that marks the query itself as invalid (e.g. it references a card that doesn't
  exist or lives in another database), if any."
  [e]
  (some #(when (= :invalid-query (:type (ex-data %))) %)
        (take-while some? (iterate ex-cause e))))

(defn- compile-templated-sql
  "Compile `sql` against `database-id`, expanding its template tags. Returns the compiled SQL, or nil when the query
  can't be compiled without user input (e.g. a required variable has no value). Throws an agent error when the query
  references something that doesn't exist."
  [database-id sql]
  (try
    (:query (qp.compile/compile (lib/native-query (lib-be/application-database-metadata-provider database-id) sql)))
    (catch Exception e
      (when-let [cause (invalid-query-cause e)]
        (throw (ex-info (ex-message cause) {:agent-error? true} e)))
      ;; Log the message only: ex-data from the QP can hold values that fail to print.
      (log/debugf "Skipping reference check for SQL that can't be compiled: %s" (ex-message e))
      nil)))

(mu/defn templated-sql-warnings :- [:sequential :string]
  "Check the table and column references of `sql`, a query with template tags, against `database-id`'s metadata.
  Returns human-readable warnings, empty when nothing was found or the check couldn't run."
  [database-id :- :int
   sql         :- :string]
  (if-let [compiled (compile-templated-sql database-id sql)]
    (try
      (let [driver (driver.u/database->driver database-id)
            mp     (lib-be/application-database-metadata-provider database-id)]
        (->> (driver/validate-native-query-fields driver (lib/native-query mp compiled))
             (map error->warning)
             distinct
             sort
             vec))
      (catch Exception e
        (log/warnf "Reference check failed for database %d: %s" database-id (ex-message e))
        []))
    []))

(mu/defn validate-database-sql :- ::validation-result
  "[[validate-sql]] for `sql` against `database-id`, plus reference `:warnings` when `sql` has template tags (which
  [[validate-sql]] can't parse). Throws an agent error when `sql` references a model or question that doesn't exist."
  [database-id :- :int
   sql         :- :string]
  (let [dialect (database-id->dialect database-id)
        result  (validate-sql dialect sql)]
    (if (and (:valid? result)
             (get dialect-mapping dialect)
             (contains-template-tags? sql))
      (let [warnings (templated-sql-warnings database-id sql)]
        (cond-> result
          (seq warnings) (assoc :warnings warnings)))
      result)))
