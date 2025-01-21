(ns metabase.models.database
  (:require
   [clojure.core.match :refer [match]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.audit :as audit]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.impl :as driver.impl]
   [metabase.driver.util :as driver.u]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.secret :as secret]
   [metabase.models.serialization :as serdes]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   ;; Trying to use metabase.search would cause a circular reference ;_;
   [metabase.search.spec :as search.spec]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [deferred-tru trs]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.realize :as t2.realize]
   [toucan2.tools.with-temp :as t2.with-temp]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/Database [_model] :metabase_database)

(methodical/defmethod t2.pipeline/results-transform [:toucan.result-type/instances :model/Database]
  [query-type model]
  (comp
   (next-method query-type model)
    ;; This is for safety - if a secret ever gets stored in details we don't want it to leak.
    ;; This will also help to secure properties that we set to secret in the future.
   (map secret/clean-secret-properties-from-database)))

(t2/deftransforms :model/Database
  {:details                     mi/transform-encrypted-json
   :engine                      mi/transform-keyword
   :metadata_sync_schedule      mi/transform-cron-string
   :cache_field_values_schedule mi/transform-cron-string
   :start_of_week               mi/transform-keyword
   :settings                    mi/transform-encrypted-json
   :dbms_version                mi/transform-json})

(methodical/defmethod t2/model-for-automagic-hydration [:default :database] [_model _k] :model/Database)
(methodical/defmethod t2/model-for-automagic-hydration [:default :db]       [_model _k] :model/Database)

(doto :model/Database
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2.with-temp/do-with-temp* :before :model/Database
  [_model _explicit-attributes f]
  (fn [temp-object]
    ;; Grant All Users full perms on the temp-object so that tests don't have to manually set permissions
    (data-perms/set-database-permission! (perms-group/all-users) temp-object :perms/view-data :unrestricted)
    (data-perms/set-database-permission! (perms-group/all-users) temp-object :perms/create-queries :query-builder-and-native)
    (data-perms/set-database-permission! (perms-group/all-users) temp-object :perms/download-results :one-million-rows)
    (f temp-object)))

(defn- should-read-audit-db?
  "Audit Database should only be fetched if audit app is enabled."
  [database-id]
  (and (not (premium-features/enable-audit-app?)) (= database-id audit/audit-db-id)))

(defmethod mi/can-read? :model/Database
  ([instance]
   (mi/can-read? :model/Database (u/the-id instance)))
  ([_model pk]
   (if (should-read-audit-db? pk)
     false
     (contains? #{:query-builder :query-builder-and-native}
                (data-perms/most-permissive-database-permission-for-user
                 api/*current-user-id*
                 :perms/create-queries
                 pk)))))

(defenterprise current-user-can-write-db?
  "OSS implementation. Returns a boolean whether the current user can write the given field."
  metabase-enterprise.advanced-permissions.common
  [_db-id]
  (mi/superuser?))

(defn- can-write?
  [db-id]
  (and (not= db-id audit/audit-db-id)
       (current-user-can-write-db? db-id)))

(defmethod mi/can-write? :model/Database
  ;; Lack of permission to change database details will also exclude the `details` field from the HTTP response,
  ;; cf. the implementation of [[metabase.models.interface/to-json]] for `:model/Database`.
  ([{:keys [is_attached_dwh] :as instance}]
   (and (can-write? (u/the-id instance))
        (not is_attached_dwh)))
  ([_model pk]
   (and (can-write? pk)
        (not (:is_attached_dwh (t2/select-one :model/Database :id pk))))))

(defn- infer-db-schedules
  "Infer database schedule settings based on its options."
  [{:keys [details is_full_sync is_on_demand cache_field_values_schedule metadata_sync_schedule] :as database}]
  (match [(boolean (:let-user-control-scheduling details)) is_full_sync is_on_demand]
    [false _ _]
    (merge
     database
     (sync.schedules/schedule-map->cron-strings
      (sync.schedules/default-randomized-schedule)))

    ;; "Regularly on a schedule"
    ;; -> sync both steps, schedule should be provided
    [true true false]
    (do
      (assert (every? some? [cache_field_values_schedule metadata_sync_schedule]))
      database)

    ;; "Only when adding a new filter" or "Never, I'll do it myself"
    ;; -> Sync metadata only
    [true false _]
    ;; schedules should only contains metadata_sync, but FE might sending both
    ;; so we just manually nullify it here
    (assoc database :cache_field_values_schedule nil)))

(defn- check-and-schedule-tasks-for-db!
  "(Re)schedule sync operation tasks for `database`. (Existing scheduled tasks will be deleted first.)"
  [database]
  (try
    ;; this is done this way to avoid circular dependencies
    ((requiring-resolve 'metabase.sync.task.sync-databases/check-and-schedule-tasks-for-db!) database)
    (catch Throwable e
      (log/error e "Error scheduling tasks for DB"))))

(defn check-and-schedule-tasks!
  "(Re)schedule sync operation tasks for any database which is not yet being synced regularly."
  []
  (doseq [database (t2/select :model/Database)]
    (check-and-schedule-tasks-for-db! database)))

;; TODO - something like NSNotificationCenter in Objective-C would be really really useful here so things that want to
;; implement behavior when an object is deleted can do it without having to put code here

(defn- unschedule-tasks!
  "Unschedule any currently pending sync operation tasks for `database`."
  [database]
  (try
    ((requiring-resolve 'metabase.sync.task.sync-databases/unschedule-tasks-for-db!) database)
    (catch Throwable e
      (log/error e "Error unscheduling tasks for DB."))))

(defn- set-new-database-permissions!
  [database]
  (t2/with-transaction [_conn]
    (let [all-users-group  (perms-group/all-users)
          non-magic-groups (perms-group/non-magic-groups)
          non-admin-groups (conj non-magic-groups all-users-group)]
      (if (:is_audit database)
        (doseq [group non-admin-groups]
          (data-perms/set-database-permission! group database :perms/view-data :unrestricted)
          (data-perms/set-database-permission! group database :perms/create-queries :no)
          (data-perms/set-database-permission! group database :perms/download-results :one-million-rows)
          (data-perms/set-database-permission! group database :perms/manage-table-metadata :no)
          (data-perms/set-database-permission! group database :perms/manage-database :no))
        (doseq [group non-admin-groups]
          (data-perms/set-new-database-permissions! group database))))))

(t2/define-after-insert :model/Database
  [database]
  (u/prog1 database
    (set-new-database-permissions! database)
    ;; schedule the Database sync & analyze tasks This will not do anything when coming
    ;; from [[metabase-enterprise.advanced-config.file/initialize!]], since the scheduler will not be up yet. Thus, we
    ;; call [[metabase.sync.task.sync-databases/check-and-schedule-tasks!]] from [[metabase.core.core/init!]] to
    ;; self-heal.
    (check-and-schedule-tasks-for-db! (t2.realize/realize database))))

(def ^:private ^:dynamic *normalizing-details*
  "Track whether we're calling [[driver/normalize-db-details]] already to prevent infinite
  recursion. [[driver/normalize-db-details]] is actually done for side effects!"
  false)

(t2/define-after-select :model/Database
  [{driver :engine, :as database}]
  (letfn [(normalize-details [db]
            (binding [*normalizing-details* true]
              (driver/normalize-db-details
               driver
               (m/update-existing-in db [:details :auth-provider] keyword))))]
    (cond-> database
      ;; TODO - this is only really needed for API responses. This should be a `hydrate` thing instead!
      (driver.impl/registered? driver)
      (assoc :features (driver.u/features driver (t2.realize/realize database)))

      (and (driver.impl/registered? driver)
           (map? (:details database))
           (not *normalizing-details*))
      normalize-details)))

(t2/define-before-delete :model/Database
  [{id :id, driver :engine, :as database}]
  (unschedule-tasks! database)
  (secret/delete-orphaned-secrets! database)
  ;; We need to use toucan to delete the fields instead of cascading deletes because MySQL doesn't support columns with cascade delete
  ;; foreign key constraints in generated columns. #44866
  (when-some [table-ids (not-empty (t2/select-pks-vec :model/Table :db_id id))]
    (t2/delete! :model/Field :table_id [:in table-ids]))
  (try
    (driver/notify-database-updated driver database)
    (catch Throwable e
      (log/error e "Error sending database deletion notification"))))

(defn- handle-uploads-enabled!
  "This function maintains the invariant that only one database can have uploads_enabled=true."
  [db]
  (when (:uploads_enabled db)
    (t2/update! :model/Database :uploads_enabled true {:uploads_enabled false :uploads_table_prefix nil :uploads_schema_name nil}))
  db)

(t2/define-before-update :model/Database
  [database]
  (let [changes                              (t2/changes database)
        {new-engine               :engine
         new-settings             :settings} changes
        {is-sample?               :is_sample
         existing-settings        :settings
         existing-engine          :engine}   (t2/original database)
        new-engine                       (some-> new-engine keyword)]
    (if (and is-sample?
             new-engine
             (not= new-engine existing-engine))
      (throw (ex-info (trs "The engine on a sample database cannot be changed.")
                      {:status-code     400
                       :existing-engine existing-engine
                       :new-engine      new-engine}))
      (u/prog1 (cond-> database
                 ;; If the engine doesn't support nested field columns, `json_unfolding` must be nil
                 (and (some? (:details changes))
                      (not (driver.u/supports? (or new-engine existing-engine) :nested-field-columns database)))
                 (update :details dissoc :json_unfolding)

                 (or
                  ;if there is any changes in user control setting
                  (some? (get-in changes [:details :let-user-control-scheduling]))
                  ;; if the let user control scheduling is already on, we should always try to re-infer it
                  (get-in database [:details :let-user-control-scheduling])
                  ;; if there is a changes in schedules, make sure it respects the settings
                  (some some? [(:cache_field_values_schedule changes) (:metadata_sync_schedule changes)]))
                 infer-db-schedules

                 (some? (:details changes))
                 secret/handle-incoming-client-secrets!

                 (:uploads_enabled changes)
                 handle-uploads-enabled!)
        ;; This maintains a constraint that if a driver doesn't support actions, it can never be enabled
        ;; If we drop support for actions for a driver, we'd need to add a migration to disable actions for all databases
        (when (and (:database-enable-actions (or new-settings existing-settings))
                   (not (driver.u/supports? (or new-engine existing-engine) :actions database)))
          (throw (ex-info (trs "The database does not support actions.")
                          {:status-code     400
                           :existing-engine existing-engine
                           :new-engine      new-engine})))))))

(t2/define-after-update :model/Database
  [database]
  ;; This will not do anything when coming from [[metabase-enterprise.advanced-config.file/initialize!]], since the
  ;; scheduler will not be up yet. Thus, we call [[metabase.sync.task.sync-databases/check-and-schedule-tasks!]]
  ;; from [[metabase.core/init!]] to self-heal.
  (check-and-schedule-tasks-for-db! (t2.realize/realize database)))

(t2/define-before-insert :model/Database
  [{:keys [details initial_sync_status], :as database}]
  (-> (merge {:is_full_sync true
              :is_on_demand false}
             database)
      (cond->
       (not details)             (assoc :details {})
       (not initial_sync_status) (assoc :initial_sync_status "incomplete"))
      secret/handle-incoming-client-secrets!
      handle-uploads-enabled!
      infer-db-schedules))

(defmethod serdes/hash-fields :model/Database
  [_database]
  [:name :engine])

(defsetting persist-models-enabled
  (deferred-tru "Whether to enable models persistence for a specific Database.")
  :default        false
  :type           :boolean
  :visibility     :public
  :database-local :only)

(defmethod mi/exclude-internal-content-hsql :model/Database
  [_model & {:keys [table-alias]}]
  (let [maybe-alias #(h2x/identifier :field table-alias %)]
    [:not [:or (maybe-alias :is_sample) (maybe-alias :is_audit)]]))

;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------

;; only used in tests
(defn tables
  "Return the `Tables` associated with this `Database`."
  [{:keys [id]}]
  ;; TODO - do we want to include tables that should be `:hidden`?
  (t2/select :model/Table :db_id id :active true {:order-by [[:%lower.display_name :asc]]}))

(methodical/defmethod t2/batched-hydrate [:model/Database :tables]
  "Batch hydrate `Tables` for the given `Database`."
  [_model k databases]
  (mi/instances-with-hydrated-data
   databases k
   #(group-by :db_id
              ;; TODO - do we want to include tables that should be `:hidden`?
              (t2/select :model/Table
                         :db_id  [:in (map :id databases)]
                         :active true
                         {:order-by [[:db_id :asc] [:%lower.display_name :asc]]}))
   :id
   {:default []}))

(defn pk-fields
  "Return all the primary key `Fields` associated with this `database`."
  [{:keys [id]}]
  (let [table-ids (t2/select-pks-set 'Table, :db_id id, :active true)]
    (when (seq table-ids)
      (t2/select 'Field, :table_id [:in table-ids], :semantic_type (mdb.query/isa :type/PK)))))

;;; -------------------------------------------------- JSON Encoder --------------------------------------------------

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

(methodical/defmethod mi/to-json :model/Database
  "When encoding a Database as JSON remove the `details` for any User without write perms for the DB.
  Users with write perms can see the `details` but remove anything resembling a password. No one gets to see this in
  an API response!

  Also remove settings that the User doesn't have read perms for."
  [db json-generator]
  (next-method
   (let [db (if (not (mi/can-write? db))
              (do (log/debug "Fully redacting database details during json encoding.")
                  (dissoc db :details))
              (do (log/debug "Redacting sensitive fields within database details during json encoding.")
                  (-> db
                      (secret/to-json-hydrate-redacted-secrets)
                      (update :details (fn [details]
                                         (reduce
                                          #(m/update-existing %1 %2 (fn [v] (when v secret/protected-password)))
                                          details
                                          (sensitive-fields-for-db db)))))))]
     (update db :settings
             (fn [settings]
               (when (map? settings)
                 (u/prog1
                   (m/filter-keys
                    (fn [setting-name]
                      (try
                        (setting/can-read-setting? setting-name
                                                   (setting/current-user-readable-visibilities))
                        (catch Throwable e
                         ;; there is an known issue with exception is ignored when render API response (#32822)
                         ;; If you see this error, you probably need to define a setting for `setting-name`.
                         ;; But ideally, we should resovle the above issue, and remove this try/catch
                          (log/errorf e "Error checking the readability of %s setting. The setting will be hidden in API response."
                                      setting-name)
                         ;; let's be conservative and hide it by defaults, if you want to see it,
                         ;; you need to define it :)
                          false)))
                    settings)
                   (when (not= <> settings)
                     (log/debug "Redacting non-user-readable database settings during json encoding.")))))))
   json-generator))

;;; ------------------------------------------------ Serialization ----------------------------------------------------

(defmethod serdes/make-spec "Database"
  [_model-name {:keys [include-database-secrets]}]
  {:copy      [:auto_run_queries :cache_field_values_schedule :caveats :dbms_version
               :description :engine :is_audit :is_attached_dwh :is_full_sync :is_on_demand :is_sample :metadata_sync_schedule :name
               :points_of_interest :refingerprint :settings :timezone :uploads_enabled :uploads_schema_name
               :uploads_table_prefix]
   :skip      [;; deprecated field
               :cache_ttl]
   :transform {:created_at          (serdes/date)
               ;; details should be imported if available regardless of options
               :details             {:export-with-context
                                     (fn [current _ details]
                                       (if (and include-database-secrets
                                                (not (:is_attached_dwh current)))
                                         details
                                         ::serdes/skip))
                                     :import identity}
               :creator_id          (serdes/fk :model/User)
               :initial_sync_status {:export identity :import (constantly "complete")}}})

(defmethod serdes/entity-id "Database"
  [_ {:keys [name]}]
  name)

(defmethod serdes/generate-path "Database"
  [_ {:keys [name]}]
  [{:model "Database" :id name}])

(defmethod serdes/load-find-local "Database"
  [[{:keys [id]}]]
  (t2/select-one :model/Database :name id))

(defmethod serdes/storage-path "Database" [{:keys [name]} _]
  ;; ["databases" "db_name" "db_name"] directory for the database with same-named file inside.
  ["databases" name name])

(defmethod audit-log/model-details :model/Database
  [database _event-type]
  (select-keys database [:id :name :engine]))

(def ^{:arglists '([table-id])} table-id->database-id
  "Retrieve the `Database` ID for the given table-id."
  (mdb/memoize-for-application-db
   (fn [table-id]
     {:pre [(integer? table-id)]}
     (t2/select-one-fn :db_id :model/Table, :id table-id))))

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search.spec/define-spec "database"
  {:model        :model/Database
   :attrs        {:archived      false
                  :collection-id false
                  :creator-id    false
                  ;; not sure if this is another bug
                  :database-id   false
                  :created-at    true
                  :updated-at    true}
   :search-terms [:name :description]
   :render-terms {:initial-sync-status true}})
