(ns metabase.sync.sync-metadata.tables
  "Logic for updating Metabase Table models from metadata fetched from a physical DB."
  (:require [clojure
             [data :as data]
             [string :as str]]
            [clojure.tools.logging :as log]
            [metabase.models
             [humanization :as humanization]
             [table :as table :refer [Table]]]
            [metabase.sync
             [fetch-metadata :as fetch-metadata]
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
            [metabase.util :as u]
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
    #"^lobos_migrations$"})

(s/defn ^:private is-crufty-table? :- s/Bool
  "Should we give newly created TABLE a `visibility_type` of `:cruft`?"
  [table :- i/DatabaseMetadataTable]
  (boolean (some #(re-find % (str/lower-case (:name table))) crufty-table-patterns)))


;;; ---------------------------------------------------- Syncing -----------------------------------------------------

;; TODO - should we make this logic case-insensitive like it is for fields?

(s/defn ^:private create-or-reactivate-tables!
  "Create NEW-TABLES for database, or if they already exist, mark them as active."
  [database :- i/DatabaseInstance, new-tables :- #{i/DatabaseMetadataTable}]
  (log/info "Found new tables:"
            (for [table new-tables]
              (sync-util/name-for-logging (table/map->TableInstance table))))
  (doseq [{schema :schema, table-name :name, :as table} new-tables]
    (if-let [existing-id (db/select-one-id Table
                           :db_id  (u/get-id database)
                           :schema schema
                           :name   table-name
                           :active false)]
      ;; if the table already exists but is marked *inactive*, mark it as *active*
      (db/update! Table existing-id
        :active true)
      ;; otherwise create a new Table
      (db/insert! Table
        :db_id           (u/get-id database)
        :schema          schema
        :name            table-name
        :display_name    (humanization/name->human-readable-name table-name)
        :active          true
        :visibility_type (when (is-crufty-table? table)
                           :cruft)))))


(s/defn ^:private retire-tables!
  "Mark any OLD-TABLES belonging to DATABASE as inactive."
  [database :- i/DatabaseInstance, old-tables :- #{i/DatabaseMetadataTable}]
  (log/info "Marking tables as inactive:"
            (for [table old-tables]
              (sync-util/name-for-logging (table/map->TableInstance table))))
  (doseq [{schema :schema, table-name :name, :as table} old-tables]
    (db/update-where! Table {:db_id  (u/get-id database)
                             :schema schema
                             :active true}
      :active false)))


(s/defn ^:private update-table-description!
  "Update description for any CHANGED-TABLES belonging to DATABASE."
  [database :- i/DatabaseInstance, changed-tables :- #{i/DatabaseMetadataTable}]
  (log/info "Updating description for tables:"
            (for [table changed-tables]
              (sync-util/name-for-logging (table/map->TableInstance table))))
  (doseq [{schema :schema, table-name :name, description :description} changed-tables]
    (when-not (str/blank? description)
      (db/update-where! Table {:db_id       (u/get-id database)
                               :schema      schema
                               :name        table-name
                               :description nil}
                        :description description))))


(s/defn ^:private db-metadata :- #{i/DatabaseMetadataTable}
  "Return information about DATABASE by calling its driver's implementation of `describe-database`."
  [database :- i/DatabaseInstance]
  (set (for [table (:tables (fetch-metadata/db-metadata database))
             :when (not (metabase-metadata/is-metabase-metadata-table? table))]
         table)))

(s/defn ^:private our-metadata :- #{i/DatabaseMetadataTable}
  "Return information about what Tables we have for this DB in the Metabase application DB."
  [database :- i/DatabaseInstance]
  (set (map (partial into {})
            (db/select [Table :name :schema :description]
              :db_id  (u/get-id database)
              :active true))))

(s/defn sync-tables!
  "Sync the Tables recorded in the Metabase application database with the ones obtained by calling DATABASE's driver's
  implementation of `describe-database`."
  [database :- i/DatabaseInstance]
  ;; determine what's changed between what info we have and what's in the DB
  (let [db-metadata             (db-metadata database)
        our-metadata            (our-metadata database)
        strip-desc              (fn [metadata]
                                  (set (map #(dissoc % :description) metadata)))
        [new-tables old-tables] (data/diff
                                  (strip-desc db-metadata)
                                  (strip-desc our-metadata))
        [changed-tables]        (data/diff db-metadata our-metadata)]
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

    {:updated-tables (+ (count new-tables) (count old-tables))
     :total-tables   (count our-metadata)}))
