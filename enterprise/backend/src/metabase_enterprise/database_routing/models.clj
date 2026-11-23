(ns metabase-enterprise.database-routing.models
  (:require
   [metabase-enterprise.database-routing.audit :as database-routing.audit]
   [metabase-enterprise.database-routing.common :refer [router-db->destination-db-id]]
   [metabase-enterprise.database-routing.db :as database-routing.db]
   [metabase-enterprise.database-routing.schema :as database-routing.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise defenterprise-schema]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field :as field]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]))

(methodical/defmethod t2/table-name :model/DatabaseRouter [_model] :db_router)

(derive :model/DatabaseRouter :metabase/model)

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

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

(defenterprise-schema db-routing-enabled? :- :boolean
  "Returns whether or not the Lib metadata `db` of a Database is either a router or destination database, even while
  the `:database-routing` feature is unavailable."
  :feature :none
  [db :- ::lib.schema.metadata/database]
  (boolean (or (database-routing.db/router-exists? (:id db))
               (some->> (:router-database-id db)
                        database-routing.db/router-exists?))))

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(defn- check-not-destinations
  "Throws a 400 unless every Database with `database-ids` satisfies these rules:

  - it is not a routing destination, since a destination cannot be a router"
  [database-ids]
  (when (and (seq database-ids) (database-routing.db/destination-database-exists? database-ids))
    (throw (ex-info (tru "Cannot make a destination database a router database") {:status-code 400}))))

(mu/defn create-database-routers! :- [:sequential ::database-routing.schema/database-router]
  "Insert the DatabaseRouter `rows` in one transaction and return them in order, publishing their create event; a
  destination Database is a 400."
  [rows :- [:sequential ::database-routing.schema/database-router.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (let [created (into []
                          (mapcat (fn [batch]
                                    (check-not-destinations (mapv :database_id batch))
                                    (database-routing.db/insert-routers! (vec batch))))
                          (partition-all app-db/create-partition-size rows))]
        (events/publish-event! :event/database-router-create (events/create-event created))
        created))))

(defn- check-router-updates
  "Throws unless every row of `updates`, whose stored DatabaseRouters `stored` holds, satisfies these rules:

  - the hooks of the DatabaseRouter accept the row merged into its stored row"
  [stored updates]
  (doseq [{id :id :as row} updates]
    (t2.before-update/before-update :model/DatabaseRouter (merge (stored id) (dissoc row :id)))))

(defn- write-router-updates!
  "Write `updates` over the `stored` DatabaseRouters, one statement per distinct change, and return each row with its
  stored DatabaseRouter."
  [stored updates]
  (doseq [[changes ids] (mi/group-ids-by-changes stored updates)]
    (database-routing.db/update-routers! ids changes))
  (mapv (fn [row] [(stored (:id row)) row]) updates))

(defn- update-router-batch!
  "Check and apply the `batch` of updates whose DatabaseRouters exist, returning what [[write-router-updates!]]
  returns."
  [batch]
  (let [stored  (u/index-by :id (database-routing.db/routers-by-ids (mapv :id batch)))
        updates (filterv (comp stored :id) batch)]
    (check-router-updates stored updates)
    (write-router-updates! stored updates)))

(mu/defn update-database-routers! :- [:sequential ::database-routing.schema/database-router.update]
  "Apply `rows`, each an `:id` and its changes, to their DatabaseRouters in one transaction and return the rows that
  exist, publishing their update event."
  [rows :- [:sequential ::database-routing.schema/database-router.update]]
  (t2/with-transaction [_conn]
    (let [written (into [] (mapcat update-router-batch!) (partition-all app-db/update-partition-size rows))]
      (when (seq written)
        (events/publish-event! :event/database-router-update
                               (events/update-event (into {} (map (fn [[stored _]] [(:id stored) stored])) written)
                                                    (mapv second written))))
      (mapv second written))))

(mu/defn delete-database-routers! :- :nil
  "Delete the DatabaseRouters with `ids` in one transaction, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (let [batches (mapv vec (partition-all app-db/delete-partition-size ids))
            routers (into [] (mapcat database-routing.db/routers-by-ids) batches)]
        (when (seq routers)
          (events/publish-event! :event/database-router-delete (events/delete-event routers))
          (run! database-routing.db/delete-routers! batches)))))
  nil)

(defenterprise delete-database-routers-for-databases!
  "Deletes the Database Routers of the router Databases with `database-ids`, which are being deleted."
  :feature :database-routing
  [database-ids]
  (when (seq database-ids)
    (delete-database-routers! (database-routing.db/router-ids-for-databases (vec database-ids)))))

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
