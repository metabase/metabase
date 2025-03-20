(ns metabase-enterprise.database-routing.model
  (:require
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
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
