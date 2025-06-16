(ns metabase-enterprise.ai-sql-generation.api
  "`/api/ee/ai-sql-generation/` routes"
  (:require
   [metabase-enterprise.metabot-v3.core :as metabot-v3]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; some arbitrary limits
(def ^:private max-database-tables
  "If the number of tables in the database doesn't exceed this number, we send them all to the agent."
  100)

(defn- database-tables
  ([database-id]
   (database-tables database-id nil))
  ([database-id {:keys [all-tables-limit] :or {all-tables-limit max-database-tables}}]
   (let [tables (t2/select [:model/Table :id :db_id :name :schema :description]
                           :db_id database-id
                           :active true
                           :visibility_type nil
                           {:where    (mi/visible-filter-clause :model/Table
                                                                :id
                                                                {:user-id       api/*current-user-id*
                                                                 :is-superuser? api/*is-superuser?*}
                                                                {:perms/view-data      :unrestricted
                                                                 :perms/create-queries :query-builder-and-native})
                            :order-by [[:view_count :desc]]
                            :limit    all-tables-limit})
         tables (t2/hydrate tables :fields)]
     (mapv (fn [{:keys [fields] :as table}]
             (merge (select-keys table [:name :schema :description])
                    {:columns (mapv (fn [{:keys [database_type] :as field}]
                                      (merge (select-keys field [:name :description])
                                             {:data_type database_type}))
                                    fields)}))
           tables))))

(api.macros/defendpoint :post "/generate"
  "Generate a SQL query."
  [_route-params
   _query-params
   {:keys [prompt database_id]} :- [:map
                                    [:prompt ms/NonBlankString]
                                    [:database_id ms/PositiveInt]]]
  (-> (metabot-v3/generate-sql {:dialect (driver.u/database->driver database_id)
                                :instructions prompt
                                :tables (database-tables database_id)})
      (select-keys [:generated_sql])))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-sql-generation` routes."
  (api.macros/ns-handler *ns* +auth))
