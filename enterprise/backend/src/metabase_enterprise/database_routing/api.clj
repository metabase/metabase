(ns metabase-enterprise.database-routing.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.database :as api.database]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events :as events]
   [metabase.models.setting :as setting]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api.macros/defendpoint :post "/mirror-database"
  "Create new Mirror Databases.

  Note that unlike the normal `POST /api/database` endpoint, does NOT check the details before adding the Database.

  This is OK, it's not an invariant that all database details are always valid, but it's something to note."
  [_route-params
   {:keys [check_connection_details]} :- [:map
                                          [:check_connection_details {:optional true} ms/MaybeBooleanValue]]
   {:keys [router_database_id mirrors]} :- [:map
                                            [:router_database_id ms/PositiveInt]
                                            [:mirrors
                                             [:sequential
                                              [:map
                                               [:name               ms/NonBlankString]
                                               [:details            ms/Map]]]]]]
  (api/check-400 (t2/exists? :model/DatabaseRouter :database_id router_database_id))
  (api/check-400 (not (t2/exists? :model/Database :router_database_id router_database_id :name [:in (map :name mirrors)]))
                 "A destination database with that name already exists.")
  (let [{:keys [engine auto_run_queries is_on_demand] :as router-db} (t2/select-one :model/Database :id router_database_id)]
    (if-let [invalid-mirrors (and check_connection_details
                                  (->> mirrors
                                       (keep (fn [{details :details n :name}]
                                               (let [details-or-error (api.database/test-connection-details (name engine) details)
                                                     valid? (not= (:valid details-or-error) false)]
                                                 (when-not valid?
                                                   [n (dissoc details-or-error :valid)]))))
                                       seq))]
      {:status 400
       :body (into {} invalid-mirrors)}
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
          (events/publish-event! :event/database-create {:object database
                                                         :user-id api/*current-user-id*
                                                         :details {:slug name
                                                                   :primary_db_name (:name router-db)
                                                                   :primary_db_id (:id router-db)}}))))))

(defn- delete-router!
  [db-id]
  (let [db (t2/select-one :model/Database db-id)]
    (events/publish-event! :event/database-update {:object db
                                                   :previous-object db
                                                   :user-id api/*current-user-id*
                                                   :details {:db_routing :disabled}})
    (t2/delete! :model/DatabaseRouter :database_id db-id)))

(defn- create-or-update-router!
  [db-id user-attribute]
  (let [db (t2/select-one :model/Database db-id)]
    (events/publish-event! :event/database-update {:object db
                                                   :previous-object db
                                                   :user-id api/*current-user-id*
                                                   :details {:db_routing :enabled
                                                             :routing_attribute user-attribute}})
    (if (t2/select-one :model/DatabaseRouter :database_id db-id)
      (t2/update! :model/DatabaseRouter :database_id db-id {:user_attribute user-attribute})
      (t2/insert! :model/DatabaseRouter {:database_id db-id :user_attribute user-attribute}))))

(api.macros/defendpoint :put "/router-database/:id"
  "Updates an existing Database with the `user_attribute` to route on. Will either:
  - turn an existing Database into a Router database
  - change the `user_attribute` used to route for an existing Router database, or
  - turn a Router database into a regular Database
  depending on the value of `user_attribute`"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [user_attribute]} :- [:map [:user_attribute {:optional true} [:maybe ms/NonBlankString]]]]
  (let [db (t2/select-one :model/Database :id id)]
    (api/check-404 db)
    (api/check-400 (not (:router_database_id db)) "Cannot make a destination database a router database")
    (api/check-400 (not (:uploads_enabled db)) "Cannot enable database routing for a database with uploads enabled")
    (binding [setting/*database-local-values* (:settings db)]
      (api/check-400 (not (setting/get :persist-models-enabled)) "Cannot enable database routing for a database with model persistence enabled")
      (api/check-400 (not (setting/get :database-enable-actions)) "Cannot enable database routing for a database with actions enabled")))
  (if (nil? user_attribute)
    ;; delete the DatabaseRouter
    (delete-router! id)
    (create-or-update-router! id user_attribute)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/database-routing` routes"
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
