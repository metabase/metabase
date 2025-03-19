(ns metabase-enterprise.database-routing.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events :as events]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/mirror-database"
  "Create new Mirror Databases.

  Note that unlike the normal `POST /api/database` endpoint, does NOT check the details before adding the Database.

  This is OK, it's not an invariant that all database details are always valid, but it's something to note."
  [_route-params
   _query-params
   {:keys [router_database_id mirrors]} :- [:map
                                            [:router_database_id ms/PositiveInt]
                                            [:mirrors
                                             [:sequential
                                              [:map
                                               [:name               ms/NonBlankString]
                                               [:details            ms/Map]]]]]]
  (api/check-400 (t2/exists? :model/DatabaseRouter :database_id router_database_id))
  (let [{:keys [engine auto_run_queries is_on_demand]} (t2/select-one :model/Database :id router_database_id)]
    (u/prog1 (t2/insert-returning-instances!
              :model/Database
              (map (fn [{:keys [name details]}]
                     {:name               name
                      :engine             engine
                      :details            details
                      :auto_run_queries   auto_run_queries
                      :is_full_sync       false
                      :is_on_demand       is_on_demand
                      :cache_ttl          nil
                      :router_database_id router_database_id
                      :creator_id         api/*current-user-id*})
                   mirrors))
      (doseq [database <>]
        (events/publish-event! :event/database-create {:object database :user-id api/*current-user-id*})))))

(api.macros/defendpoint :put "/router-database/:id"
  "Updates an existing Database with the `user_attribute` to route on. Will either:
  - turn an existing Database into a Router database
  - change the `user_attribute` used to route for an existing Router database, or
  - turn a Router database into a regular Database
  depending on the value of `user_attribute`"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [user_attribute]} :- [:map [:user_attribute {:optional true} [:maybe ms/NonBlankString]]]]
  (api/check-404 (t2/exists? :model/Database :id id))
  (if (nil? user_attribute)
    ;; delete the DatabaseRouter and all mirror databases.
    (t2/with-transaction [_conn]
      (t2/delete! :model/DatabaseRouter :database_id id)
      (t2/delete! :model/Database :router_database_id id))
    (if (t2/select-one :model/DatabaseRouter :database_id id)
      (t2/update! :model/DatabaseRouter :database_id id {:user_attribute user_attribute})
      (t2/insert! :model/DatabaseRouter {:database_id id :user_attribute user_attribute}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/database-routing` routes"
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
