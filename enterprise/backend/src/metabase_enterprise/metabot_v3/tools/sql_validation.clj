(ns metabase-enterprise.metabot-v3.tools.sql-validation
  (:require
   [metabase.driver.util :as driver.u]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;; TODO: Complete the dialect map
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

(mr/def ::validation-result
  [:map
   [:dialect :string]
   [:valid? :boolean]
   [:error-message {:optional true} :string]
   [:transpiled-sql {:optional true} :string]])

(mu/defn validate-sql :- ::validation-result
  "Validate sql query. Query is considered valid is transpilation is skipped due to missing dialect or query
  containing that contains template tags."
  [dialect :- [:maybe :string]
   sql :- :string]
  (let [{:keys [error-message transpiled-sql status]}
        (sql-tools/transpile-sql sql dialect dialect)]
    (merge {:dialect dialect}
           (cond (= :success status)
                 {:vaild? true
                  :transpiled-sql transpiled-sql}

                 (= :skipped status)
                 {:vaild? true
                  :transpiled-sql transpiled-sql}

                 (= :error status)
                 {:valid? false
                  :error-message error-message}))))
