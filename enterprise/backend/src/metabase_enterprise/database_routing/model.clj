(ns metabase-enterprise.database-routing.model
  (:require
   [metabase-enterprise.database-routing.common :refer [router-db-or-id->mirror-db-id]]
   [metabase.api.common :as api]
   [metabase.models.field :as field]
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

(defenterprise hash-input-for-database-routing
  "Enterprise version. Returns a hash input that will be used for fields subject to database routing."
  :feature :database-routing
  [field]
  (when-let [mirror-db-id (some->> field u/the-id field/field-id->database-id (router-db-or-id->mirror-db-id @api/*current-user*))]
    {:mirror-db-id mirror-db-id}))
