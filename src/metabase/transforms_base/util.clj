(ns metabase.transforms-base.util
  "Shared utilities for transform execution.

   This namespace contains functions that are used by both query and python transforms
   and do NOT require transform_run database access."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.middleware.add-remaps :as remap]
   [metabase.query-processor.middleware.catch-exceptions :as qp.catch-exceptions]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.sync.core :as sync]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.schema :as transforms-base.schema]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.util Date)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Constants -------------------------------------------------

(def ^:const transform-temp-table-prefix
  "Prefix used for temporary tables created during transform execution."
  "mb_transform_temp_table")

;;; ------------------------------------------------- Transform Type Predicates -------------------------------------------------

(defn transform-type
  "Get the type of a transform"
  [transform]
  (-> transform :source :type keyword))

(defn query-transform?
  "Check if this is a query transform: native query / mbql query."
  [transform]
  (= :query (transform-type transform)))

(defn native-query-transform?
  "Check if this is a native query transform.
  Note: The transform should be normalized (via `normalize-transform`) before calling this function."
  [transform]
  (when (query-transform? transform)
    (let [query (-> transform :source :query)]
      (lib/native-only-query? query))))

(defn python-transform?
  "Check if this is a Python transform."
  [transform]
  (= :python (transform-type transform)))

(defn transform-source-database
  "Get the source database from a transform"
  [transform]
  (case (transform-type transform)
    :query (-> transform :source :query :database)
    :python (-> transform :source :source-database)))

;;; ------------------------------------------------- Transform Normalization -------------------------------------------------

(defn normalize-transform
  "Normalize a transform's source query, similar to how transforms are normalized when read from the database.
  This should be called on transforms before processing them to ensure queries are in the expected format."
  [transform]
  (if (and (map? transform)
           (= (:type transform) "transform")
           (get-in transform [:source :query]))
    (update-in transform [:source :query] lib-be/normalize-query)
    transform))

(defn transform-source-type
  "Returns the type of a transform's source: :python, :native, or :mbql.
  Throws if the source type cannot be detected.
  Note: The transform should be normalized (via `normalize-transform`) before calling this function."
  [source]
  (case (keyword (:type source))
    :python :python
    :query  (if (lib/native-only-query? (:query source))
              :native
              :mbql)
    (throw (ex-info (str "Unknown transform source type: " (:type source))
                    {:source source}))))

;;; ------------------------------------------------- Feature Checks -------------------------------------------------

(defn required-database-features
  "Returns the database features necessary to execute `transform`."
  [transform]
  (if (python-transform? transform)
    [:transforms/python]
    [:transforms/table]))

;;; ------------------------------------------------- Table Names -------------------------------------------------

(defn- resolve-nil-schema
  "When a table has nil schema, check if the physical table exists under the driver's
   default schema. If so, return that schema. Otherwise return nil.
   This handles the case where transforms create tables without explicit schema
   but the driver needs a schema to find the table during sync."
  [driver database table]
  (when-let [default-schema (try (sql.normalize/default-schema driver) (catch Exception _ nil))]
    (when (driver/table-exists? driver database {:schema default-schema :name (:name table)})
      default-schema)))

(defn qualified-table-name
  "Return the name of the target table of a transform as a possibly qualified symbol."
  [_driver {:keys [schema name]}]
  (if schema
    (keyword schema name)
    (keyword name)))

(defn temp-table-name
  "Generate a temporary table name with current timestamp in milliseconds.
  If table name would exceed max table name length for the driver, fallback to using a shorter timestamp"
  [driver schema]
  (let [max-len   (max 1 (or (driver/table-name-length-limit driver) Integer/MAX_VALUE))
        timestamp (str (System/currentTimeMillis))
        prefix    (str transform-temp-table-prefix "_")
        available (- max-len (count prefix))
        ;; If we don't have enough space, take the later digits of the timestamp
        suffix    (if (>= available (count timestamp))
                    timestamp
                    (subs timestamp (- (count timestamp) available)))
        table-name (str prefix suffix)]
    (keyword schema table-name)))

;;; ------------------------------------------------- Query Helpers -------------------------------------------------

(defn massage-sql-query
  "Adjusts mbql query for use in a transform."
  [query]
  (-> query
      remap/disable-remaps
      lib/disable-default-limit))

;;; ------------------------------------------------- Incremental/Checkpoint Helpers -------------------------------------------------

(defn supported-incremental-filter-type?
  "Returns true if the given base-type is supported for incremental filtering.

  We only support temporal (timestamp/tz) and numeric (int/float) types."
  [base-type]
  (or (isa? base-type :type/Temporal)
      (isa? base-type :type/Number)))

(defn- encode-checkpoint-value [v]
  (if (number? v)
    (str v)
    (u.date/format v)))

(defn save-watermark!
  "Commits the incremental transforms :hi watermark value to the appdb."
  [transform-id source-range-params]
  (t2/update! :model/Transform
              transform-id
              {:last_checkpoint_value (some-> source-range-params :hi :value encode-checkpoint-value)}))

(defn save-run-checkpoint-range!
  "Persist the checkpoint range (lo/hi) on a transform run record.
  This is called early in execution so the range is recorded even if the run fails."
  [run-id source-range-params]
  (when (and run-id source-range-params)
    (let [{:keys [checkpoint-filter-field-id lo hi]} source-range-params]
      (t2/update! :model/TransformRun run-id
                  (cond-> {:checkpoint_filter_field_id checkpoint-filter-field-id}
                    lo (assoc :checkpoint_lo_value (encode-checkpoint-value (:value lo)))
                    hi (assoc :checkpoint_hi_value (encode-checkpoint-value (:value hi))))))))

(defn- coerce-to-local-datetime
  "Coerce a temporal value to LocalDateTime, stripping any timezone information."
  [t]
  (condp instance? t
    OffsetDateTime (t/local-date-time t)
    ZonedDateTime  (t/local-date-time t)
    Instant        (t/local-date-time t (t/zone-id "UTC"))
    t))

(defn- maybe-coerce-temporal
  [base-type t]
  (cond-> t
    (and (isa? base-type :type/DateTime)
         (not (isa? base-type :type/DateTimeWithTZ)))
    coerce-to-local-datetime))

(defn- parse-checkpoint-value
  "Parse a serialized checkpoint value string according to its base-type keyword.
  For temporal types, coerces the result to match the column's base-type."
  [base-type s]
  (cond
    (not (string? s))               (maybe-coerce-temporal base-type s)
    (isa? base-type :type/Float)    (bigdec s)
    (isa? base-type :type/Number)   (biginteger s)
    (isa? base-type :type/Temporal) (maybe-coerce-temporal base-type (u.date/parse s))
    :else (throw (ex-info (str "Unsupported checkpoint type: " (pr-str base-type))
                          {:base-type base-type}))))

(defn- tag-checkpoint-value
  "Wrap a raw checkpoint value from the QP into a map `{:value parsed}`."
  [base-type raw-value]
  {:value (parse-checkpoint-value base-type raw-value)})

(defn- inject-filters-into-table-tag
  "Inject `:source-filters` into the table template tag matching the checkpoint field's table.

   Instead of manually expanding {{tag}} to a subquery SQL string, this adds filter metadata
   to the template tag so the QP's existing pipeline handles substitution. The filters specify
   field-id-based comparisons (e.g. :> lo, :<= hi) that get rendered as a filtered subquery
   in `->replacement-snippet-info`."
  [query source-range-params]
  (let [{:keys [checkpoint-filter-field-id lo hi column]} source-range-params
        table-id  (:table-id column)
        tags      (lib/template-tags query)
        tag-name  (some (fn [[k v]]
                          (when (and (#{:table "table"} (:type v))
                                     (= table-id (:table-id v)))
                            k))
                        tags)
        _         (when-not tag-name
                    (throw (ex-info "No table variable found for checkpoint field's table"
                                    {:checkpoint-table-id table-id
                                     :template-tags       tags})))
        filters   (cond-> []
                    lo (conj {:field-id checkpoint-filter-field-id :op :> :value (:value lo)})
                    hi (conj {:field-id checkpoint-filter-field-id :op :<= :value (:value hi)}))]
    (lib.util/update-query-stage
     query 0
     #(assoc-in % [:template-tags tag-name :source-filters] filters))))

(mu/defn get-source-range-params :- [:maybe ::transforms-base.schema/source-range-params]
  "Returns information on the incremental range filters that ought to be applied to a source query.

  Returns a map:
   :column                     (the lib column value of the incremental filter column)
   :checkpoint-filter-field-id (the field ID of the checkpoint column)
   Range predicate terms (maps :type, :value), can be nil (in which case the filter clause should be omitted):
   :lo                         values in the source table must be > this :value.
   :hi                         values in the source table must be <= this :value."
  [{:keys [source target] :as transform}]
  (let [{:keys [source-incremental-strategy]} source
        {:keys [checkpoint-filter-field-id]} source-incremental-strategy]
    (when (and (= "table-incremental" (:type target))
               (native-query-transform? transform)
               (not (some (fn [[_k v]] (#{:table "table"} (:type v)))
                          (lib/template-tags (:query source)))))
      (let [msg (i18n/tru (str "Incremental transform with a native query requires a table variable. "
                               "Please add a table variable to the query and update the checkpoint field."))]
        (throw (ex-info msg {:transform-message msg}))))
    (when (and (= "table-incremental" (:type target))
               (not checkpoint-filter-field-id))
      (let [msg (i18n/tru (str "Incremental transform is enabled but no checkpoint field is selected. "
                               "Please select a checkpoint field in the transform settings."))]
        (throw (ex-info msg {:transform-message msg}))))
    (when checkpoint-filter-field-id
      (let [{:keys [last_checkpoint_value]} transform
            db-id             (transforms-base.i/target-db-id transform)
            metadata-provider (lib-be/application-database-metadata-provider db-id)
            column            (lib.metadata/field metadata-provider checkpoint-filter-field-id)
            _                   (when (or (nil? column) (not (:active column)))
                                  (throw (ex-info "Checkpoint field does not exist or is not active"
                                                  {:checkpoint-filter-field-id checkpoint-filter-field-id})))
            _ (when-not (supported-incremental-filter-type? (:base-type column))
                (throw (ex-info (str "Checkpoint column '" (:name column) "' has unsupported type " (pr-str (:base-type column)) ". "
                                     "Only numeric and temporal columns are supported for incremental filtering.")
                                {:column column})))
            base-type         (:base-type column)
            lo                (when last_checkpoint_value (parse-checkpoint-value base-type last_checkpoint_value))

            max-value
            (let [table-id          (:table-id column)
                  table-metadata    (lib.metadata/table metadata-provider table-id)
                  base-query        (lib/query metadata-provider table-metadata)
                  filtered-query    (if lo (lib/filter base-query (lib/> column lo)) base-query)
                  query             (lib/aggregate (lib/append-stage filtered-query) (lib/max column))
                  query-result      (qp/process-query query)]
              (ffirst (get-in query-result [:data :rows])))]
        {:column                     column
         :checkpoint-filter-field-id checkpoint-filter-field-id
         :lo                         (when lo {:value lo})
         :hi                         (cond (some? max-value) (tag-checkpoint-value base-type max-value)
                                           lo {:value lo})}))))

(defn preprocess-incremental-query
  "Add checkpoint filtering to a query for incremental execution.

   For native queries, injects `:source-filters` into the table template tag matching the checkpoint
   field's table. The QP's substitution pipeline renders these as a filtered subquery.
   For MBQL queries, adds filter clauses `WHERE checkpoint_column > lo AND checkpoint_column <= hi`.
   Returns the query unchanged when source-range-params is nil."
  [query source-range-params]
  (if source-range-params
    (if (lib/native? query)
      ;; Native: inject source-filters into the table template tag — QP handles the rest
      (inject-filters-into-table-tag query source-range-params)
      ;; MBQL: add filter clauses
      (cond-> query
        (:lo source-range-params) (lib/filter 0 (lib/>  (:column source-range-params) (:value (:lo source-range-params))))
        (:hi source-range-params) (lib/filter 0 (lib/<= (:column source-range-params) (:value (:hi source-range-params))))))
    ;; No range params - return unchanged
    query))

(mu/defn validate-transform-query :- [:maybe [:map [:error :string]]]
  "Verifies that a query transform's query can actually be run as is.  Returns nil on success and an error map on failure."
  [{:keys [source]}]
  (case (keyword (:type source))
    :query
    (try
      (qp.preprocess/preprocess (:query source))
      nil
      (catch Exception e
        (qp.catch-exceptions/exception-response e)))))

(defn compile-source
  "Compile the source query of a transform to SQL, applying incremental filtering if required."
  [{:keys [source]} source-range-params]
  (let [{query-type :type} source]
    (assert (= :query (keyword query-type)))
    (let [query  (:query source)
          driver (some->> query :database (t2/select-one :model/Database) :engine keyword)]
      (binding [driver/*compile-with-inline-parameters*
                (or (= :clickhouse driver)
                    driver/*compile-with-inline-parameters*)]
        (-> query
            (preprocess-incremental-query source-range-params)
            massage-sql-query
            qp.compile/compile)))))

;;; ------------------------------------------------- Target Table Management -------------------------------------------------

(defn target-table
  "Load the `target` table of a transform from the database specified by `database-id`."
  [database-id target & kv-args]
  (some-> (apply t2/select-one :model/Table
                 :db_id database-id
                 :schema (:schema target)
                 :name (:name target)
                 kv-args)
          (t2/hydrate :db)))

(defn target-table-exists?
  "Test if the target table of a transform already exists."
  [{:keys [target] :as transform}]
  (let [db-id (transforms-base.i/target-db-id transform)
        {driver :engine :as database} (t2/select-one :model/Database db-id)]
    (driver/table-exists? driver database target)))

(defn- sync-table!
  ([database target] (sync-table! database target nil))
  ([database target {:keys [create? physical-target]}]
   (when-let [table (or (target-table (:id database) target)
                        (when create?
                          (sync/create-table! database (select-keys target [:schema :name :data_source :data_authority :is_writable]))))]
     ;; If the table has nil schema, check if the physical table actually lives under
     ;; the driver's default schema. If so, fix the Table record before syncing.
     (let [table (if (nil? (:schema table))
                   (if-let [actual-schema (resolve-nil-schema (:engine database) database table)]
                     (do (t2/update! :model/Table (:id table) {:schema actual-schema})
                         (-> (t2/select-one :model/Table (:id table))
                             (t2/hydrate :db)))
                     table)
                   table)
           ;; Under workspace remapping, the physical warehouse table lives at a different
           ;; (schema, name) than the persisted row. We override those on the in-memory
           ;; table instance so sync's describe-* calls hit the right warehouse location;
           ;; fields written by sync attach via table_id to the persisted (logical) row.
           physical-table (if physical-target
                            (merge table (select-keys physical-target [:schema :name]))
                            table)]
       (sync/sync-table! physical-table)
       table))))

(defn activate-table-and-mark-computed!
  "Activate table for `target` in `database` in the app db."
  ([database target] (activate-table-and-mark-computed! database target nil))
  ([database target physical-target]
   (when-let [table (sync-table! database (assoc target
                                                 :data_authority :computed
                                                 :data_source :metabase-transform
                                                 :is_writable false)
                                 {:create? true
                                  :physical-target physical-target})]
     (when-not (:active table)
       (t2/update! :model/Table (:id table) {:active true}))
     table)))

(defn sync-target!
  "Sync target of a transform. `physical-target`, when non-nil, overrides the warehouse
   (schema, name) that sync queries — used when workspace remapping writes the output to
   a different physical location than the transform's declared target."
  ([target database] (sync-target! target database nil))
  ([target database physical-target]
   ;; sync the new table (note that even a failed sync status means that the execution succeeded)
   (log/info "Syncing target" (pr-str target)
             (when physical-target (str "(physical: " (pr-str physical-target) ")"))
             "for transform")
   (activate-table-and-mark-computed! database target physical-target)))

(defn deactivate-table!
  "Deactivate table for `target` in `database` in the app db."
  [database target]
  (when-let [table (sync-table! database target)]
    ;; TODO this should probably be a function in the sync module
    (t2/update! :model/Table (:id table) {:active false})))

(defn delete-target-table!
  "Delete the target table of a transform and sync it from the app db."
  [{:keys [id target], :as transform}]
  (when target
    (let [target (update target :type keyword)
          database-id (transforms-base.i/target-db-id transform)]
      (when database-id
        (if-let [{driver :engine :as database} (t2/select-one :model/Database database-id)]
          (do
            (driver/drop-transform-target! driver database target)
            (log/info "Deactivating  target " (pr-str target) "for transform" id)
            (deactivate-table! database target))
          (log/warnf "Skipping drop of transform target %s for transform %d: database %d not found"
                     (pr-str target) id database-id))))))

(defn delete-target-table-by-id!
  "Delete the target table of the transform specified by `transform-id`."
  [transform-id]
  (delete-target-table! (t2/select-one :model/Transform transform-id)))

;;; ------------------------------------------------- Table DDL -------------------------------------------------

(mr/def ::column-definition
  [:map
   [:name :string]
   [:type ::lib.schema.common/base-type]
   [:nullable? {:optional true} :boolean]])

(mr/def ::table-definition
  [:map
   [:name :keyword]
   [:columns [:sequential ::column-definition]]
   [:primary-key {:optional true} [:sequential :string]]])

(mu/defn create-table-from-schema!
  "Create a table from a table-schema"
  [driver :- :keyword
   database-id :- pos-int?
   table-schema :- ::table-definition]
  (let [{:keys [columns] table-name :name} table-schema
        column-definitions (mapv (fn [{:keys [name type database-type]}]
                                   (let [db-type (if database-type
                                                   [[:raw database-type]]
                                                   (try
                                                     (driver/type->database-type driver type)
                                                     (catch IllegalArgumentException _
                                                       (log/warnf "Couldn't determine database type for type %s, fallback to Text" type)
                                                       (driver/type->database-type driver :type/Text))))]
                                     [name db-type]))
                                 columns)
        primary-key-opts (select-keys table-schema [:primary-key])]
    (log/infof "Creating table %s with %d columns" table-name (count columns))
    (driver/create-table! driver database-id table-name column-definitions primary-key-opts)))

(defn drop-table!
  "Drop a table in the database."
  [driver database-id table-name]
  (log/infof "Dropping table %s" table-name)
  (driver/drop-table! driver database-id table-name))

(defn rename-tables!
  "Rename multiple tables atomically within a transaction using the new driver/rename-tables method.
   This is a simpler, composable operation that only handles renaming."
  [driver database-id rename-map]
  (log/infof "Renaming tables: %s" (pr-str rename-map))
  (driver/rename-tables! driver database-id rename-map))

;;; ------------------------------------------------- Post-Execution Completion -------------------------------------------------

(defn complete-execution!
  "Post-processing steps after a transform has been executed successfully.

   Performs:
   - Sync target table to AppDB
   - Set `transform_id` on the target table
   - Publish Metabase events (unless `:publish-events?` is false)
   - Create/drop secondary indexes

   This is called after the core execution completes. Callers that use
   `run-cancelable-transform!` should call this AFTER `succeed-started-run!`
   to preserve the correct order of operations."
  [transform opts]
  (let [{:keys [target]} transform
        {:keys [publish-events? table-remapping]
         :or   {publish-events? true}} opts
        ;; Under workspaces the physical warehouse table lives at a remapped (schema, name);
        ;; the persisted metabase_table row stays at the declared `target` so cards and the
        ;; QP workspace-remapping middleware (keyed on the *from* side) continue to resolve.
        physical-target (when table-remapping (merge target table-remapping))
        db-id (transforms-base.i/target-db-id transform)
        database (t2/select-one :model/Database db-id)]
    ;; Sync target table, set target_table_id on transform, and mark table as owned by this transform
    (when-let [table (sync-target! target database physical-target)]
      (t2/update! :model/Transform (:id transform) {:target_table_id (:id table)})
      (t2/update! :model/Table (:id table) {:transform_id (:id transform)}))
    ;; Publish event after sync so the table exists in AppDB.
    (when publish-events?
      (events/publish-event! :event/transform-run-complete
                             {:object {:db-id          db-id
                                       :transform-id   (:id transform)
                                       :transform-type (keyword (:type target))
                                       :output-schema  (:schema target)
                                       :output-table   (qualified-table-name (:engine database) target)}}))))

(defn output-table
  "Return the output table created by a transform, looked up via `transform_id`."
  [transform]
  (t2/select-one :model/Table :transform_id (:id transform)))

;;; ------------------------------------------------- Source Table Schemas -------------------------------------------------

;;; ------------------------------------------------- Source Table Resolution -------------------------------------------------

(def ^:private ^:const batch-lookup-chunk-size
  "Maximum number of table refs to query at once to avoid SQL query size limits."
  100)

(defn batch-lookup-table-ids
  "Batch lookup table IDs from ref maps. Returns {[db_id schema name] -> table_id}.
  Queries the exact conjunction of each [database_id, schema, table] triple rather than
  a Cartesian product of all values. Uses chunking to avoid query size limits."
  [refs]
  (when (seq refs)
    (let [unique-refs (distinct (map (juxt :database_id :schema :table) refs))
          ref->clause (fn [[db-id schema table-name]]
                        [:and
                         [:= :db_id db-id]
                         (if (some? schema)
                           [:= :schema schema]
                           [:is :schema nil])
                         [:= :name table-name]])
          fetch-batch (fn [batch]
                        (t2/select-fn->fn (juxt :db_id :schema :name) :id
                                          [:model/Table :id :db_id :schema :name]
                                          {:where (into [:or] (map ref->clause batch))}))]
      (into {} (mapcat fetch-batch) (partition-all batch-lookup-chunk-size unique-refs)))))

(defn- source-table-ref->key
  "Convert a source table ref map to a lookup key [db_id schema name]."
  [{:keys [database_id schema table]}]
  [database_id schema table])

(defn- missing-table-id?
  "Returns true if `v` is a source table ref map that needs table_id lookup."
  [v]
  (and (map? v) (nil? (:table_id v))))

(mr/def ::source-table-entry
  "A source table entry in the array format. Combines alias with table reference."
  [:map
   [:alias :string]
   [:database_id :int]
   [:schema [:maybe :string]]
   [:table {:optional true} :string]
   [:table_id {:optional true} [:maybe :int]]])

(mu/defn normalize-source-tables :- [:sequential ::source-table-entry]
  "Normalize source-table entries by enriching them with full metadata.
  For entries with only :table_id, looks up :database_id/:schema/:table.
  For entries with only :database_id/:schema/:table, looks up :table_id.
  Throws if an integer table ID references a non-existent table.
  Map refs with non-existent tables get nil table_id (resolved later at execute time)."
  [source-tables :- [:sequential [:map [:alias :string]]]]
  (let [;; Entries that have table_id but lack table metadata need lookup
        needs-metadata   (filter (fn [e] (and (:table_id e) (not (:table e)))) source-tables)
        int-id->metadata (when (seq needs-metadata)
                           (let [ids (into #{} (map :table_id) needs-metadata)]
                             (t2/select-pk->fn (fn [{:keys [db_id schema name]}]
                                                 {:database_id db_id :schema schema :table name})
                                               [:model/Table :id :db_id :schema :name]
                                               :id [:in ids])))
        missing-ids      (when (seq needs-metadata)
                           (let [ids (into #{} (map :table_id) needs-metadata)]
                             (remove (or int-id->metadata {}) ids)))
        refs-needing-id  (filter missing-table-id? source-tables)
        ref-lookup       (or (batch-lookup-table-ids refs-needing-id) {})]
    (when (seq missing-ids)
      (throw (ex-info (str "Tables not found for ids: " (str/join ", " (sort missing-ids)))
                      {:table_ids (vec missing-ids)})))
    (mapv (fn [entry]
            (cond
              ;; Has table_id but no table metadata — enrich from DB
              (and (:table_id entry) (not (:table entry)))
              (merge (int-id->metadata (:table_id entry)) entry)

              ;; Has table metadata but no table_id — look it up, upsert transform target if not found
              (missing-table-id? entry)
              (assoc entry :table_id (or (ref-lookup (source-table-ref->key entry))
                                         (when (and (:database_id entry) (:table entry))
                                           (table/upsert-transform-target-table!
                                            (:database_id entry) (:schema entry) (:table entry)))))

              ;; Already fully populated
              :else entry))
          source-tables)))

(mu/defn resolve-source-tables :- [:sequential ::source-table-entry]
  "Resolve source-table entries to entries with :table_id filled in. Throws if any table not found.
  For execute time — all entries must resolve to valid table IDs."
  [source-tables :- [:sequential ::source-table-entry]]
  (let [needs-lookup (filter missing-table-id? source-tables)
        lookup       (or (batch-lookup-table-ids needs-lookup) {})
        resolved     (mapv (fn [entry]
                             (let [table-id (or (:table_id entry) (lookup (source-table-ref->key entry)))]
                               (assoc entry :table_id table-id)))
                           source-tables)
        unresolved   (filter #(nil? (:table_id %)) resolved)]
    (when (seq unresolved)
      (throw (ex-info (str "Tables not found: " (str/join ", " (map (fn [{:keys [schema table]}]
                                                                      (if schema
                                                                        (str schema "." table)
                                                                        table))
                                                                    unresolved)))
                      {:unresolved unresolved
                       :transform-message "Input table not found"})))
    resolved))

(mu/defn source-tables-map->vec :- [:sequential ::source-table-entry]
  "Convert map format `{alias -> value}` to vec format `[{:alias alias ...}]`.
  Handles both int values (`{alias: table_id}`) and ref map values (`{alias: {:database_id ...}}`.
  Accepts both keyword and string keys for alias.
  Enriches entries with full metadata via [[normalize-source-tables]]."
  [m :- [:map-of [:or :string :keyword] [:or :int :map]]]
  (normalize-source-tables
   (mapv (fn [[alias v]]
           (if (int? v)
             {:alias (name alias) :table_id v}
             (assoc v :alias (name alias))))
         m)))

(defn normalize-source-tables-structure
  "Converts legacy map format to vec format if needed, otherwise passes through."
  [st]
  (if (map? st)
    (source-tables-map->vec st)
    st))

(def keyword-type-dispatch
  "Dispatch function for malli :multi schemas that dispatch on `(keyword (:type m))`."
  (comp keyword :type))

;;; ------------------------------------------------- Timestamp Helpers -------------------------------------------------

(defn ->instant
  "Convert a temporal value `t` to an Instant in the system timezone."
  ^Instant [t]
  (when t
    (condp instance? t
      Instant        t
      Date           (.toInstant ^Date t)
      OffsetDateTime (.toInstant ^OffsetDateTime t)
      ZonedDateTime  (.toInstant ^ZonedDateTime t)
      LocalDateTime  (recur (.atZone ^LocalDateTime t (t/zone-id)))
      String         (recur (u.date/parse t))
      LocalTime      (recur (.atDate ^LocalTime t (t/local-date)))
      OffsetTime     (recur (.atDate ^OffsetTime t (t/local-date)))
      LocalDate      (recur (.atStartOfDay ^LocalDate t))
      (throw (ex-info (str "Cannot convert temporal " t " of type " (type t) " to an Instant")
                      {:temporal t})))))

(defn utc-timestamp-string
  "Convert the timestamp t to a string encoding the it in the system timezone."
  [t]
  (-> t ->instant str))

(defn localize-run-timestamps
  "Convert the timestamps of a `run` to ISO strings in UTC."
  [run]
  (-> run
      (u/update-some :start_time utc-timestamp-string)
      (u/update-some :end_time   utc-timestamp-string)))

;;; ------------------------------------------------- Filter Transforms -------------------------------------------------

(defn- matching-timestamp?
  [job field-path {:keys [start end]}]
  (when-let [field-instant (->instant (get-in job field-path))]
    (let [parse #(-> % u.date/parse ->instant)]
      ;; logic here is to find when it's not matching and invert this
      (not (or (and start (.isBefore field-instant (parse start)))
               (and end   (.isAfter field-instant (parse end))))))))

(defn ->date-field-filter-xf
  "Returns an xform for a date filter."
  [field-path filter-value]
  (if-let [range (some-> filter-value (params.dates/date-string->range {:inclusive-end? false}))]
    (filter #(matching-timestamp? % field-path range))
    identity))

(defn ->status-filter-xf
  "Returns an xform for a transform run status filter."
  [field-path statuses]
  (if-let [statuses (->> statuses (map keyword) set not-empty)]
    (filter #(statuses (get-in % field-path)))
    identity))

(defn ->tag-filter-xf
  "Returns an xform for a transform tag filter."
  [field-path tag-ids]
  (if-let [tag-ids (-> tag-ids set not-empty)]
    (filter #(some tag-ids (get-in % field-path)))
    identity))

;;; ------------------------------------------------- Misc -------------------------------------------------

(defn upsert-target-table!
  "Upsert a provisional table entry for a transform's target, creating it if it doesn't exist.
  Returns the table ID.

  Thin wrapper around [[metabase.warehouse-schema.models.table/upsert-transform-target-table!]] —
  exists because the `models` module cannot depend on `warehouse-schema` directly, but can
  depend on `transforms-base` (which is allowed to use `warehouse-schema`)."
  [db-id schema table-name]
  (table/upsert-transform-target-table! db-id schema table-name))

(defn is-temp-transform-table?
  "Return true when `table` matches the transform temporary table naming pattern."
  [table]
  (when-let [table-name (:name table)]
    (str/starts-with? (u/lower-case-en table-name) transform-temp-table-prefix)))

(defn throw-if-db-routing-enabled!
  "Throws if the database has routing enabled. Call before any driver operations to get a
   clear error message rather than a confusing driver-level failure."
  [transform database]
  (when (database-routing/db-routing-enabled? database)
    (throw (ex-info (i18n/tru "Failed to run the transform ({0}) because the database ({1}) has database routing turned on. Running transforms on databases with db routing enabled is not supported."
                              (:name transform)
                              (:name database))
                    {:driver (:engine database), :database database}))))
