(ns metabase-enterprise.database-routing.model
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DatabaseRouter [_model] :db_router)

(doto :model/DatabaseRouter
  (derive :metabase/model))

(defenterprise router-user-attribute
  "Enterprise implementation. Returns the user attribute, if set, that will be used for the DB routing feature for this database."
  :feature :database-routing
  [db-or-id]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :database_id (u/the-id db-or-id)))
