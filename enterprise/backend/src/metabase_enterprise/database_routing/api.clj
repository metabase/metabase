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

(api.macros/defendpoint :post "/router"
  "Creates a new Router by marking an existing Database as a router."
  [_route-params
   _query-params
   {:keys [user_attribute database_id]} :- [:map
                                            [:user_attribute ms/NonBlankString]
                                            [:database_id ms/PositiveInt]]]
  (api/check-404 (t2/exists? :model/Database :id database_id))
  (api/check-400 (not (t2/exists? :model/DatabaseRouter :database_id database_id)))
  (t2/insert-returning-instance! :model/DatabaseRouter :user_attribute user_attribute :database_id database_id))

(api.macros/defendpoint :put "/router/:id"
  "Updates an existing Router to change the user attribute used."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [user_attribute]} :- [:map [:user_attribute ms/NonBlankString]]]
  (api/check-404 (t2/exists? :model/DatabaseRouter :id id))
  (t2/update! :model/DatabaseRouter :id id {:user_attribute user_attribute}))

(api.macros/defendpoint :delete "/router/:id"
  "Deletes a router AND ALL ASSOCIATED MIRROR DATABASES."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (t2/exists? :model/DatabaseRouter :id id))
  (let [primary-db-id (t2/select-one-fn :database_id
                                        [:model/DatabaseRouter :database_id]
                                        :id id)]
    (t2/with-transaction [_conn]
      (t2/delete! :model/DatabaseRouter :id id)
      (t2/delete! :model/Database :router_database_id primary-db-id))
    api/generic-204-no-content))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/database-routing` routes"
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
