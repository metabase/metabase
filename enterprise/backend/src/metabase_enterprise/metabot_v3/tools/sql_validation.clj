(ns metabase-enterprise.metabot-v3.tools.sql-validation
  (:require
   [metabase.driver.util :as driver.u]
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
   [:is-valid :boolean]
   [:error-message {:optional true} :string]
   [:dialect {:optional true} :string]
   [:transpiled-sql {:optional true} :string]])

(mu/defn validate-sql :- ::validation-result
  "Validate sql query."
  [dialect :- [:maybe :string]
   sql :- [:string]]
  (let [error nil]
    (merge
     {:is-valid true
      :transpiled-sql sql}
     (when (string? dialect)
       {:dialect dialect})
     (select-keys error [:error-message]))))