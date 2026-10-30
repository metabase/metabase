(ns metabase-enterprise.database-routing.models
  (:require
   [metabase-enterprise.database-routing.common :refer [router-db->destination-db-id]]
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise defenterprise-schema]]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field :as field]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DatabaseRouter [_model] :db_router)

(doto :model/DatabaseRouter
  (derive :metabase/model))

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
  (when-let [destination-db-id (some->> field u/the-id field/field-id->database-id driver.u/lib-database router-db->destination-db-id)]
    {:destination-db-id (when (premium-features/has-feature? :database-routing) destination-db-id)}))

(defenterprise delete-associated-database-router!
  "Deletes the Database Router associated with this router database."
  :feature :database-routing
  [db-id]
  (database-routing.db/delete-router! db-id))

(defenterprise-schema db-routing-enabled? :- :boolean
  "Returns whether or not the Lib metadata `db` of a Database is either a router or destination database, even while
  the `:database-routing` feature is unavailable."
  :feature :none
  [db :- ::lib.schema.metadata/database]
  (boolean (or (database-routing.db/router-exists? (:id db))
               (some->> (:router-database-id db)
                        database-routing.db/router-exists?))))
