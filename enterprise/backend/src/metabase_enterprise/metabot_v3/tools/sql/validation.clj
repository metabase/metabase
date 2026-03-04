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

(mr/def ::validation-result
  [:map
   [:valid? :boolean]
   [:dialect {:optional true} :string]
   [:error-message {:optional true} :string]
   [:transpiled-sql {:optional true} :string]])

(mu/defn validate-sql :- ::validation-result
  "Validate sql query.

  Empty queries are considered valid. When dialect is empty, the query is considered valid.

  Else, query is transpiled into from and into the same dialect. If that action yields successfully, the query
  is considered valid.

  Transpilation logic skips the queries with template tags. Those are considered valid."
  [dialect :- [:maybe :string]
   sql :- :string]
  (if (or (nil? dialect)
          (str/blank? sql))
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
