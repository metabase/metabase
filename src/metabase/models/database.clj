(ns metabase.models.database
  (:require [cheshire.generate :refer [add-encoder encode-map]]
            [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.api.common :refer [*current-user*]]
            [metabase.models
             [interface :as i]
             [permissions :as perms]
             [permissions-group :as perm-group]]
            [toucan
             [db :as db]
             [models :as models]]))

;;; --------------------------------------------------- Constants ---------------------------------------------------

;; TODO - should this be renamed `saved-cards-virtual-id`?
(def ^Integer virtual-id
  "The ID used to signify that a database is 'virtual' rather than physical.

   A fake integer ID is used so as to minimize the number of changes that need to be made on the frontend -- by using
   something that would otherwise be a legal ID, *nothing* need change there, and the frontend can query against this
   'database' none the wiser. (This integer ID is negative which means it will never conflict with a *real* database
   ID.)

   This ID acts as a sort of flag. The relevant places in the middleware can check whether the DB we're querying is
   this 'virtual' database and take the appropriate actions."
  -1337)
;; To the reader: yes, this seems sort of hacky, but one of the goals of the Nested Query Initiative™ was to minimize
;; if not completely eliminate any changes to the frontend. After experimenting with several possible ways to do this
;; implementation seemed simplest and best met the goal. Luckily this is the only place this "magic number" is defined
;; and the entire frontend can remain blissfully unaware of its value.


;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Database :metabase_database)


(defn- schedule-tasks!
  "(Re)schedule sync operation tasks for DATABASE. (Existing scheduled tasks will be deleted first.)"
  [database]
  (try
    ;; this is done this way to avoid circular dependencies
    (require 'metabase.task.sync-databases)
    ((resolve 'metabase.task.sync-databases/schedule-tasks-for-db!) database)
    (catch Throwable e
      (log/error "Error scheduling tasks for DB:" (.getMessage e) "\n"
                 (u/pprint-to-str (u/filtered-stacktrace e))))))

(defn- unschedule-tasks!
  "Unschedule any currently pending sync operation tasks for DATABASE."
  [database]
  (try
    (require 'metabase.task.sync-databases)
    ((resolve 'metabase.task.sync-databases/unschedule-tasks-for-db!) database)
    (catch Throwable e
      (log/error "Error unscheduling tasks for DB:" (.getMessage e) "\n"
                 (u/pprint-to-str (u/filtered-stacktrace e))))))

(defn- post-insert [{database-id :id, :as database}]
  (u/prog1 database
    ;; add this database to the all users and metabot permissions groups
    (doseq [{group-id :id} [(perm-group/all-users)
                            (perm-group/metabot)]]
      (perms/grant-full-db-permissions! group-id database-id))
    ;; schedule the Database sync tasks
    (schedule-tasks! database)))

(defn- post-select [{:keys [engine] :as database}]
  (if-not engine database
          (assoc database :features (set (when-let [driver ((resolve 'metabase.driver/engine->driver) engine)]
                                           ((resolve 'metabase.driver/features) driver))))))

(defn- pre-delete [{id :id, :as database}]
  (unschedule-tasks! database)
  (db/delete! 'Card        :database_id id)
  (db/delete! 'Permissions :object      [:like (str (perms/object-path id) "%")])
  (db/delete! 'Table       :db_id       id))

;; TODO - this logic would make more sense in post-update if such a method existed
(defn- pre-update [{new-metadata-schedule :metadata_sync_schedule, new-fieldvalues-schedule :cache_field_values_schedule, :as database}]
  (u/prog1 database
    ;; if the sync operation schedules have changed, we need to reschedule this DB
    (when (or new-metadata-schedule new-fieldvalues-schedule)
      (let [{old-metadata-schedule    :metadata_sync_schedule
             old-fieldvalues-schedule :cache_field_values_schedule} (db/select-one [Database :metadata_sync_schedule :cache_field_values_schedule]
                                                                      :id (u/get-id database))
            ;; if one of the schedules wasn't passed continue using the old one
            new-metadata-schedule    (or new-metadata-schedule old-metadata-schedule)
            new-fieldvalues-schedule (or new-fieldvalues-schedule old-fieldvalues-schedule)]
        (when (or (not= new-metadata-schedule old-metadata-schedule)
                  (not= new-fieldvalues-schedule old-fieldvalues-schedule))
          (log/info "DB's schedules have changed!\n"
                    (format "Sync metadata was: '%s', is now: '%s'\n" old-metadata-schedule new-metadata-schedule)
                    (format "Cache FieldValues was: '%s', is now: '%s'\n" old-fieldvalues-schedule new-fieldvalues-schedule))
          ;; reschedule the database. Make sure we're passing back the old schedule if one of the two wasn't supplied
          (schedule-tasks! (assoc database
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
  "Return all the primary key `Fields` associated with this DATABASE."
  [{:keys [id]}]
  (let [table-ids (db/select-ids 'Table, :db_id id, :active true)]
    (when (seq table-ids)
      (db/select 'Field, :table_id [:in table-ids], :special_type (mdb/isa :type/PK)))))

(defn schema-exists?
  "Does DATABASE have any tables with SCHEMA?"
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
   (encode-map (cond
                 (not (:is_superuser @*current-user*)) (dissoc db :details)
                 (get-in db [:details :password])      (assoc-in db [:details :password] protected-password)
                 (get-in db [:details :pass])          (assoc-in db [:details :pass] protected-password) ; MongoDB uses "pass" instead of password
                 :else                                 db)
               json-generator)))
