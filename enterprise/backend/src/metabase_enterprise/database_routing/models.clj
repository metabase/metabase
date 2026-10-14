(ns metabase-enterprise.database-routing.models
  (:require
   [metabase-enterprise.database-routing.common :refer [router-db-or-id->destination-db-id]]
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
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

(defenterprise hydrate-router-anonymous-access-granted
  "Enterprise implementation. Hydrates the router's anonymous-access grant on the databases"
  :feature :database-routing
  [k databases]
  (mi/instances-with-hydrated-data
   databases k
   (fn [] (database-routing.db/router-anonymous-access-grants-by-database (map :id databases)))
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

(defenterprise refuses-anonymous-access?
  "Enterprise implementation. Whether the Database with `database-id` refuses anonymous traffic: it is a router
  database and no admin has granted it anonymous access. A public link on such a database could never return data."
  :feature :database-routing
  [database-id]
  (and (database-routing.db/router-exists? database-id)
       (not (database-routing.db/router-anonymous-access-granted? database-id))))

(defenterprise db-routing-enabled?
  "Returns whether or not the given database is either a router or destination database."
  :feature :database-routing
  :fallback :oss
  [db-or-id]
  (or (database-routing.db/router-exists? (u/the-id db-or-id))
      (some->> (:router-database-id db-or-id)
               database-routing.db/router-exists?)))
