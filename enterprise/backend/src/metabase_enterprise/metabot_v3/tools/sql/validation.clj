(ns metabase-enterprise.metabot-v3.tools.sql.validation
  (:require
   [clojure.string :as str]
   [metabase.driver.util :as driver.u]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;; TODO: Should use only the driver for mapping
(def driver->dialect
  "Map of driver to parser dialect."
  {:postgres "postgres"
   :mysql "mysql"
   :mariadb "mysql"
   :bigquery-cloud-sdk "bigquery"
   :snowflake "snowflake"
   :redshift "redshift"})

(defn database-id->dialect
  "Get dialect for database id."
  [db-id]
  (when (integer? db-id)
    (-> db-id driver.u/database->driver driver->dialect)))

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
          (contains-template-tags? sql))
    {:valid? true
     :dialect dialect
     :transpiled-sql sql}
    (let [{:keys [error-message transpiled-sql status]}
          (sql-tools/transpile-sql sql dialect dialect)]
      (merge (when (some? dialect)
               {:dialect dialect})
             (cond (= :success status)
                   {:valid? true
                    :transpiled-sql transpiled-sql}

                   (= :skipped status)
                   {:valid? true
                    :transpiled-sql transpiled-sql}

                   (= :error status)
                   {:valid? false
                    :error-message error-message})))))
