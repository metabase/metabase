(ns metabase-enterprise.database-routing.models
  (:require
   [metabase-enterprise.database-routing.audit :as database-routing.audit]
   [metabase-enterprise.database-routing.common :refer [router-db->destination-db-id]]
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise defenterprise-schema]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.warehouse-schema.models.field :as field]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DatabaseRouter [_model] :db_router)

(doto :model/DatabaseRouter
  (derive :metabase/model)
  (derive :hook/events))

(defmethod events/spec :model/DatabaseRouter
  [_model]
  {:create :event/database-router-create
   :update :event/database-router-update
   :delete :event/database-router-delete})

(defmethod audit/spec :model/DatabaseRouter [_model]
  {:track          []
   :track-redacted [:database_id :user_attribute]
   :skip           []
   :details        database-routing.audit/details
   :subject        database-routing.audit/subject
   :topics         {:create :database-update
                    :update :database-update
                    :delete :database-update}})

(defmethod app-db-copy/spec :model/DatabaseRouter [_model]
  {:skip? true})

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(defn- check-not-destination
  "Throws a 400 when the Database with `database-id` is a destination, since a destination cannot be a router."
  [database-id]
  (when (database-routing.db/destination-database? database-id)
    (throw (ex-info (tru "Cannot make a destination database a router database") {:status-code 400}))))

(t2/define-before-insert :model/DatabaseRouter
  [{:keys [database_id] :as router}]
  (check-not-destination database_id)
  router)

(t2/define-before-update :model/DatabaseRouter
  [router]
  (let [changes (t2/changes router)]
    (when (contains? changes :database_id)
      (throw (ex-info (tru "You cannot change the database of a router.") {:status-code 400})))
    router))

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
