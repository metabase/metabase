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
   [metabase.lib.schema.id :as lib.schema.id]
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

(def ^:private TableNameAndSchema
  "The `{:name :schema}` identity a Table is keyed on during sync."
  [:map {:closed true}
   [:name   ::lib.schema.common/non-blank-string]
   [:schema [:maybe ::lib.schema.common/non-blank-string]]])

(mu/defn- update-database-metadata!
  "If there is a version in the db-metadata update the DB to have that in the DB model"
  [database    :- i/DatabaseInstance
   db-metadata :- i/DatabaseMetadata]
  (log/infof "Found new version for DB: %s" (:version db-metadata))
  (t2/update! :model/Database (u/the-id database)
              {:details
               (assoc (:details database) :version (:version db-metadata))}))

(mu/defn- cruft-dependent-cols :- :map
  [{table-name :name :as table} :- :map
   database                     :- i/DatabaseInstance
   sync-stage                   :- [:enum ::reactivate ::create ::update]]
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

(mu/defn create-table! :- (ms/InstanceOf :model/Table)
  "Creates a new table in the database, ready to be synced.
   Throws an exception if there is already a table with the same name, schema and database ID."
  [database :- i/DatabaseInstance
   table    :- :map]
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
          (when (:field_order table)
            {:field_order (:field_order table)})
          (when (:data_source table)
            {:data_source (:data_source table)})
          (when (:data_authority table)
            {:data_authority (:data_authority table)})
          (when (:is_sample database)
            {:data_authority :ingested
             :data_source    :ingested}))))

(mu/defn- reactivate-table!
  "Mark an existing inactive Table active again, refreshing its cruft-dependent columns. `existing`
  is the app-DB Table instance we already hold, so we don't re-select it."
  [database :- i/DatabaseInstance
   existing :- (ms/InstanceOf :model/Table)]
  (t2/update! :model/Table (:id existing)
              (cond-> (cruft-dependent-cols existing database ::reactivate)
                ;; do not unhide tables w/ cruft settings
                (some? (:visibility_type existing)) (dissoc :visibility_type)
                true                                (assoc :active true)
                (:is_sample database)               (assoc :data_authority :ingested
                                                           :data_source    :ingested))))

(mu/defn create-or-reactivate-table!
  "Create a single new table in the database, or mark it as active if a matching inactive one exists."
  [database :- i/DatabaseInstance
   {schema :schema table-name :name :as table} :- :map]
  (if-let [existing (t2/select-one :model/Table
                                   :db_id (u/the-id database)
                                   :schema schema
                                   :name table-name
                                   :active false)]
    (reactivate-table! database existing)
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

(mu/defn- table-name-or-schema-too-long? :- :boolean
  "Whether `table`'s name or schema is too long to store in the application DB (see `table-name-max-length` /
  `table-schema-max-length`)."
  [{table-name :name, table-schema :schema} :- :map]
  (boolean
   (or (< table-name-max-length (count table-name))
       (< table-schema-max-length (count (or table-schema ""))))))

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

(mu/defn- create-tables! :- [:sequential (ms/InstanceOf :model/Table)]
  "Insert brand-new tables for `database`, returning the created `:model/Table` instances. Sorted by
  `[schema name]` so auto-increment ids are assigned deterministically."
  [database :- i/DatabaseInstance
   new-table-metadatas :- [:set i/DatabaseMetadataTable]]
  (doseq [table-metadata new-table-metadatas]
    (log/info "Found new table:"
              (sync-util/name-for-logging (mi/instance :model/Table table-metadata))))
  (let [field-order (some-> (:engine database) driver/default-field-order)]
    (mapv (fn [table-metadata]
            (create-table! database (m/assoc-some table-metadata :field_order field-order)))
          (sort-by (juxt :schema :name) new-table-metadatas))))

(mu/defn- retire-tables!
  "Mark the active Tables with `table-ids` as inactive."
  [table-ids :- [:set ::lib.schema.id/table]]
  (when (seq table-ids)
    (log/info "Marking tables as inactive:" (pr-str table-ids))
    (t2/update! :model/Table {:id [:in table-ids] :active true} {:active false})))

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

(mu/defn- ignore-table? :- :boolean
  "Tables we never create `:model/Table` rows for: the special `_metabase_metadata` table (its
  contents are applied to other Tables/Fields instead) and temporary transform output tables."
  [table :- :map]
  (boolean
   (or (metabase-metadata/is-metabase-metadata-table? table)
       (sync-util/is-temp-transform-table? table))))

(mu/defn- table-name+schema :- TableNameAndSchema
  "The `{:name :schema}` identity a Table is keyed on during sync."
  [table :- :map]
  (select-keys table [:name :schema]))

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
  "Returns a map of `{old-schema new-schema}` for the app-DB schemas the driver re-qualifies. Streams
  the distinct schemas straight from the DB (selecting only `:schema`) so we never materialize every
  table just to read their schemas."
  [driver
   database :- i/DatabaseInstance]
  (transduce
   (comp (map :schema) (distinct))
   (completing
    (fn [accum schema]
      (let [new-schema (driver/adjust-schema-qualification driver database schema)]
        (cond-> accum
          (not= schema new-schema) (assoc schema new-schema)))))
   nil
   (t2/reducible-select [:model/Table :schema] :db_id (u/the-id database))))

(mu/defn- adjust-table-schemas!
  "Apply the `{old-schema new-schema}` renames from [[adjusted-schemas]] to the app-DB Table rows."
  [database          :- i/DatabaseInstance
   schemas-to-update :- [:maybe [:map-of :string :string]]]
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

(mu/defn- archive-tables! :- :int
  "Mark tables that have been deactivated for longer than the configured threshold as archived
  and suffixes their names. Skips tables with `transform_target = true` (provisional transform
  output entries) since transforms still reference them by their original name. Returns the number
  of tables archived."
  [database :- i/DatabaseInstance]
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

(def ^:private SyncContext
  "State threaded through [[sync-table-batch!]] across the single reconcile pass."
  [:map {:closed true}
   [:created           :int]                                  ; running count of created/reactivated tables
   [:updated           :int]                                  ; running count of metadata-updated tables
   [:complete?         :boolean]                              ; false once any batch fails -- then we don't retire
   [:seen              :any]                                  ; transient set of reconciled `:model/Table` ids
   [:metabase-metadata [:vector i/DatabaseMetadataTable]]])   ; captured `_metabase_metadata` table

(mu/defn- sync-table-batch! :- SyncContext
  "Reconcile one batch of warehouse tables against the app DB, threading the sync `context`.

  Captures any `_metabase_metadata` table(s) from the raw batch (for the downstream metabase-metadata
  step), then narrows the batch -- dropping tables we never sync, collapsing duplicate `(name, schema)`,
  dropping names too long for the app DB, and dropping workspace-isolated tables (they back canonical
  Tables via remap, so they get no `:model/Table` of their own) -- and creates/reactivates new tables
  and updates metadata on existing ones. The reconcile is error-handled per batch: on failure we log,
  skip the batch, and mark the sync incomplete so retirement is skipped."
  [database :- i/DatabaseInstance
   db-name  :- :string
   context  :- SyncContext
   batch    :- [:sequential i/DatabaseMetadataTable]]
  (letfn [(reconcile! []
            (let [tables         (as-> batch <>
                                   (into #{} (comp (remove ignore-table?) (m/distinct-by table-name+schema)) <>)
                                   (remove-tables-with-too-long-names database <>)
                                   (ws.table-remapping/filter-workspace-side-tables <> (u/the-id database)))
                  existing       (existing-tables-by-name+schema database tables)
                  existing-row   #(get existing (table-name+schema %))
                  already-active (into #{} (filter #(:active (existing-row %))) tables)
                  to-create      (into #{} (remove existing-row) tables)
                  to-reactivate  (into #{} (filter #(and (existing-row %) (not (:active (existing-row %))))) tables)
                  created        (when (seq to-create)
                                   (create-tables! database to-create))]
              (doseq [table-metadata to-reactivate]
                (reactivate-table! database (existing-row table-metadata)))
              (when (seq to-reactivate)
                (let [rows (existing-tables-by-name+schema database to-reactivate)]
                  (update-tables-metadata-if-needed! to-reactivate
                                                     (into #{} (keep #(get rows (table-name+schema %))) to-reactivate)
                                                     database)))
              {:created (+ (count to-create) (count to-reactivate))
               :updated (if (seq already-active)
                          (update-tables-metadata-if-needed! already-active
                                                             (into #{} (keep existing-row) already-active)
                                                             database)
                          0)
               :seen    (-> []
                            (into (map :id) created)
                            (into (keep (comp :id existing-row)) to-reactivate)
                            (into (keep (comp :id existing-row)) already-active))}))
          (conj-metabase-metadata [acc table]
            (cond-> acc
              (metabase-metadata/is-metabase-metadata-table? table) (conj table)))]
    (let [result (sync-util/with-error-handling (format "Error creating/reactivating tables for %s" db-name)
                   (reconcile!))]
      (if (map? result)
        (-> context
            (update :created + (:created result))
            (update :updated + (:updated result))
            (update :seen (fn [acc] (reduce conj! acc (:seen result))))
            (update :metabase-metadata (fn [acc] (reduce conj-metabase-metadata acc batch))))
        (assoc context :complete? false)))))

(mu/defn- retire-unseen-tables! :- :int
  "Retire active app-DB tables the warehouse no longer reports. `seen` holds the `:model/Table` id of
  every table reconciled this sync (accumulated by [[sync-table-batch!]], including the injected
  workspace-canonical tuples). Streams the active app-DB table ids and retires, a batch at a time, the
  ones not in `seen` -- so we never hold either the full active set or the full retire set in memory.
  Returns the number retired."
  [database :- i/DatabaseInstance
   seen     :- [:set ::lib.schema.id/table]]
  (transduce
   (comp (map :id) (remove seen) (partition-all table-sync-batch-size))
   (completing (fn [retired batch]
                 (retire-tables! (set batch))
                 (+ retired (count batch))))
   0
   (t2/reducible-select [:model/Table :id] :db_id (u/the-id database) :active true)))

(mu/defn sync-tables-and-database!
  "Sync the `:model/Table` rows for `database` against its driver's `describe-database`, and the DB
  metadata (e.g. version) if present.

  Reconciles the warehouse tables against the app DB one batch at a time (see [[table-sync-batch-size]]),
  then retires the active app-DB tables the warehouse no longer reports -- so a database with tens of
  thousands of tables never has to be held or `clojure.data/diff`ed all at once. Returns
  `{:updated-tables <n> :total-tables <n>}`."
  ([database :- i/DatabaseInstance]
   (sync-tables-and-database! database (fetch-metadata/db-metadata database)))

  ([database    :- i/DatabaseInstance
    db-metadata :- i/DatabaseMetadata]
   (let [driver               (driver.u/database->driver database)
         db-name              (sync-util/name-for-logging database)
         multi-level-support? (driver.u/supports? driver :multi-level-schema database)
         schemas-to-update    (when multi-level-support?
                                (adjusted-schemas driver database))]
     (sync-util/with-error-handling (format "Error updating table schemas for %s" db-name)
       (adjust-table-schemas! database schemas-to-update))
     (when (some? (:version db-metadata))
       (sync-util/with-error-handling (format "Error updating database metadata for %s" db-name)
         (update-database-metadata! database db-metadata)))
     (let [reconcile-batch (fn reconcile-batch [context batch]
                             (sync-table-batch! database db-name context batch))
           context  (transduce (partition-all table-sync-batch-size)
                               (completing reconcile-batch)
                               {:created 0, :updated 0, :complete? true
                                :seen (transient #{}), :metabase-metadata []}
                               (:tables db-metadata))
           context  (reconcile-batch context (ws.table-remapping/inject-workspace-canonical-tuples [] (u/the-id database)))
           {:keys [created updated complete?]} context]
       (when-let [holder (:metabase-metadata-tables db-metadata)]
         (vreset! holder (:metabase-metadata context)))
       (let [retired  (when complete?
                        (sync-util/with-error-handling (format "Error retiring tables for %s" db-name)
                          (retire-unseen-tables! database (persistent! (:seen context)))))
             archived (sync-util/with-error-handling (format "Error archiving tables for %s" db-name)
                        (archive-tables! database))]
         {:updated-tables (cond-> (+ created updated)
                            (int? retired)  (+ retired)
                            (int? archived) (+ archived))
          :total-tables   (t2/count :model/Table :db_id (u/the-id database) :active true)})))))
