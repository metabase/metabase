(ns metabase-enterprise.database-routing.model
  "Model for database routing. There is the model :DatabaseRouter backed by the db_router table. Db routing exists once
  in the 'regular app' and arbitrarily many times connected to workspaces. The constraints are

  - there is one entry per db where user attribute is not null. This is the one routed database in the application.

  - there is one entry per db/workspace id. Each workspace can route a database into it. This allows for special
  connections in workspaces on existing databases that have restricted permissions: they can be locked down to just a
  single schema and read-only on the original schema.

  Notable, when database is enabled, and then turned off, it does not remove the routing record, it just blanks out
  the user_attribute. Need to update this and maintain it. see
  http://localhost:3000/api/ee/database-routing/router-database/11"
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
