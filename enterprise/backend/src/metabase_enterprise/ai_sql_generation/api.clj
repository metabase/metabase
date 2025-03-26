(ns metabase-enterprise.ai-sql-generation.api
  "`/api/ee/ai-sql-generation/` routes"
  (:require
   [metabase-enterprise.metabot-v3.core :as metabot-v3]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; some arbitrary limits
(def ^:private max-database-tables
  "If the number of tables in the database doesn't exceed this number, we send them all to the agent."
  100)

(defn- database-tables
  ([database]
   (database-tables database nil))
  ([database {:keys [all-tables-limit] :or {all-tables-limit max-database-tables}}]
   (let [tables (t2/select [:model/Table :id :name :schema]
                           :db_id database
                           :active true
                           :visibility_type nil
                           {:limit all-tables-limit})
         tables (t2/hydrate tables :fields)]
     (mapv (fn [{:keys [name fields]}]
             {:name name
              :columns (mapv (fn [{:keys [name database_type]}]
                               {:name name
                                :data_type database_type})
                             fields)})
           tables))))

(api.macros/defendpoint :post "/generate"
  "Generate a SQL query."
  [_route-params
   _query-params
   {:keys [database prompt]} :- [:map
                                 [:database ms/PositiveInt]
                                 [:prompt :string]]]
  (-> (metabot-v3/generate-sql {:dialect (driver.u/database->driver database)
                                :instructions prompt
                                :tables (database-tables database)})
      (select-keys [:generated_sql])))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-sql-generation` routes."
  (api.macros/ns-handler *ns* +auth))
