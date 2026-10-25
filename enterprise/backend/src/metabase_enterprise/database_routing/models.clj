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

(defn- check-router
  "Throws unless the Database of `router` can route."
  [{:keys [database_id]}]
  (let [db (database-routing.db/database database_id)]
    (when-not (driver.u/supports? (:engine db) :database-routing db)
      (throw (ex-info (tru "This database does not support DB routing") {:status-code 400})))
    (when (:router_database_id db)
      (throw (ex-info (tru "Cannot make a destination database a router database") {:status-code 400})))
    (when (:admin_details db)
      (throw (ex-info (tru "Cannot enable database routing for a database with an admin connection configured") {:status-code 400})))
    (setting/with-database db
      (when (setting/get :persist-models-enabled)
        (throw (ex-info (tru "Cannot enable database routing for a database with model persistence enabled") {:status-code 400}))))))

(t2/define-before-insert :model/DatabaseRouter
  [router]
  (u/prog1 router
    (check-router <>)))

(t2/define-before-update :model/DatabaseRouter
  [router]
  (u/prog1 router
    (check-router <>)))

(defenterprise hydrate-router-user-attribute
  "Enterprise implementation. Hydrates the router user attribute on the databases"
  :feature :database-routing
  [k databases]
  (mi/instances-with-hydrated-data
   databases k
   (fn [] (database-routing.db/router-user-attributes-by-database (map :id databases)))
   :id
   {:default nil}))

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
