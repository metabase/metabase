(ns metabase.sync.sync-metadata.tables
  "Logic for updating Metabase Table models from metadata fetched from a physical DB."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.database :refer [Database]]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.models.table :refer [Table]]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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

(mu/defn ^:private is-crufty-table?
  "Should we give newly created TABLE a `visibility_type` of `:cruft`?"
  [table-name]
  (some #(re-find % (u/lower-case-en table-name)) crufty-table-patterns))


;;; ---------------------------------------------------- Syncing -----------------------------------------------------

(mu/defn ^:private update-database-metadata!
  "If there is a version in the db-metadata update the DB to have that in the DB model"
  [database    :- i/DatabaseInstance
   db-metadata :- i/DatabaseMetadata]
  (log/infof "Found new version for DB: %s" (:version db-metadata))
  (t2/update! Database (u/the-id database)
              {:details
               (assoc (:details database) :version (:version db-metadata))}))

(defn- cruft-dependent-columns [table-name]
  ;; if this is a crufty table, mark initial sync as complete since we'll skip the subsequent sync steps
  (let [is-crufty? (is-crufty-table? table-name)]
    {:initial_sync_status (if is-crufty? "complete" "incomplete")
     :visibility_type     (when is-crufty? :cruft)}))

(defn create-table!
  "Creates a new table in the database, ready to be synced.
   Throws an exception if there is already a table with the same name, schema and database ID."
  [database table]
  (t2/insert-returning-instance!
   Table
   (merge (cruft-dependent-columns (:name table))
          {:active                  true
           :db_id                   (:id database)
           :schema                  (:schema table)
           :description             (:description table)
           :database_require_filter (:database_require_filter table)
           :display_name            (or (:display_name table) (humanization/name->human-readable-name (:name table)))
           :name                    (:name table)})))

(defn create-or-reactivate-table!
  "Create a single new table in the database, or mark it as active if it already exists."
  [database {schema :schema table-name :name :as table}]
  (if-let [existing-id (t2/select-one-pk Table
                                         :db_id (u/the-id database)
                                         :schema schema
                                         :name table-name
                                         :active false)]
    ;; if the table already exists but is marked *inactive*, mark it as *active*
    (t2/update! Table existing-id (assoc (cruft-dependent-columns (:name table)) :active true))
    ;; otherwise create a new Table
    (create-table! database table)))

;; TODO - should we make this logic case-insensitive like it is for fields?

(mu/defn ^:private create-or-reactivate-tables!
  "Create `new-tables` for database, or if they already exist, mark them as active."
  [database :- i/DatabaseInstance
   new-tables :- [:set i/DatabaseMetadataTable]]
  (doseq [table new-tables]
    (log/info "Found new table:"
              (sync-util/name-for-logging (mi/instance Table table))))
  (doseq [table new-tables]
    (create-or-reactivate-table! database table)))

(mu/defn ^:private retire-tables!
  "Mark any `old-tables` belonging to `database` as inactive."
  [database   :- i/DatabaseInstance
   old-tables :- [:set [:map
                        [:name ::lib.schema.common/non-blank-string]
                        [:schema [:maybe ::lib.schema.common/non-blank-string]]]]]
  (log/info "Marking tables as inactive:"
            (for [table old-tables]
              (sync-util/name-for-logging (mi/instance Table table))))
  (doseq [{schema :schema table-name :name :as _table} old-tables]
    (t2/update! Table {:db_id  (u/the-id database)
                       :schema schema
                       :name   table-name
                       :active true}
                {:active false})))

(mu/defn ^:private update-table-metadata-if-needed!
  "Update the table metadata if it has changed."
  [table-metadata :- i/DatabaseMetadataTable
   metabase-table :- (ms/InstanceOf :model/Table)]
  (log/infof "Updating table metadata for %s" (sync-util/name-for-logging metabase-table))
  (let [to-update-keys [:description :database_require_filter :estimated_row_count]
        old-table      (select-keys metabase-table to-update-keys)
        new-table      (select-keys (merge
                                     (zipmap to-update-keys (repeat nil))
                                     table-metadata)
                                    to-update-keys)
        [_ changes _]  (data/diff old-table new-table)
        changes        (cond-> changes
                         ;; we only update the description if the initial state is nil
                         ;; because don't want to override the user edited description if it exists
                         (some? (:description old-table))
                         (dissoc changes :description))]
    (doseq [[k v] changes]
      (log/infof "%s of %s changed from %s to %s"
                 k
                 (sync-util/name-for-logging metabase-table)
                 (get metabase-table k)
                 v))
    (when (seq changes)
      (t2/update! :model/Table (:id metabase-table) changes))))

(mu/defn ^:private update-tables-metadata-if-needed!
  [table-metadatas :- [:set i/DatabaseMetadataTable]
   metabase-tables :- [:set (ms/InstanceOf :model/Table)]]
  (let [name+schema->table-metadata (m/index-by (juxt :name :schema) table-metadatas)
        name+schema->metabase-table (m/index-by (juxt :name :schema) metabase-tables)]
    (doseq [name+schema (set/intersection (set (keys name+schema->table-metadata)) (set (keys name+schema->metabase-table)))]
      (update-table-metadata-if-needed! (name+schema->table-metadata name+schema) (name+schema->metabase-table name+schema)))))

(mu/defn ^:private table-set :- [:set i/DatabaseMetadataTable]
  "So there exist tables for the user and metabase metadata tables for internal usage by metabase.
  Get set of user tables only, excluding metabase metadata tables."
  [db-metadata :- i/DatabaseMetadata]
  (into #{}
        (remove metabase-metadata/is-metabase-metadata-table?)
        (:tables db-metadata)))

(mu/defn ^:private db->our-metadata :- [:set (ms/InstanceOf :model/Table)]
  "Return information about what Tables we have for this DB in the Metabase application DB."
  [database :- i/DatabaseInstance]
  (set (t2/select [:model/Table :id :name :schema :description :database_require_filter :estimated_row_count]
                  :db_id  (u/the-id database)
                  :active true)))

(mu/defn sync-tables-and-database!
  "Sync the Tables recorded in the Metabase application database with the ones obtained by calling `database`'s driver's
  implementation of `describe-database`.
  Also syncs the database metadata taken from describe-database if there is any"
  ([database :- i/DatabaseInstance]
   (sync-tables-and-database! database (fetch-metadata/db-metadata database)))

  ([database :- i/DatabaseInstance db-metadata]
   ;; determine what's changed between what info we have and what's in the DB
   (let [db-tables               (table-set db-metadata)
         name+schema             #(select-keys % [:name :schema])
         name+schema->db-table   (m/index-by name+schema db-tables)
         our-metadata            (db->our-metadata database)
         keep-name+schema-set    (fn [metadata]
                                   (set (map name+schema metadata)))
         [new-tables old-tables] (data/diff
                                  (keep-name+schema-set (set (map name+schema db-tables)))
                                  (keep-name+schema-set (set (map name+schema our-metadata))))]
     ;; update database metadata from database
     (when (some? (:version db-metadata))
       (sync-util/with-error-handling (format "Error creating/reactivating tables for %s"
                                              (sync-util/name-for-logging database))
         (update-database-metadata! database db-metadata)))
     ;; create new tables as needed or mark them as active again
     (when (seq new-tables)
       (let [new-tables-info (set (map #(get name+schema->db-table (name+schema %)) new-tables))]
         (sync-util/with-error-handling (format "Error creating/reactivating tables for %s"
                                                (sync-util/name-for-logging database))
           (create-or-reactivate-tables! database new-tables-info))))
     ;; mark old tables as inactive
     (when (seq old-tables)
       (sync-util/with-error-handling (format "Error retiring tables for %s" (sync-util/name-for-logging database))
         (retire-tables! database old-tables)))

     (sync-util/with-error-handling (format "Error updating table metadata for %s" (sync-util/name-for-logging database))
       ;; we need to fetch the tables again because we might have retired tables in the previous steps
       (update-tables-metadata-if-needed! db-tables (db->our-metadata database)))

     {:updated-tables (+ (count new-tables) (count old-tables))
      :total-tables   (count our-metadata)})))
