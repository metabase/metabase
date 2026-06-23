(ns metabase.sync.sync-metadata.tables
  "Logic for updating Metabase Table models from metadata fetched from a physical DB."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.crufty :as crufty]
   [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.workspaces.table-remapping :as ws.table-remapping]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

;;; ---------------------------------------------------- Syncing -----------------------------------------------------

(mu/defn- update-database-metadata!
  "If there is a version in the db-metadata update the DB to have that in the DB model"
  [database    :- i/DatabaseInstance
   db-metadata :- i/DatabaseMetadata]
  (log/infof "Found new version for DB: %s" (:version db-metadata))
  (t2/update! :model/Database (u/the-id database)
              {:details
               (assoc (:details database) :version (:version db-metadata))}))

(mu/defn- cruft-dependent-cols [{table-name :name :as table}
                                database
                                sync-stage :- [:enum ::reactivate ::create ::update]]
  (let [is-crufty? (if (and (= sync-stage ::update)
                            (not (:is_attached_dwh database)))
                     ;; TODO: we should add an updated_by column to metabase_table in
                     ;; [[metabase.warehouse-schema-rest.api.table/update-table!*]] to track occasions where the table
                     ;; was updated by an admin, and respect their choices during an update.
                     ;;
                     ;; This will fix the issue where a table is marked as visible, but cruftiness settings keep re-hiding it
                     ;; during update steps. This is also how we handled this before the addition of auto-cruft-tables.
                     ;;
                     ;; Setting it false will be a no-op because we never unhide tables that are already visible via cruft settings.
                     ;;
                     ;; More context: https://metaboat.slack.com/archives/C013N8XL286/p1743707103874849
                     false
                     (crufty/name? table-name (into crufty-table-patterns
                                                    (some-> database :settings :auto-cruft-tables))))]
    {:initial_sync_status (cond
                            ;; if we're updating a table, we don't overwrite the initial sync status, so that it remain
                            ;; "complete" during the sync. See:
                            ;; [[metabase.sync.util-test/initial-sync-status-table-only-test]]
                            (= sync-stage ::update) (:initial_sync_status table)
                            is-crufty?              "complete"
                            :else                   "incomplete")
     :visibility_type     (when is-crufty? :cruft)}))

(defn create-table!
  "Creates a new table in the database, ready to be synced.
   Throws an exception if there is already a table with the same name, schema and database ID."
  [database table]
  (t2/insert-returning-instance!
   :model/Table
   (merge (cruft-dependent-cols table database ::create)
          {:active                  true
           :db_id                   (:id database)
           :schema                  (:schema table)
           :description             (:description table)
           :database_require_filter (:database_require_filter table)
           :display_name            (or (:display_name table)
                                        (humanization/name->human-readable-name (:name table)))
           :name                    (:name table)
           :is_writable             (:is_writable table)}
          (when (:data_source table)
            {:data_source (:data_source table)})
          (when (:data_authority table)
            {:data_authority (:data_authority table)})
          (when (:is_sample database)
            {:data_authority :ingested
             :data_source    :ingested}))))

(defn create-or-reactivate-table!
  "Create a single new table in the database, or mark it as active if it already exists."
  [database {schema :schema table-name :name :as table}]
  (if-let [existing-id (t2/select-one-pk :model/Table
                                         :db_id (u/the-id database)
                                         :schema schema
                                         :name table-name
                                         :active false)]
    (let [table (t2/select-one :model/Table existing-id)]
      ;; if the table already exists but is marked *inactive*, mark it as *active*
      (t2/update! :model/Table existing-id (cond-> (cruft-dependent-cols table database ::reactivate)

                                             ;; do not unhide tables w/ cruft settings
                                             (some? (:visibility_type table))
                                             (dissoc :visibility_type)

                                             true
                                             (assoc :active true)

                                             (:is_sample database)
                                             (assoc :data_authority :ingested
                                                    :data_source    :ingested))))
    ;; otherwise create a new Table
    (create-table! database table)))

;; TODO - should we make this logic case-insensitive like it is for fields?

(def ^:private table-name-max-length
  "Maximum length of the `metabase_table.name` column in the application DB (a `varchar(256)`). Tables whose name is
  longer than this can't be stored.

  As with Fields, an alternative would be to widen the column, but `name` is part of the `idx_unique_table` unique
  constraint whose key also includes the `varchar(254)` schema helper, so on MySQL/InnoDB there's only room to grow
  `name` to roughly `varchar(512)` — still short of e.g. BigQuery's 1024-character table names. Truncating is not an
  option either: `name` is the real warehouse table name used to generate SQL."
  256)

(def ^:private table-schema-max-length
  "Maximum length of the `metabase_table.schema` column in the application DB (a `varchar(254)`). Tables in a
  schema/dataset whose name is longer than this can't be stored — BigQuery dataset names, for instance, can be up to
  1024 characters."
  254)

(defn- table-name-or-schema-too-long?
  "Whether `table`'s name or schema is too long to store in the application DB (see `table-name-max-length` /
  `table-schema-max-length`)."
  [{table-name :name, table-schema :schema}]
  (or (< table-name-max-length (count table-name))
      (< table-schema-max-length (count (or table-schema "")))))

(mu/defn- remove-tables-with-too-long-names :- [:set i/DatabaseMetadataTable]
  "Drop any tables in `db-metadata-tables` whose name or schema is too long to store in the application DB (see
  `table-name-max-length` / `table-schema-max-length`), logging a warning. A single over-long table name or schema
  would otherwise abort creation of all remaining new tables for the database."
  [database           :- i/DatabaseInstance
   db-metadata-tables :- [:set i/DatabaseMetadataTable]]
  (let [{too-long true, ok false} (group-by table-name-or-schema-too-long? db-metadata-tables)]
    (when (seq too-long)
      (log/warnf "Skipping %d Table(s) in %s whose name or schema is too long to store: %s"
                 (count too-long)
                 (sync-util/name-for-logging database)
                 (pr-str (sort (map (fn [{:keys [schema name]}] (str schema "." name)) too-long)))))
    (set ok)))

(mu/defn- create-or-reactivate-tables!
  "Create `new-tables` for database, or if they already exist, mark them as active."
  [database :- i/DatabaseInstance
   new-table-metadatas :- [:set i/DatabaseMetadataTable]]
  (doseq [table-metadata new-table-metadatas]
    (log/info "Found new table:"
              (sync-util/name-for-logging (mi/instance :model/Table table-metadata))))
  (doseq [table-metadata (sort-by (juxt :schema :name) new-table-metadatas)]
    (create-or-reactivate-table! database table-metadata)))

(mu/defn- retire-tables!
  "Mark any `old-tables` belonging to `database` as inactive."
  [database   :- i/DatabaseInstance
   old-tables :- [:set [:map
                        [:name ::lib.schema.common/non-blank-string]
                        [:schema [:maybe ::lib.schema.common/non-blank-string]]]]]
  (log/info "Marking tables as inactive:"
            (for [table old-tables]
              (sync-util/name-for-logging (mi/instance :model/Table table))))
  (doseq [{schema :schema table-name :name :as _table} old-tables]
    (t2/update! :model/Table {:db_id  (u/the-id database)
                              :schema schema
                              :name   table-name
                              :active true}
                {:active false})))

(def ^:private keys-to-update
  [:description :database_require_filter :estimated_row_count :visibility_type :initial_sync_status :is_writable])

(mu/defn- update-table-metadata-if-needed!
  "Update the table metadata if it has changed. Returns true if a row was updated."
  [table-metadata :- i/DatabaseMetadataTable
   metabase-table :- (ms/InstanceOf :model/Table)
   metabase-database :- (ms/InstanceOf :model/Database)]
  (let [old-table               (select-keys metabase-table keys-to-update)
        new-table               (-> (zipmap keys-to-update (repeat nil))
                                    (merge table-metadata
                                           (cruft-dependent-cols metabase-table metabase-database
                                                                 ::update))
                                    (select-keys keys-to-update))
        [_ changes _]           (data/diff old-table new-table)
        changes                 (cond-> changes
                                  ;; we only update the description if the initial state is nil
                                  ;; because don't want to override the user edited description if it exists:
                                  (some? (:description old-table))
                                  (dissoc changes :description)

                                  (or
                                   ;; don't unhide tables that were hidden w/ cruft settings
                                   (some? (:visibility_type old-table))
                                   ;; noop
                                   (= (:visibility_type new-table) (:visibility_type old-table)))
                                  (dissoc changes :visibility_type)

                                  ;; don't mark computed tables as writable — they are derived
                                  ;; and should never be editable, regardless of what the driver reports
                                  (= :computed (:data_authority metabase-table))
                                  (dissoc changes :is_writable))]
    (doseq [[k v] changes]
      (log/infof "%s of %s changed from %s to %s"
                 k
                 (sync-util/name-for-logging metabase-table)
                 (get metabase-table k)
                 v))
    (boolean
     (when (seq changes)
       (t2/update! :model/Table (:id metabase-table) changes)
       true))))

(mu/defn- update-tables-metadata-if-needed! :- :int
  "Update metadata for the tables present in both `table-metadatas` and `metabase-tables`. Returns
  the number of tables actually updated."
  [table-metadatas :- [:set i/DatabaseMetadataTable]
   metabase-tables :- [:set (ms/InstanceOf :model/Table)]
   metabase-database :- (ms/InstanceOf :model/Database)]
  (let [name+schema->table-metadata (m/index-by (juxt :name :schema) table-metadatas)
        name+schema->metabase-table (m/index-by (juxt :name :schema) metabase-tables)]
    (reduce (fn [updated name+schema]
              (cond-> updated
                (update-table-metadata-if-needed! (name+schema->table-metadata name+schema)
                                                  (name+schema->metabase-table name+schema)
                                                  metabase-database)
                inc))
            0
            (set/intersection (set (keys name+schema->table-metadata))
                              (set (keys name+schema->metabase-table))))))

(def ^:private table-sync-batch-size
  "How many warehouse tables to reconcile against the app DB at a time. Bounds peak memory so a
  database with tens of thousands of tables doesn't have to be diffed all at once."
  1000)

(defn- ignore-table?
  "Tables we never create `:model/Table` rows for: the special `_metabase_metadata` table (its
  contents are applied to other Tables/Fields instead) and temporary transform output tables."
  [table]
  (or (metabase-metadata/is-metabase-metadata-table? table)
      (sync-util/is-temp-transform-table? table)))

(defn- table-name+schema
  "The `{:name :schema}` identity a Table is keyed on during sync."
  [table]
  (select-keys table [:name :schema]))

(mu/defn- table-set :- [:set i/DatabaseMetadataTable]
  "So there exist tables for the user and metabase metadata tables for internal usage by metabase.
  Get set of user tables only, excluding metabase metadata tables."
  [db-metadata :- i/DatabaseMetadata]
  (into #{} (remove ignore-table?) (:tables db-metadata)))

(mu/defn- select-tables :- [:set (ms/InstanceOf :model/Table)]
  "Selects the columns we need for `:model/Table`, with some optional filters"
  [database :- i/DatabaseInstance
   & filters]
  (set (apply
        t2/select
        (into [:model/Table :id :name :schema :data_authority] keys-to-update)
        :db_id (u/the-id database)
        filters)))

(mu/defn- db->our-tables :- [:set (ms/InstanceOf :model/Table)]
  "Return *all* tables we have for this DB in the Metabase appDB, including inactive ones."
  [database :- i/DatabaseInstance]
  (select-tables database))

(mu/defn- existing-tables-by-name+schema :- :map
  "The `:model/Table` rows (active *and* inactive) for `database` matching any name in `tables`,
  indexed by `{:name :schema}`. Queries by name only -- not schema -- since `:schema` can be `nil`
  and `IN (NULL, ...)` wouldn't match; the exact `(name, schema)` match falls out of the index key."
  [database :- i/DatabaseInstance
   tables]
  (let [names (into [] (comp (map :name) (distinct)) tables)]
    (if (seq names)
      (t2/select-fn->fn table-name+schema identity
                        (into [:model/Table :id :name :schema :data_authority :active] keys-to-update)
                        :db_id (u/the-id database)
                        :name [:in names])
      {})))

(mu/defn- adjusted-schemas :- [:maybe [:map-of :string :string]]
  "Returns a map of schemas that should be adjusted to their new names."
  [driver
   database
   our-tables :- [:set (ms/InstanceOf :model/Table)]]
  (reduce
   (fn [accum schema]
     (let [new-schema (driver/adjust-schema-qualification driver database schema)]
       (cond-> accum
         (not= schema new-schema) (assoc schema new-schema))))
   nil
   (into #{} (map :schema our-tables))))

(defn- adjust-table-schemas!
  [database schemas-to-update]
  (when schemas-to-update
    (log/infof "Renaming schemas: %s" (pr-str schemas-to-update)))
  (doseq [[schema new-schema] schemas-to-update]
    (t2/update! :model/Table
                :db_id (:id database)
                :schema schema
                {:schema new-schema})))

(def ^:private
  ^{:doc "threshold after which deactivated tables will be archived"}
  archive-tables-threshold [-14 :day])

(defn- archive-tables!
  "Mark tables that have been deactivated for longer than the configured threshold as archived
  and suffixes their names. Skips tables with `transform_target = true` (provisional transform
  output entries) since transforms still reference them by their original name."
  [database]
  (let [;; we use UTC offset time for suffix, may not match db time but
        ;; it doesn't matter much, the source of time truth is `archived_at`,
        ;; we're just using this as a cheap namespace
        suffix (str "__mbarchiv__" (.toEpochSecond (t/offset-date-time)))
        threshold-expr (apply
                        (requiring-resolve 'metabase.util.honey-sql-2/add-interval-honeysql-form)
                        (mdb/db-type) :%now archive-tables-threshold)
        tables-to-archive (t2/select :model/Table
                                     :db_id (u/the-id database)
                                     :active false
                                     :archived_at nil
                                     :transform_target false
                                     :deactivated_at [:< threshold-expr])
        archived (atom 0)]
    (doseq [table tables-to-archive
            :let [new-name (str (:name table) suffix)]]
      (if (> (count new-name) 256)
        (log/warnf "Cannot archive table %s, name too long" (:name table))
        (do
          (log/infof "Archiving table %s (deactivated at %s, new-name %s)"
                     (sync-util/name-for-logging table)
                     (:deactivated_at table)
                     new-name)
          (let [[did-update err]
                (try
                  ;; in the extremely unlikely case that there already exists a table with our
                  ;; archived name, we let it fail from hitting the unique constraints violation
                  ;; and just report the failure
                  [(t2/update! :model/Table
                               {:id (:id table)
                                :active false}
                               {:archived_at (mi/now)
                                :name new-name})]
                  (catch Throwable t
                    [0 t]))]
            (when (zero? did-update)
              (if err
                (log/errorf err "Failed archiving table %s" (sync-util/name-for-logging table))
                (log/warnf "Did not archive table %s" (sync-util/name-for-logging table))))
            (swap! archived + did-update)))))
    @archived))

(mu/defn- sync-table-batch! :- [:map [:created :int] [:updated :int]]
  "Reconcile one batch of warehouse tables against the app DB and return `{:created <n> :updated <n>}`.
  Creates or reactivates tables in `batch` that aren't active yet (counted as `:created`) and updates
  metadata on the ones already active (counted as `:updated`).

  First narrows the batch: drops tables we never sync, collapses duplicate `(name, schema)`, drops
  names too long for the app DB, and drops workspace-isolated tables (they back canonical Tables via
  remap, so they get no `:model/Table` of their own)."
  [database :- i/DatabaseInstance
   batch]
  (let [tables   (as-> batch <>
                   (into #{} (comp (remove ignore-table?) (m/distinct-by table-name+schema)) <>)
                   (remove-tables-with-too-long-names database <>)
                   (ws.table-remapping/filter-workspace-side-tables <> (u/the-id database)))
        existing (existing-tables-by-name+schema database tables)
        active?  (fn [table] (:active (get existing (table-name+schema table))))
        new      (into #{} (remove active?) tables)
        live     (into #{} (filter active?) tables)
        reactivated (into #{} (filter #(get existing (table-name+schema %))) new)]
    (when (seq new)
      (create-or-reactivate-tables! database new))
    (when (seq reactivated)
      (let [rows (existing-tables-by-name+schema database reactivated)]
        (update-tables-metadata-if-needed! reactivated
                                           (into #{} (keep #(get rows (table-name+schema %))) reactivated)
                                           database)))
    {:created (count new)
     :updated (if (seq live)
                (update-tables-metadata-if-needed! live
                                                   (into #{} (keep #(get existing (table-name+schema %))) live)
                                                   database)
                0)}))

(mu/defn- retire-unseen-tables! :- :int
  "Retire active app-DB tables that no longer exist on the warehouse. Builds the set of
  `{:name :schema}` the warehouse reported this sync (plus synthetic canonical tuples for workspace
  remaps), then retires the active app-DB tables that aren't in it, in batches. Returns the number
  retired."
  [database :- i/DatabaseInstance
   db-metadata]
  (let [seen      (into #{}
                        (map table-name+schema)
                        (concat (:tables db-metadata)
                                (ws.table-remapping/inject-workspace-canonical-tuples #{} (u/the-id database))))
        active    (t2/select-fn-set table-name+schema [:model/Table :name :schema]
                                    :db_id (u/the-id database) :active true)
        to-retire (set/difference active seen)]
    (doseq [batch (partition-all table-sync-batch-size to-retire)]
      (retire-tables! database (set batch)))
    (count to-retire)))

(mu/defn sync-tables-and-database!
  "Sync the `:model/Table` rows for `database` against its driver's `describe-database`, and the DB
  metadata (e.g. version) if present.

  Reconciles the warehouse tables against the app DB one batch at a time (see [[table-sync-batch-size]]),
  then retires the active app-DB tables the warehouse no longer reports -- so a database with tens of
  thousands of tables never has to be held or `clojure.data/diff`ed all at once. Returns
  `{:updated-tables <n> :total-tables <n>}`."
  ([database :- i/DatabaseInstance]
   (sync-tables-and-database! database (fetch-metadata/db-metadata database)))

  ([database :- i/DatabaseInstance db-metadata]
   (let [driver               (driver.u/database->driver database)
         multi-level-support? (driver.u/supports? driver :multi-level-schema database)
         schemas-to-update    (when multi-level-support?
                                (adjusted-schemas driver database (db->our-tables database)))]
     (sync-util/with-error-handling (format "Error updating table schemas for %s"
                                            (sync-util/name-for-logging database))
       (adjust-table-schemas! database schemas-to-update))
     (when (some? (:version db-metadata))
       (sync-util/with-error-handling (format "Error updating database metadata for %s"
                                              (sync-util/name-for-logging database))
         (update-database-metadata! database db-metadata)))
     (let [batches  (concat (partition-all table-sync-batch-size (:tables db-metadata))
                            [(ws.table-remapping/inject-workspace-canonical-tuples #{} (u/the-id database))])
           {:keys [created updated]}
           (or (sync-util/with-error-handling (format "Error creating/reactivating tables for %s"
                                                      (sync-util/name-for-logging database))
                 (reduce (fn [counts batch]
                           (merge-with + counts (sync-table-batch! database batch)))
                         {:created 0, :updated 0}
                         batches))
               {:created 0, :updated 0})
           retired  (or (sync-util/with-error-handling (format "Error retiring tables for %s"
                                                               (sync-util/name-for-logging database))
                          (retire-unseen-tables! database db-metadata))
                        0)
           archived (or (sync-util/with-error-handling (format "Error archiving tables for %s"
                                                               (sync-util/name-for-logging database))
                          (archive-tables! database))
                        0)]
       {:updated-tables (+ created updated retired archived)
        :total-tables   (t2/count :model/Table :db_id (u/the-id database) :active true)}))))
