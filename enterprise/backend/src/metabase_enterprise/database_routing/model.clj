(ns metabase-enterprise.database-routing.model
  (:require
   [metabase-enterprise.database-routing.common :refer [router-db-or-id->mirror-db-id]]
   [metabase.api.common :as api]
   [metabase.feature-flags.unleash :as feature-flags]
   [metabase.models.field :as field]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DatabaseRouter [_model] :db_router)

(doto :model/DatabaseRouter
  (derive :metabase/model))

(defn- db-routing-feature-enabled?
  "Check if the database routing feature is enabled via Unleash."
  []
  (feature-flags/feature-enabled? "db-routing" nil false))

(defenterprise hydrate-router-user-attribute
  "Enterprise implementation. Hydrates the router user attribute on the databases"
  :feature :database-routing
  [k databases]
  ;; Skip if the feature flag is disabled
  (if-not (db-routing-feature-enabled?)
    databases
    (mi/instances-with-hydrated-data
     databases k
     (fn [] (t2/select-fn->fn :database_id :user_attribute :model/DatabaseRouter
                              :database_id  [:in (map :id databases)]))
     :id
     {:default nil})))

(defenterprise hash-input-for-database-routing
  "Enterprise version. Returns a hash input that will be used for fields subject to database routing."
  :feature :database-routing
  [field]
  ;; Skip if the feature flag is disabled
  (when (db-routing-feature-enabled?)
    (when-let [mirror-db-id (some->> field u/the-id field/field-id->database-id (router-db-or-id->mirror-db-id @api/*current-user*))]
      {:mirror-db-id mirror-db-id})))
