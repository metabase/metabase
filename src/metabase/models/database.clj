(ns metabase.models.database
  (:require [cheshire.generate :refer [add-encoder encode-map]]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.db.util :as mdb.u]
            [metabase.driver :as driver]
            [metabase.driver.impl :as driver.impl]
            [metabase.driver.util :as driver.u]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.secret :as secret :refer [Secret]]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]
            [toucan.models :as models]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Database :metabase_database)

(defn- schedule-tasks!
  "(Re)schedule sync operation tasks for `database`. (Existing scheduled tasks will be deleted first.)"
  [database]
  (try
    ;; this is done this way to avoid circular dependencies
    (classloader/require 'metabase.task.sync-databases)
    ((resolve 'metabase.task.sync-databases/check-and-schedule-tasks-for-db!) database)
    (catch Throwable e
      (log/error e (trs "Error scheduling tasks for DB")))))

;; TODO - something like NSNotificationCenter in Objective-C would be really really useful here so things that want to
;; implement behavior when an object is deleted can do it without having to put code here

(defn- unschedule-tasks!
  "Unschedule any currently pending sync operation tasks for `database`."
  [database]
  (try
    (classloader/require 'metabase.task.sync-databases)
    ((resolve 'metabase.task.sync-databases/unschedule-tasks-for-db!) database)
    (catch Throwable e
      (log/error e (trs "Error unscheduling tasks for DB.")))))

(defn- post-insert [database]
  (u/prog1 database
    ;; add this database to the All Users permissions group
    (perms/grant-full-data-permissions! (perms-group/all-users) database)
    ;; give full download perms for this database to the All Users permissions group
    (perms/grant-full-download-permissions! (perms-group/all-users) database)
    ;; schedule the Database sync & analyze tasks
    (schedule-tasks! database)))

(defn- post-select [{driver :engine, :as database}]
  (cond-> database
    ;; TODO - this is only really needed for API responses. This should be a `hydrate` thing instead!
    (driver.impl/registered? driver)
    (assoc :features (driver.u/features driver database))

    (and (driver.impl/registered? driver) (:details database))
    (->> (driver/normalize-db-details driver))))

(defn- delete-orphaned-secrets!
  "Delete Secret instances from the app DB, that will become orphaned when `database` is deleted. For now, this will
  simply delete any Secret whose ID appears in the details blob, since every Secret instance that is currently created
  is exclusively associated with a single Database.

  In the future, if/when we allow arbitrary association of secret instances to database instances, this will need to
  change and become more complicated (likely by consulting a many-to-many join table)."
  [{:keys [id details] :as database}]
  (when-let [conn-props-fn (get-method driver/connection-properties (driver.u/database->driver database))]
    (let [conn-props                 (conn-props-fn (driver.u/database->driver database))
          possible-secret-prop-names (keys (secret/conn-props->secret-props-by-name conn-props))]
      (doseq [secret-id (reduce (fn [acc prop-name]
                                  (if-let [secret-id (get details (keyword (str prop-name "-id")))]
                                    (conj acc secret-id)
                                    acc))
                                []
                                possible-secret-prop-names)]
        (log/info (trs "Deleting secret ID {0} from app DB because the owning database ({1}) is being deleted"
                       secret-id
                       id))
        (db/delete! Secret :id secret-id)))))

(defn- pre-delete [{id :id, driver :engine, :as database}]
  (unschedule-tasks! database)
  (db/execute! {:delete-from (db/resolve-model 'Permissions)
                :where       [:like :object (str "%" (perms/data-perms-path id) "%")]})
  (delete-orphaned-secrets! database)
  (try
    (driver/notify-database-updated driver database)
    (catch Throwable e
      (log/error e (trs "Error sending database deletion notification")))))

(defn- handle-db-details-secret-prop!
  "Helper fn for reducing over a map of all the secret connection-properties, keyed by name. This is side effecting. At
  each iteration step, if there is a -value suffixed property set in the details to be persisted, then we instead insert
  (or update an existing) Secret instance and point to the inserted -id instead."
  [database details conn-prop-nm conn-prop]
  (let [sub-prop   (fn [suffix]
                     (keyword (str conn-prop-nm suffix)))
        id-kw      (sub-prop "-id")
        value-kw   (sub-prop "-value")
        new-name   (format "%s for %s" (:display-name conn-prop) (:name database))
        kind       (:secret-kind conn-prop)
        ;; in the future, when secret values can simply be changed by passing
        ;; in a new ID (as opposed to a new value), this behavior will change,
        ;; but for now, we should simply look for the value
        secret-map (secret/db-details-prop->secret-map details conn-prop-nm)
        value      (:value secret-map)
        src        (:source secret-map)] ; set the :source due to the -path suffix (see above)]
    (if (nil? value) ;; secret value for this conn prop was not changed
      details
      (let [{:keys [id] :as secret*} (secret/upsert-secret-value!
                                       (id-kw details)
                                       new-name
                                       kind
                                       src
                                       value)]
        (-> details
            ;; remove the -value keyword (since in the persisted details blob, we only ever want to store the -id),
            ;; but the value may be re-added by expand-inferred-secret-values below (if appropriate)
            (dissoc value-kw (sub-prop "-path"))
            (assoc id-kw id)
            (secret/expand-inferred-secret-values conn-prop-nm conn-prop secret*))))))

(defn- handle-secrets-changes [{:keys [details] :as database}]
  (if (map? details)
    (let [updated-details (secret/reduce-over-details-secret-values
                            (driver.u/database->driver database)
                            details
                            (partial handle-db-details-secret-prop! database))]
      (assoc database :details updated-details))
    database))

(defn- pre-update
  [{new-metadata-schedule    :metadata_sync_schedule,
    new-fieldvalues-schedule :cache_field_values_schedule,
    new-engine               :engine
    :as                      database}]
  (let [{is-sample?               :is_sample
         old-metadata-schedule    :metadata_sync_schedule
         old-fieldvalues-schedule :cache_field_values_schedule
         existing-engine          :engine
         existing-name            :name} (db/select-one [Database
                                                         :metadata_sync_schedule
                                                         :cache_field_values_schedule
                                                         :engine
                                                         :name
                                                         :is_sample] :id (u/the-id database))
        new-engine                       (some-> new-engine keyword)]
    (if (and is-sample?
             new-engine
             (not= new-engine existing-engine))
      (throw (ex-info (trs "The engine on a sample database cannot be changed.")
                      {:status-code     400
                       :existing-engine existing-engine
                       :new-engine      new-engine}))
      (u/prog1 (handle-secrets-changes database)
        ;; TODO - this logic would make more sense in post-update if such a method existed
        ;; if the sync operation schedules have changed, we need to reschedule this DB
        (when (or new-metadata-schedule new-fieldvalues-schedule)
          ;; if one of the schedules wasn't passed continue using the old one
          (let [new-metadata-schedule    (or new-metadata-schedule old-metadata-schedule)
                new-fieldvalues-schedule (or new-fieldvalues-schedule old-fieldvalues-schedule)]
            (when (not= [new-metadata-schedule new-fieldvalues-schedule]
                        [old-metadata-schedule old-fieldvalues-schedule])
              (log/info
               (trs "{0} Database ''{1}'' sync/analyze schedules have changed!" existing-engine existing-name)
               "\n"
               (trs "Sync metadata was: ''{0}'' is now: ''{1}''" old-metadata-schedule new-metadata-schedule)
               "\n"
               (trs "Cache FieldValues was: ''{0}'', is now: ''{1}''" old-fieldvalues-schedule new-fieldvalues-schedule))
              ;; reschedule the database. Make sure we're passing back the old schedule if one of the two wasn't supplied
              (schedule-tasks!
               (assoc database
                      :metadata_sync_schedule      new-metadata-schedule
                      :cache_field_values_schedule new-fieldvalues-schedule)))))))))

(defn- pre-insert [database]
  (-> database
      handle-secrets-changes
      (assoc :initial_sync_status "incomplete")))

(defn- perms-objects-set [{db-id :id} read-or-write]
  #{(case read-or-write
      :read  (perms/data-perms-path db-id)
      :write (perms/db-details-write-perms-path db-id))})

(u/strict-extend (class Database)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:database :db])
          :types          (constantly {:details                     :encrypted-json
                                       :options                     :json
                                       :engine                      :keyword
                                       :metadata_sync_schedule      :cron-string
                                       :cache_field_values_schedule :cron-string
                                       :start_of_week               :keyword
                                       :settings                    :encrypted-json})
          :properties     (constantly {:timestamped? true})
          :post-insert    post-insert
          :post-select    post-select
          :pre-insert     pre-insert
          :pre-update     pre-update
          :pre-delete     pre-delete})
  mi/IObjectPermissions
  (merge mi/IObjectPermissionsDefaults
         {:perms-objects-set perms-objects-set
          :can-read?         (partial mi/current-user-has-partial-permissions? :read)
          :can-write?        (partial mi/current-user-has-full-permissions? :write)})

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [:name :engine])})


;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------

(defn ^:hydrate tables
  "Return the `Tables` associated with this `Database`."
  [{:keys [id]}]
  ;; TODO - do we want to include tables that should be `:hidden`?
  (db/select 'Table, :db_id id, :active true, {:order-by [[:%lower.display_name :asc]]}))

(defn schema-names
  "Return a *sorted set* of schema names (as strings) associated with this `Database`."
  [{:keys [id]}]
  (when id
    (apply sorted-set (db/select-field :schema 'Table
                        :db_id id
                        {:modifiers [:DISTINCT]}))))

(defn pk-fields
  "Return all the primary key `Fields` associated with this `database`."
  [{:keys [id]}]
  (let [table-ids (db/select-ids 'Table, :db_id id, :active true)]
    (when (seq table-ids)
      (db/select 'Field, :table_id [:in table-ids], :semantic_type (mdb.u/isa :type/PK)))))

(defn schema-exists?
  "Does `database` have any tables with `schema`?"
  ^Boolean [{:keys [id]}, schema]
  (db/exists? 'Table :db_id id, :schema (some-> schema name)))


;;; -------------------------------------------------- JSON Encoder --------------------------------------------------

(def ^:const protected-password
  "The string to replace passwords with when serializing Databases."
  "**MetabasePass**")

(defn sensitive-fields-for-db
  "Gets all sensitive fields that should be redacted in API responses for a given database. Delegates to
  driver.u/sensitive-fields using the given database's driver (if valid), so refer to that for full details. If a valid
  driver can't be clearly determined, this simply returns the default set (driver.u/default-sensitive-fields)."
  [database]
  (if (and (some? database) (not-empty database))
      (let [driver (driver.u/database->driver database)]
        (if (some? driver)
            (driver.u/sensitive-fields (driver.u/database->driver database))
            driver.u/default-sensitive-fields))
      driver.u/default-sensitive-fields))

;; when encoding a Database as JSON remove the `details` and `settings` for any User without write perms for the DB.
;; Users with write perms can see the `details` but remove anything resembling a password. No one gets to see this in
;; an API response!
(add-encoder
 DatabaseInstance
 (fn [db json-generator]
   (encode-map
    (if (not (mi/can-write? db))
      (dissoc db :details :settings)
      (update db :details (fn [details]
                            (reduce
                             #(m/update-existing %1 %2 (constantly protected-password))
                             details
                             (sensitive-fields-for-db db)))))
    json-generator)))

;;; ------------------------------------------------ Serialization ----------------------------------------------------

(defmethod serdes.base/extract-one "Database"
  [_model-name {secrets :database/secrets :or {secrets :exclude}} entity]
  ;; TODO Support alternative encryption of secret database details.
  ;; There's one optional foreign key: creator_id. Resolve it as an email.
  (cond-> (serdes.base/extract-one-basics "Database" entity)
    (:creator_id entity) (assoc :creator_id (db/select-one-field :email 'User :id (:creator_id entity)))
    (= :exclude secrets) (dissoc :details)))

(defmethod serdes.base/serdes-entity-id "Database"
  [_ {:keys [name]}]
  name)

(defmethod serdes.base/serdes-generate-path "Database"
  [_ {:keys [name]}]
  [{:model "Database" :id name}])

(defmethod serdes.base/load-find-local "Database"
  [[{:keys [id]}]]
  (db/select-one-field :id Database :name id))

(defmethod serdes.base/load-xform "Database" [{:keys [creator_id] :as entity}]
  (cond-> (serdes.base/load-xform-basics entity)
    creator_id (assoc :creator_id (db/select-one-field :id 'User :email creator_id))))
