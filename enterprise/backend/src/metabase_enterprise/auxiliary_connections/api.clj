(ns metabase-enterprise.auxiliary-connections.api
  "API endpoints for managing auxiliary database connections (PRO-86).

  Auxiliary connections are hidden Database records attached to a parent database,
  providing different privilege levels for different operations. Each connection has
  a type that describes its privilege level:

  - `read-write-data`: Can read and write data (used by Transforms)"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses-rest.api :as api.database]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

;; TODO(Timothy, 2026-01-28): This typing is not fully fleshed out, but should be easy to extend
;; We only have one type right now!
(def ^:private valid-types
  #{"read-write-data"})

(defn- check-valid-type [connection-type]
  (api/check-400 (contains? valid-types connection-type)
                 (str "Invalid connection type: " connection-type
                      ". Valid types: " (pr-str valid-types))))

(defn- get-auxiliary-database
  [db-id]
  (when-let [aux-db-id (t2/select-one-fn :write_database_id :model/Database :id db-id)]
    (t2/select-one :model/Database :id aux-db-id)))

(api.macros/defendpoint :get "/:id/:type" :- [:or
                                              [:map [:configured [:= false]]]
                                              [:map
                                               [:configured [:= true]]
                                               [:database_id ms/PositiveInt]
                                               [:name ms/NonBlankString]
                                               [:details ms/Map]]]
  "Get the auxiliary connection configuration for a database."
  [{:keys [id type]} :- [:map
                         [:id ms/PositiveInt]
                         [:type ms/NonBlankString]]]
  (api/check-superuser)
  (check-valid-type type)
  (let [db (api/check-404 (t2/select-one :model/Database :id id))]
    (api/check-400 (not (:router_database_id db))
                   "Cannot get auxiliary connection for a destination database")
    (if-let [aux-db (get-auxiliary-database id)]
      {:configured  true
       :database_id (:id aux-db)
       :name        (:name aux-db)
       :details     (dissoc (:details aux-db) :password :tunnel-pass :ssl-key-value)}
      {:configured false})))

(api.macros/defendpoint :post "/:id/:type" :- [:map
                                               [:database_id ms/PositiveInt]
                                               [:status [:enum :created :updated]]]
  "Create or update an auxiliary connection for a database.

  The auxiliary database is stored as a hidden Database record with the same engine
  as the parent database. It will not be synced (no tables/fields) since it's
  only used for connection credentials."
  [{:keys [id type]} :- [:map
                         [:id ms/PositiveInt]
                         [:type ms/NonBlankString]]
   {:keys [check-connection-details]} :- [:map
                                          [:check-connection-details {:optional true} ms/MaybeBooleanValue]]
   {:keys [name details]} :- [:map
                              [:name ms/NonBlankString]
                              [:details ms/Map]]]
  (api/check-superuser)
  (check-valid-type type)
  (let [db (api/check-404 (t2/select-one :model/Database :id id))]
    (api/check-400 (not (:router_database_id db))
                   "Cannot configure auxiliary connection for a destination database")
    (api/check-400 (not (t2/exists? :model/Database :router_database_id id))
                   "Cannot configure auxiliary connection for a router database")
    (api/check-400 (not (database/is-write-database? db))
                   "Cannot configure auxiliary connection for a write database")
    ;; Connection validation is opt-in, matching the DB Routing pattern
    ;; (see database_routing/api.clj POST /destination-database).
    ;; It's not an invariant that all database details are always valid.
    (when check-connection-details
      (let [details-or-error (api.database/test-connection-details (clojure.core/name (:engine db)) details)]
        (when (= (:valid details-or-error) false)
          (throw (ex-info "Auxiliary connection details are invalid"
                          {:status-code 400
                           :errors      details-or-error})))))
    (let [existing-aux-db-id (:write_database_id db)
          aux-db-data        {:name             name
                              :engine           (:engine db)
                              :details          details
                              :auto_run_queries false
                              :is_full_sync     false
                              :is_on_demand     false
                              :cache_ttl        nil
                              :creator_id       api/*current-user-id*}]
      (if existing-aux-db-id
        (let [previous-object (t2/select-one :model/Database existing-aux-db-id)]
          (t2/update! :model/Database existing-aux-db-id aux-db-data)
          (events/publish-event! :event/database-update
                                 {:object          (t2/select-one :model/Database existing-aux-db-id)
                                  :previous-object previous-object
                                  :user-id         api/*current-user-id*})
          {:database_id existing-aux-db-id
           :status      :updated})
        (t2/with-transaction [_conn]
          (let [aux-db (first (t2/insert-returning-instances! :model/Database aux-db-data))]
            (database/link-write-database! id (:id aux-db))
            (events/publish-event! :event/database-create
                                   {:object  aux-db
                                    :user-id api/*current-user-id*})
            {:database_id (:id aux-db)
             :status      :created}))))))

(api.macros/defendpoint :delete "/:id/:type" :- [:map [:status [:= :deleted]]]
  "Remove the auxiliary connection for a database.

  This deletes the hidden auxiliary database record and removes the link."
  [{:keys [id type]} :- [:map
                         [:id ms/PositiveInt]
                         [:type ms/NonBlankString]]]
  (api/check-superuser)
  (check-valid-type type)
  (let [db (api/check-404 (t2/select-one :model/Database :id id))
        aux-db-id (:write_database_id db)]
    (api/check-400 aux-db-id "No auxiliary connection of this type configured for this database")
    (database/unlink-write-database! id aux-db-id)
    (t2/delete! :model/Database :id aux-db-id)
    {:status :deleted}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/auxiliary-connections` routes"
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
