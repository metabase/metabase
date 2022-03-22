(ns metabase.sync.sync-metadata.tables
  "Logic for updating Metabase Table models from metadata fetched from a physical DB."
  (:require [clojure.data :as data]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.models.database :as db-model :refer [Database]]
            [metabase.models.humanization :as humanization]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.models.table :as table :refer [Table]]
            [metabase.sync.fetch-metadata :as fetch-metadata]
            [metabase.sync.interface :as i]
            [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
            [metabase.sync.util :as sync-util]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s]
            [toucan.db :as db]))

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
  [table :- i/DatabaseMetadataTable]
  (boolean (some #(re-find % (str/lower-case (:name table))) crufty-table-patterns)))


;;; ---------------------------------------------------- Syncing -----------------------------------------------------

(s/defn ^:private update-database-metadata!
  "If there is a version in the db-metadata update the DB to have that in the DB model"
  [database :- i/DatabaseInstance db-metadata :- i/DatabaseMetadata]
  (log/info (trs "Found new version for DB: {0}" (:version db-metadata)))
  (db/update! Database (u/the-id database)
              :details
              (assoc (:details database) :version (:version db-metadata))))

;; TODO - should we make this logic case-insensitive like it is for fields?

(s/defn ^:private create-or-reactivate-tables!
  "Create NEW-TABLES for database, or if they already exist, mark them as active."
  [database :- i/DatabaseInstance, new-tables :- #{i/DatabaseMetadataTable}]
  (log/info (trs "Found new tables:")
            (for [table new-tables]
              (sync-util/name-for-logging (table/map->TableInstance table))))
  (doseq [{schema :schema, table-name :name, :as table} new-tables]
    (if-let [existing-id (db/select-one-id Table
                           :db_id  (u/the-id database)
                           :schema schema
                           :name   table-name
                           :active false)]
      ;; if the table already exists but is marked *inactive*, mark it as *active*
      (db/update! Table existing-id
        :active true)
      ;; otherwise create a new Table
      (db/insert! Table
        :db_id           (u/the-id database)
        :schema          schema
        :name            table-name
        :display_name    (humanization/name->human-readable-name table-name)
        :active          true
        :visibility_type (when (is-crufty-table? table)
                           :cruft)))))


(s/defn ^:private retire-tables!
  "Mark any `old-tables` belonging to `database` as inactive."
  [database :- i/DatabaseInstance, old-tables :- #{i/DatabaseMetadataTable}]
  (log/info (trs "Marking tables as inactive:")
            (for [table old-tables]
              (sync-util/name-for-logging (table/map->TableInstance table))))
  (doseq [{schema :schema, table-name :name, :as _table} old-tables]
    (db/update-where! Table {:db_id  (u/the-id database)
                             :schema schema
                             :name   table-name
                             :active true}
      :active false)))


(s/defn ^:private update-table-description!
  "Update description for any `changed-tables` belonging to `database`."
  [database :- i/DatabaseInstance, changed-tables :- #{i/DatabaseMetadataTable}]
  (log/info (trs "Updating description for tables:")
            (for [table changed-tables]
              (sync-util/name-for-logging (table/map->TableInstance table))))
  (doseq [{schema :schema, table-name :name, description :description} changed-tables]
    (when-not (str/blank? description)
      (db/update-where! Table {:db_id       (u/the-id database)
                               :schema      schema
                               :name        table-name
                               :description nil}
                        :description description))))


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
            (db/select [Table :name :schema :description]
              :db_id  (u/the-id database)
              :active true))))

(s/defn sync-tables-and-database!
  "Sync the Tables recorded in the Metabase application database with the ones obtained by calling `database`'s driver's
  implementation of `describe-database`.
  Also syncs the database metadata taken from describe-database if there is any"
  [database :- i/DatabaseInstance]
  ;; determine what's changed between what info we have and what's in the DB
  (let [db-metadata             (fetch-metadata/db-metadata database)
        db-tables               (table-set db-metadata)
        our-metadata            (our-metadata database)
        strip-desc              (fn [metadata]
                                  (set (map #(dissoc % :description) metadata)))
        [new-tables old-tables] (data/diff
                                  (strip-desc db-tables)
                                  (strip-desc our-metadata))
        [changed-tables]        (data/diff db-tables our-metadata)]
    ;; update database metadata from database
    (when (some? (:version db-metadata))
      (sync-util/with-error-handling (format "Error creating/reactivating tables for %s"
                                             (sync-util/name-for-logging database))
        (update-database-metadata! database db-metadata)))
    ;; create new tables as needed or mark them as active again
    (when (seq new-tables)
      (sync-util/with-error-handling (format "Error creating/reactivating tables for %s"
                                             (sync-util/name-for-logging database))
        (create-or-reactivate-tables! database new-tables)))
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
        (doseq [{id :id} (group/non-admin-groups)]
          (perms/update-native-download-permissions! id (u/the-id database)))))

    {:updated-tables (+ (count new-tables) (count old-tables))
     :total-tables   (count our-metadata)}))
