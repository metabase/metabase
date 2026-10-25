(ns metabase-enterprise.database-routing.models
  (:require
   [metabase-enterprise.database-routing.common :refer [router-db-or-id->destination-db-id]]
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.warehouse-schema.models.field :as field]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DatabaseRouter [_model] :db_router)

(doto :model/DatabaseRouter
  (derive :metabase/model))

(defn- check!
  [ok? message]
  (when-not ok?
    (throw (ex-info message {:status-code 400}))))

(defn- check-router!
  "Throws unless the Database of `router` can route."
  [{:keys [database_id]}]
  (let [db (database-routing.db/database database_id)]
    (check! (driver.u/supports? (:engine db) :database-routing db)
            (tru "This database does not support DB routing"))
    (check! (not (:router_database_id db))
            (tru "Cannot make a destination database a router database"))
    (check! (not (:uploads_enabled db))
            (tru "Cannot enable database routing for a database with uploads enabled"))
    (check! (not (:write_data_details db))
            (tru "Cannot enable database routing for a database with a write connection configured"))
    (check! (not (database-routing.db/transform-exists-for-source-database? database_id))
            (tru "Cannot enable database routing for a database with transforms"))
    (setting/with-database db
      (check! (not (setting/get :database-enable-table-editing))
              (tru "Cannot enable database routing for a database with table editing enabled"))
      (check! (not (setting/get :database-enable-actions))
              (tru "Cannot enable database routing for a database with actions enabled"))
      (check! (not (setting/get :persist-models-enabled))
              (tru "Cannot enable database routing for a database with model persistence enabled")))))

(t2/define-before-insert :model/DatabaseRouter
  [router]
  (u/prog1 (merge {:mode "external"} router)
    (check-router! <>)))

(t2/define-before-update :model/DatabaseRouter
  [router]
  (check-router! router)
  (when (contains? (t2/changes router) :mode)
    (database-routing.db/delete-destination-databases! (:database_id router)))
  router)

(defenterprise hydrate-router-user-attribute
  "Enterprise implementation. Hydrates the router user attribute on the databases"
  :feature :database-routing
  [k databases]
  (mi/instances-with-hydrated-data
   databases k
   (fn [] (database-routing.db/router-user-attributes-by-database (map :id databases)))
   :id
   {:default nil}))

(defenterprise hydrate-router-mode
  "Enterprise implementation. Hydrates the database routing mode on the databases."
  :feature :database-routing
  [k databases]
  (mi/instances-with-hydrated-data
   databases k
   (fn [] (database-routing.db/router-modes-by-database (map :id databases)))
   :id
   {:default nil}))

(defenterprise router-mode
  "Enterprise implementation. Returns the mode of the router of the Database with `database-id`, or nil when it isn't
  a router. Uses `:feature :none` so a router keeps its restrictions while the `:database-routing` feature is
  unavailable."
  :feature :none
  [database-id]
  (database-routing.db/router-mode database-id))

(defenterprise hash-input-for-database-routing
  "Enterprise version. Returns a hash input that will be used for fields subject to database routing.
  The destination is nil while the `:database-routing` feature is unavailable."
  :feature :none
  [field]
  (when-let [destination-db-id (some->> field u/the-id field/field-id->database-id router-db-or-id->destination-db-id)]
    {:destination-db-id (when (premium-features/has-feature? :database-routing) destination-db-id)}))

(defenterprise delete-associated-database-router!
  "Deletes the Database Router associated with this router database."
  :feature :database-routing
  [db-id]
  (database-routing.db/delete-router! db-id))

(defenterprise db-routing-enabled?
  "Returns whether or not the given database is either a router or destination database."
  :feature :database-routing
  :fallback :oss
  [db-or-id]
  (or (database-routing.db/router-exists? (u/the-id db-or-id))
      (some->> (:router-database-id db-or-id)
               database-routing.db/router-exists?)))
