(ns metabase-enterprise.database-routing.models
  (:require
   [metabase-enterprise.database-routing.audit :as database-routing.audit]
   [metabase-enterprise.database-routing.common :refer [router-db->destination-db-id]]
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase-enterprise.database-routing.schema :as database-routing.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise defenterprise-schema]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.field :as field]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DatabaseRouter [_model] :db_router)

(derive :model/DatabaseRouter :metabase/model)

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

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

(defenterprise-schema db-routing-enabled? :- :boolean
  "Returns whether or not the Lib metadata `db` of a Database is either a router or destination database, even while
  the `:database-routing` feature is unavailable."
  :feature :none
  [db :- ::lib.schema.metadata/database]
  (boolean (or (database-routing.db/router-exists? (:id db))
               (some->> (:router-database-id db)
                        database-routing.db/router-exists?))))

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(defn- check-not-destination
  "Throws a 400 when the Database with `database-id` is a destination, since a destination cannot be a router."
  [database-id]
  (when (database-routing.db/destination-database? database-id)
    (throw (ex-info (tru "Cannot make a destination database a router database") {:status-code 400}))))

(mu/defn create-database-router!
  "Insert the DatabaseRouter `row`, publishing the event of the write; a destination Database is a 400."
  [{:keys [database_id user_attribute]} :- ::database-routing.schema/database-router.create]
  (check-not-destination database_id)
  (t2/with-transaction [_conn]
    (let [routers (database-routing.db/insert-router! database_id user_attribute)]
      (events/publish-lifecycle! [(events/created :event/database-router-create routers)])
      (count routers))))

(mu/defn update-database-router!
  "Apply `changes` to the DatabaseRouter of the Database with `database-id`, publishing the event of the write; moving it
  to another Database is a 400."
  [database-id :- ::lib.schema.id/database
   changes     :- ::database-routing.schema/database-router.update]
  (t2/with-transaction [_conn]
    (if-let [stored (database-routing.db/router-for-database database-id)]
      (let [changed (into {} (remove (fn [[k v]] (= v (get stored k)))) changes)]
        (when (contains? changed :database_id)
          (throw (ex-info (tru "You cannot change the database of a router.") {:status-code 400})))
        (if (empty? changed)
          0
          (u/prog1 (database-routing.db/update-router! database-id changed)
            (events/publish-lifecycle! [(events/updated :event/database-router-update
                                                        [stored]
                                                        [(events/updated-row stored changed)])]))))
      0)))

(mu/defn delete-database-router!
  "Delete the DatabaseRouter of the Database with `database-id`, publishing the event of the write."
  [database-id :- ::lib.schema.id/database]
  (t2/with-transaction [_conn]
    (if-let [stored (database-routing.db/router-for-database database-id)]
      (let [event (events/deleted :event/database-router-delete :model/DatabaseRouter [stored])]
        (u/prog1 (database-routing.db/delete-router! database-id)
          (events/publish-lifecycle! [event])))
      0)))

(defenterprise delete-associated-database-router!
  "Deletes the Database Router associated with this router database."
  :feature :database-routing
  [db-id]
  (delete-database-router! db-id))

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/DatabaseRouter [_model]
  {:skip? true})

(defmethod audit/spec :model/DatabaseRouter [_model]
  {:track          []
   :track-redacted [:database_id :user_attribute]
   :skip           []
   :details        database-routing.audit/details
   :state          database-routing.audit/state
   :subject        database-routing.audit/subject
   :topics         {:create :database-update
                    :update :database-update
                    :delete :database-update}})
