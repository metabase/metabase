(ns metabase.models.database
  (:require [cheshire.generate :refer [add-encoder encode-map]]
            [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [util :as u]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [interface :as i]
             [permissions :as perms]
             [permissions-group :as perm-group]]
            [metabase.plugins.classloader :as classloader]
            [metabase.util.i18n :refer [trs]]
            [toucan
             [db :as db]
             [models :as models]]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Database :metabase_database)

(defn- schedule-tasks!
  "(Re)schedule sync operation tasks for `database`. (Existing scheduled tasks will be deleted first.)"
  [database]
  (try
    ;; this is done this way to avoid circular dependencies
    (classloader/require 'metabase.task.sync-databases)
    ((resolve 'metabase.task.sync-databases/schedule-tasks-for-db!) database)
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
    ;; add this database to the All Users permissions groups
    (perms/grant-full-db-permissions! (perm-group/all-users) database)
    ;; schedule the Database sync & analyze tasks
    (schedule-tasks! database)))

(defn- post-select [{driver :engine, :as database}]
  ;; TODO - this is only really needed for API responses. This should be a `hydrate` thing instead!
  (cond-> database
    (driver/initialized? driver) (assoc :features (driver.u/features driver))))

(defn- pre-delete [{id :id, driver :engine, :as database}]
  (unschedule-tasks! database)
  (db/delete! 'Permissions :object [:like (str (perms/object-path id) "%")])
  (try
    (driver/notify-database-updated driver database)
    (catch Throwable e
      (log/error e (trs "Error sending database deletion notification")))))

;; TODO - this logic would make more sense in post-update if such a method existed
(defn- pre-update
  [{new-metadata-schedule :metadata_sync_schedule, new-fieldvalues-schedule :cache_field_values_schedule, :as database}]
  (u/prog1 database
    ;; if the sync operation schedules have changed, we need to reschedule this DB
    (when (or new-metadata-schedule new-fieldvalues-schedule)
      (let [{old-metadata-schedule    :metadata_sync_schedule
             old-fieldvalues-schedule :cache_field_values_schedule} (db/select-one [Database
                                                                                    :metadata_sync_schedule
                                                                                    :cache_field_values_schedule]
                                                                      :id (u/get-id database))
            ;; if one of the schedules wasn't passed continue using the old one
            new-metadata-schedule    (or new-metadata-schedule old-metadata-schedule)
            new-fieldvalues-schedule (or new-fieldvalues-schedule old-fieldvalues-schedule)]
        (when-not (= [new-metadata-schedule new-fieldvalues-schedule]
                     [old-metadata-schedule old-fieldvalues-schedule])
          (log/info
           (trs "{0} Database ''{1}'' sync/analyze schedules have changed!" (:engine database) (:name database))
           "\n"
           (trs "Sync metadata was: ''{0}'' is now: ''{1}''" old-metadata-schedule new-metadata-schedule)
           "\n"
           (trs "Cache FieldValues was: ''{0}'', is now: ''{1}''" old-fieldvalues-schedule new-fieldvalues-schedule))
          ;; reschedule the database. Make sure we're passing back the old schedule if one of the two wasn't supplied
          (schedule-tasks!
           (assoc database
             :metadata_sync_schedule      new-metadata-schedule
             :cache_field_values_schedule new-fieldvalues-schedule)))))))


(defn- perms-objects-set [database _]
  #{(perms/object-path (u/get-id database))})

(u/strict-extend (class Database)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:database :db])
          :types          (constantly {:details                     :encrypted-json
                                       :options                     :json
                                       :engine                      :keyword
                                       :metadata_sync_schedule      :cron-string
                                       :cache_field_values_schedule :cron-string})
          :properties     (constantly {:timestamped? true})
          :post-insert    post-insert
          :post-select    post-select
          :pre-update     pre-update
          :pre-delete     pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:perms-objects-set perms-objects-set
          :can-read?         (partial i/current-user-has-partial-permissions? :read)
          :can-write?        i/superuser?}))


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
      (db/select 'Field, :table_id [:in table-ids], :special_type (mdb/isa :type/PK)))))

(defn schema-exists?
  "Does `database` have any tables with `schema`?"
  ^Boolean [{:keys [id]}, schema]
  (db/exists? 'Table :db_id id, :schema (some-> schema name)))


;;; -------------------------------------------------- JSON Encoder --------------------------------------------------

(def ^:const protected-password
  "The string to replace passwords with when serializing Databases."
  "**MetabasePass**")

;; when encoding a Database as JSON remove the `details` for any non-admin User. For admin users they can still see
;; the `details` but remove the password. No one gets to see this in an API response!
(add-encoder
 DatabaseInstance
 (fn [db json-generator]
   (encode-map
    (cond
      (not (:is_superuser @*current-user*)) (dissoc db :details)
      (get-in db [:details :password])      (assoc-in db [:details :password] protected-password)
      (get-in db [:details :pass])          (assoc-in db [:details :pass] protected-password) ; MongoDB uses "pass" instead of password
      :else                                 db)
    json-generator)))
