(ns metabase-enterprise.database-routing.model
  (:require
   [metabase-enterprise.database-routing.common :refer [router-db-or-id->destination-db-id]]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
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
   (fn [] (t2/select-fn->fn :database_id :user_attribute :model/DatabaseRouter
                            :database_id  [:in (map :id databases)]))
   :id
   {:default nil}))

(defenterprise hash-input-for-database-routing
  "Enterprise version. Returns a hash input that will be used for fields subject to database routing."
  :feature :database-routing
  [field]
  (when-let [destination-db-id (some->> field u/the-id field/field-id->database-id router-db-or-id->destination-db-id)]
    {:destination-db-id destination-db-id}))

(defenterprise delete-associated-database-router!
  "Deletes the Database Router associated with this router database."
  :feature :database-routing
  [db-id]
  (t2/delete! :model/DatabaseRouter :database_id db-id))

(defenterprise db-routing-enabled?
  "Returns whether or not the given database is either a router or destination database."
  :feature :database-routing
  :fallback :oss
  [db-or-id]
  (or (t2/exists? :model/DatabaseRouter :database_id (u/the-id db-or-id))
      (some->> (:router-database-id db-or-id)
               (t2/exists? :model/DatabaseRouter :database_id))))
