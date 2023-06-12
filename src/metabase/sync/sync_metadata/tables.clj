(ns metabase.sync.sync-metadata.tables
  "Logic for updating Metabase Table models from metadata fetched from a physical DB."
  (:require
   [clojure.data :as data]
   [clojure.string :as str]
   [metabase.models.database :refer [Database]]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.table :refer [Table]]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [schema.core :as s]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ "Crufty" Tables -------------------------------------------------

;; Crufty tables are ones we know are from frameworks like Rails or Django and thus automatically mark as `:cruft`

(def ^:private crufty-table-patterns
  "Regular expressions that match Tables that should automatically given the `visibility-type` of `:cruft`.
   This means they are automatically hidden to users (but can be unhidden in the admin panel).
   These `Tables` are known to not contain useful data, such as migration or web framework internal tables."
  #{;; Django
    #"^auth_group$"
    #"^auth_group_permissions$"
    #"^auth_permission$"
    #"^django_admin_log$"
    #"^django_content_type$"
    #"^django_migrations$"
    #"^django_session$"
    #"^django_site$"
    #"^south_migrationhistory$"
    #"^user_groups$"
    #"^user_user_permissions$"
    ;; Drupal
    #".*_cache$"
    #".*_revision$"
    #"^advagg_.*"
    #"^apachesolr_.*"
    #"^authmap$"
    #"^autoload_registry.*"
    #"^batch$"
    #"^blocked_ips$"
    #"^cache.*"
    #"^captcha_.*"
    #"^config$"
    #"^field_revision_.*"
    #"^flood$"
    #"^node_revision.*"
    #"^queue$"
    #"^rate_bot_.*"
    #"^registry.*"
    #"^router.*"
    #"^semaphore$"
    #"^sequences$"
    #"^sessions$"
    #"^watchdog$"
    ;; Rails / Active Record
    #"^schema_migrations$"
    #"^ar_internal_metadata$"
    ;; PostGIS
    #"^spatial_ref_sys$"
    ;; nginx
    #"^nginx_access_log$"
    ;; Liquibase
    #"^databasechangelog$"
    #"^databasechangeloglock$"
    ;; Lobos
    #"^lobos_migrations$"
    ;; MSSQL
    #"^syncobj_0x.*"})

(s/defn ^:private is-crufty-table? :- s/Bool
  "Should we give newly created TABLE a `visibility_type` of `:cruft`?"
  [table]
  (boolean (some #(re-find % (u/lower-case-en (:name table))) crufty-table-patterns)))


;;; ---------------------------------------------------- Syncing -----------------------------------------------------

(s/defn ^:private update-database-metadata!
  "If there is a version in the db-metadata update the DB to have that in the DB model"
  [database :- i/DatabaseInstance db-metadata :- i/DatabaseMetadata]
  (log/info (trs "Found new version for DB: {0}" (:version db-metadata)))
  (t2/update! Database (u/the-id database)
              {:details
               (assoc (:details database) :version (:version db-metadata))}))

(defn create-table!
  "Create a single new table in the database with the given columns."
  [database
   {schema     :schema
    table-name :name
    active     :active
    :as        table
    :or        {active true}}]
  (let [is-crufty? (is-crufty-table? table)]
    (first (t2/insert-returning-instances! Table
                                           :db_id (u/the-id database)
                                           :schema schema
                                           :name table-name
                                           :display_name (humanization/name->human-readable-name table-name)
                                           :active active
                                           :visibility_type (when is-crufty? :cruft)
                                           ;; if this is a crufty table, mark initial sync as complete since we'll skip the subsequent sync steps
                                           :initial_sync_status (if is-crufty? "complete" "incomplete")))))

;; TODO - should we make this logic case-insensitive like it is for fields?

(s/defn ^:private create-tables-as-inactive!
  "Create NEW-TABLES for database. Tables have active=false."
  [database :- i/DatabaseInstance, new-tables :- #{i/DatabaseMetadataTable}]
  (log/info (trs "Found new tables:")
            (for [table new-tables]
              (sync-util/name-for-logging (mi/instance Table table))))
  (doseq [table new-tables]
    (create-table! database (assoc table :active false))))

(s/defn ^:private retire-tables!
  "Mark any `old-tables` belonging to `database` as inactive."
  [database :- i/DatabaseInstance, old-tables :- #{i/DatabaseMetadataTable}]
  (log/info (trs "Marking tables as inactive:")
            (for [table old-tables]
              (sync-util/name-for-logging (mi/instance Table table))))
  (doseq [{schema :schema, table-name :name, :as _table} old-tables]
    (t2/update! Table {:db_id  (u/the-id database)
                       :schema schema
                       :name   table-name
                       :active true}
                {:active false})))


(s/defn ^:private update-table-description!
  "Update description for any `changed-tables` belonging to `database`."
  [database :- i/DatabaseInstance, changed-tables :- #{i/DatabaseMetadataTable}]
  (log/info (trs "Updating description for tables:")
            (for [table changed-tables]
              (sync-util/name-for-logging (mi/instance Table table))))
  (doseq [{schema :schema, table-name :name, description :description} changed-tables]
    (when-not (str/blank? description)
      (t2/update! Table {:db_id       (u/the-id database)
                         :schema      schema
                         :name        table-name
                         :description nil}
                  {:description description}))))


(s/defn ^:private table-set :- #{i/DatabaseMetadataTable}
  "So there exist tables for the user and metabase metadata tables for internal usage by metabase.
  Get set of user tables only, excluding metabase metadata tables."
  [db-metadata :- i/DatabaseMetadata]
  (set (for [table (:tables db-metadata)
             :when (not (metabase-metadata/is-metabase-metadata-table? table))]
         table)))

(s/defn ^:private our-metadata :- #{i/DatabaseMetadataTable}
  "Return information about what Tables we have for this DB in the Metabase application DB."
  [database :- i/DatabaseInstance]
  (set (map (partial into {})
            (t2/select [Table :name :schema :description]
              :db_id  (u/the-id database)
              :active true))))

(s/defn sync-tables-and-database!
  "Sync the Tables recorded in the Metabase application database with the ones obtained by calling `database`'s driver's
  implementation of `describe-database`.
  Also syncs the database metadata taken from describe-database if there is any"
  ([database :- i/DatabaseInstance] (sync-tables-and-database! database (fetch-metadata/db-metadata database)))
  ([database :- i/DatabaseInstance db-metadata]
   ;; determine what's changed between what info we have and what's in the DB
   (let [db-tables               (table-set db-metadata)
         our-metadata            (our-metadata database) ;; now includes active=true
         inactive-tables         (set (map (partial into {})
                                           (t2/select [Table :name :schema]
                                                      :db_id  (u/the-id database)
                                                      :active false)))
         strip-desc              (fn [metadata]
                                   (set (map #(dissoc % :description) metadata)))
         [new-tables old-tables] (data/diff
                                  (strip-desc db-tables)
                                  (strip-desc our-metadata))
         to-create-tables        (remove (fn [new-table]
                                           (contains? inactive-tables (select-keys new-table [:name :schema])))
                                         new-tables)
         [changed-tables]        (data/diff db-tables our-metadata)]
     ;; update database metadata from database
     (when (some? (:version db-metadata))
       (sync-util/with-error-handling (format "Error updating database metadata for %s"
                                              (sync-util/name-for-logging database))
         (update-database-metadata! database db-metadata)))
     ;; create new tables as needed
     (when (seq to-create-tables)
       (sync-util/with-error-handling (format "Error creating tables for %s"
                                              (sync-util/name-for-logging database))
         (create-tables-as-inactive! database to-create-tables)))
     ;; mark old tables as inactive
     (when (seq old-tables)
       (sync-util/with-error-handling (format "Error retiring tables for %s" (sync-util/name-for-logging database))
         (retire-tables! database old-tables)))

     ;; update description for changed tables
     (when (seq changed-tables)
       (sync-util/with-error-handling (format "Error updating table description for %s" (sync-util/name-for-logging database))
         (update-table-description! database changed-tables)))

     ;; update native download perms for all groups if any tables were added or removed
     (when (or (seq new-tables) (seq old-tables))
       (sync-util/with-error-handling (format "Error updating native download perms for %s" (sync-util/name-for-logging database))
         (doseq [{id :id} (perms-group/non-admin-groups)]
           (perms/update-native-download-permissions! id (u/the-id database)))))

     {:updated-tables (+ (count to-create-tables) (count old-tables))
      :total-tables   (count our-metadata)})))

(defn- activate-table! [database new-table]
  (when-let [existing-id (t2/select-one-pk Table
                                           :db_id (u/the-id database)
                                           :schema (:schema new-table)
                                           :name (:name new-table)
                                           :active false)]
    (t2/update! Table existing-id {:active true})))

(defn activate-new-tables!
  "Activate any tables that were newly created or previously inactive but are now present in the db-metadata."
  [database db-metadata]
  (let [db-tables    (table-set db-metadata)
        our-metadata (our-metadata database)
        [new-tables] (data/diff db-tables our-metadata)]
    (when (seq new-tables)
      (sync-util/with-error-handling (format "Error reactivating tables for %s"
                                             (sync-util/name-for-logging database))
        (doseq [table new-tables]
          (activate-table! database table))))
    {:updated-tables new-tables}))
