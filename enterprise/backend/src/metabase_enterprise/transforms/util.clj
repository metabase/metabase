(ns metabase-enterprise.transforms.util
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.transforms.canceling :as canceling]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.schema :as transforms.schema]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.util Date)))

(set! *warn-on-reflection* true)

(def ^:const transform-temp-table-prefix
  "Prefix used for temporary tables created during transform execution."
  "mb_transform_temp_table")

(defn qualified-table-name
  "Return the name of the target table of a transform as a possibly qualified symbol."
  [_driver {:keys [schema name]}]
  (if schema
    (keyword schema name)
    (keyword name)))

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

(defn check-feature-enabled
  "Checking whether we have proper feature flags for using a given transform."
  [transform]
  (if (python-transform? transform)
    (and (premium-features/has-feature? :transforms)
         (premium-features/has-feature? :transforms-python))
    (premium-features/has-feature? :transforms)))

(defn try-start-unless-already-running
  "Start a transform run, throwing an informative error if already running.
   If `user-id` is provided, it will be stored with the run for attribution purposes."
  [id run-method user-id]
  (try
    (transform-run/start-run! id (cond-> {:run_method run-method}
                                   user-id (assoc :user_id user-id)))
    (catch java.sql.SQLException e
      (if (= (.getSQLState e) "23505")
        (throw (ex-info "Transform is already running"
                        {:error        :already-running
                         :transform-id id}
                        e))
        (throw e)))))

(defn run-cancelable-transform!
  "Execute a transform with cancellation support and proper error handling.

  Options:
  - `:ex-message-fn` change how caught exceptions are presented to the user in run logs, by default the same as clojure.core/ex-message"
  [run-id driver {:keys [db-id conn-spec output-schema]} run-transform! & {:keys [ex-message-fn] :or {ex-message-fn ex-message}}]
  ;; local run is responsible for status, using canceling lifecycle
  (try
    (when-not (driver/schema-exists? driver db-id output-schema)
      (driver/create-schema-if-needed! driver conn-spec output-schema))
    (canceling/chan-start-timeout-vthread! run-id (transforms.settings/transform-timeout))
    (let [cancel-chan (a/promise-chan)
          ret (binding [qp.pipeline/*canceled-chan* cancel-chan]
                (canceling/chan-start-run! run-id cancel-chan)
                (run-transform! cancel-chan))]
      (transform-run/succeed-started-run! run-id)
      ret)
    (catch Throwable t
      (transform-run/fail-started-run! run-id {:message (ex-message-fn t)})
      (throw t))
    (finally
      (canceling/chan-end-run! run-id))))

(declare activate-table-and-mark-computed! target-table)

(defn sync-target!
  "Sync target of a transform"
  [target database]
  ;; sync the new table (note that even a failed sync status means that the execution succeeded)
  (log/info "Syncing target" (pr-str target) "for transform")
  (activate-table-and-mark-computed! database target))

(defn target-table-exists?
  "Test if the target table of a transform already exists."
  [{:keys [target] :as transform}]
  (let [db-id (transforms.i/target-db-id transform)
        {driver :engine :as database} (t2/select-one :model/Database db-id)]
    (driver/table-exists? driver database target)))

(defn target-table
  "Load the `target` table of a transform from the database specified by `database-id`."
  [database-id target & kv-args]
  (some-> (apply t2/select-one :model/Table
                 :db_id database-id
                 :schema (:schema target)
                 :name (:name target)
                 kv-args)
          (t2/hydrate :db)))

(defn- sync-table!
  ([database target] (sync-table! database target nil))
  ([database target {:keys [create?]}]
   (when-let [table (or (target-table (:id database) target)
                        (when create?
                          (sync/create-table! database (select-keys target [:schema :name :data_source :data_authority]))))]
     (sync/sync-table! table)
     table)))

(defn activate-table-and-mark-computed!
  "Activate table for `target` in `database` in the app db."
  [database target]
  (when-let [table (sync-table! database (assoc target
                                                :data_authority :computed
                                                :data_source :metabase-transform)
                                {:create? true})]
    (when-not (:active table)
      (t2/update! :model/Table (:id table) {:active true}))
    table))

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
          database-id (transforms.i/target-db-id transform)]
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

(defn massage-sql-query
  "Adjusts mbql query for use in a transform."
  [query]
  (assoc-in query [:middleware :disable-remaps?] true))

(defn- checkpoint-incremental?
  "Returns true if `source` uses checkpoint-based incremental strategy."
  [source]
  (= :checkpoint (some-> source :source-incremental-strategy :type keyword)))

(defn supported-incremental-filter-type?
  "Returns true if the given base-type is supported for incremental filtering.

  We only support temporal (timestamp/tz) and numeric (int/float) types."
  [base-type]
  (or (isa? base-type :type/Temporal)
      (isa? base-type :type/Number)))

(defn- source->checkpoint-filter-unique-key
  "Extract the checkpoint filter column from `query` using the unique key specified in `source-incremental-strategy`."
  [query source-incremental-strategy]
  (some->> source-incremental-strategy :checkpoint-filter-unique-key (lib/column-with-unique-key query)))

(defn- source->checkpoint-filter-column
  "Resolve the checkpoint filter column for an incremental transform.

  Tries to resolve the column using the unique key first.
  Falls back to looking up the column by name from the target table if a `:checkpoint-filter` is specified.

  Validates that the resolved column has a supported type for checkpoint filtering (numeric or temporal).
  Throws an exception if the column type is not supported."
  [query source-incremental-strategy table metadata-provider]
  (let [{:keys [checkpoint-filter checkpoint-filter-unique-key]} source-incremental-strategy]
    (when-some [{column-name :name
                 :keys [base-type]
                 :as column}
                (cond
                  checkpoint-filter-unique-key
                  (source->checkpoint-filter-unique-key query source-incremental-strategy)
                  checkpoint-filter
                  (when-some [field-id (t2/select-one-pk :model/Field
                                                         :table_id (:id table)
                                                         :name checkpoint-filter)]
                    (lib.metadata/field metadata-provider field-id)))]
      (when-not (supported-incremental-filter-type? base-type)
        (throw (ex-info (str "Checkpoint column '" column-name "' has unsupported type " (pr-str base-type) ". "
                             "Only numeric and temporal columns are supported for incremental filtering.")
                        {:column-name column-name
                         :base-type   base-type})))
      column)))

(defn next-checkpoint
  "Build a query to compute the MAX of the checkpoint column from the target table.

  Returns a map with `:query` (MBQL query selecting the max) and `:filter-column` (column metadata),
  or `nil` if the transform doesn't use checkpoint-based incremental strategy or the target table doesn't exist."
  [{:keys [source target] :as transform}]
  (let [db-id (transforms.i/target-db-id transform)]
    (when (checkpoint-incremental? source)
      (when-let [table (target-table db-id target)]
        (let [metadata-provider (lib-be/application-database-metadata-provider db-id)
              table-metadata (lib.metadata/table metadata-provider (:id table))
              query (lib/query metadata-provider table-metadata)]
          (when-let [filter-column (source->checkpoint-filter-column query
                                                                     (:source-incremental-strategy source)
                                                                     table metadata-provider)]
            {:query (-> query (lib/aggregate (lib/max filter-column)))
             :filter-column filter-column}))))))

(defn- next-checkpoint-value
  "Execute the checkpoint query and normalize the result for database insertion.
  Returns `nil` if the target table is empty."
  [{:keys [query filter-column]}]
  (let [{:keys [base-type]} filter-column
        v (some-> query qp/process-query :data :rows first first)]
    ;; QP return values are lossy, we do a bit of parsing to ensure they're of the right
    ;; shape for reinsertion
    (cond
      (nil? v)
      nil

      (isa? base-type :type/Integer)
      (bigint v)

      ;; any other number that's not an integer, should be a decimal/float
      (number? v)
      (bigdec v)

      :else v)))

(defn preprocess-incremental-query
  "Add checkpoint checkpoint filtering to a query for incremental execution.

  For native queries with a `checkpoint` template tag, adds the checkpoint as a parameter.
  For MBQL queries, adds a filter clause `WHERE checkpoint_column > checkpoint`.
  Returns the query unchanged on first run (no checkpoint) or for native queries without the checkpoint tag."
  [query source-incremental-strategy checkpoint]
  (if-let [checkpoint-value (next-checkpoint-value checkpoint)]
    (if (lib.query/native? query)
      ;; native query with explicit checkpoint filter
      (if (get-in query [:stages 0 :template-tags "checkpoint"])
        (update query :parameters conj
                {:type (if (number? checkpoint-value) :number :text)
                 :target [:variable [:template-tag "checkpoint"]]
                 :value checkpoint-value})
        query)
      ;; mbql query
      (lib/filter query (lib/> (source->checkpoint-filter-unique-key query source-incremental-strategy) checkpoint-value)))
    query))

(defn- post-process-incremental-query
  "Wrap a compiled native query with checkpoint filtering for native queries without explicit checkpoint tags.

  Generates SQL that wraps the original query as a subquery and filters by `checkpoint_filter > (checkpoint_query)`. "
  [outer-query driver {:keys [source-incremental-strategy] :as source} {checkpoint-query :query :as checkpoint}]
  (let [{:keys [checkpoint-filter]} source-incremental-strategy]
    (if (and (lib.query/native? (:query source))
             (not (get-in (:query source) [:stages 0 :template-tags "checkpoint"]))
             (next-checkpoint-value checkpoint))
      (let [wrap-query (fn [query]
                         (let [honeysql-query {:select [:*]
                                               :from [[[:raw (str "(" query ")")] :subquery]]
                                               :where [:> (h2x/identifier :field checkpoint-filter)
                                                       [:raw (str "(" (:query (qp.compile/compile checkpoint-query)) ")")]]}]
                           (first (sql.qp/format-honeysql driver honeysql-query))))]
        (update outer-query :query wrap-query))
      outer-query)))

(defn compile-source
  "Compile the source query of a transform to SQL, applying incremental filtering if required."
  [{:keys [source] :as transform}]
  (let [{:keys [source-incremental-strategy] query-type :type} source]
    (case (keyword query-type)
      :query
      (let [checkpoint (next-checkpoint transform)
            query (:query source)
            driver (some->> query :database (t2/select-one :model/Database) :engine keyword)]
        (binding [driver/*compile-with-inline-parameters*
                  (or (= :clickhouse driver)
                      driver/*compile-with-inline-parameters*)]
          (-> query
              (preprocess-incremental-query source-incremental-strategy checkpoint)
              massage-sql-query
              qp.compile/compile
              (post-process-incremental-query driver source checkpoint)))))))

(defn required-database-features
  "Returns the database features necessary to execute `transform`."
  [transform]
  (if (python-transform? transform)
    [:transforms/python]
    [:transforms/table]))

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

(defn rename-tables!
  "Rename multiple tables atomically within a transaction using the new driver/rename-tables method.
   This is a simpler, composable operation that only handles renaming."
  [driver database-id rename-map]
  (log/infof "Renaming tables: %s" (pr-str rename-map))
  (driver/rename-tables! driver database-id rename-map))

(defenterprise is-temp-transform-table?
  "Return true when `table` matches the transform temporary table naming pattern and transforms are enabled."
  :feature :transforms
  [table]
  (when-let [table-name (:name table)]
    (str/starts-with? (u/lower-case-en table-name) transform-temp-table-prefix)))

(defn db-routing-enabled?
  "Returns whether or not the given database is either a router or destination database"
  [db-or-id]
  (or (t2/exists? :model/DatabaseRouter :database_id (u/the-id db-or-id))
      (some->> (:router-database-id db-or-id)
               (t2/exists? :model/DatabaseRouter :database_id))))

;;; ------------------------------------------------- Source Table Resolution -----------------------------------------

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

(defn normalize-source-tables
  "Normalize source-tables to consistent map format {:database_id :schema :table :table_id}.

  The old format stored just integer table IDs. New transforms store maps on write.
  Old data is converted on read via transform-source-out for backwards compatibility.

  Throws if an integer table ID references a non-existent table.
  Map refs with non-existent tables get nil table_id (resolved later at execute time)."
  [source-tables]
  (let [int-table-ids    (into #{} (filter int?) (vals source-tables))
        int-id->metadata (when (seq int-table-ids)
                           (t2/select-pk->fn (fn [{:keys [db_id schema name]}]
                                               {:database_id db_id :schema schema :table name})
                                             [:model/Table :id :db_id :schema :name]
                                             :id [:in int-table-ids]))
        missing-ids      (when (seq int-table-ids)
                           (remove int-id->metadata int-table-ids))
        refs-needing-id  (filter missing-table-id? (vals source-tables))
        ref-lookup       (or (batch-lookup-table-ids refs-needing-id) {})]
    (when (seq missing-ids)
      (throw (ex-info (str "Tables not found for ids: " (str/join ", " (sort missing-ids)))
                      {:table_ids (vec missing-ids)})))
    (update-vals source-tables
                 (fn [v]
                   (cond
                     (int? v)     (assoc (int-id->metadata v) :table_id v)
                     (:table_id v) v
                     :else        (assoc v :table_id (ref-lookup (source-table-ref->key v))))))))

(defn resolve-source-tables
  "Resolve source-tables to {alias -> table_id}. Throws if any table not found.
  For execute time - all entries must resolve to valid table IDs.
  Handles both integer IDs (old format) and map refs (new format)."
  [source-tables]
  (let [needs-lookup (filter missing-table-id? (vals source-tables))
        lookup       (or (batch-lookup-table-ids needs-lookup) {})
        resolved     (u/for-map [[alias v] source-tables]
                       [alias (if (int? v)
                                v
                                (or (:table_id v) (lookup (source-table-ref->key v))))])
        unresolved   (for [[alias table-id] resolved
                           :when (nil? table-id)
                           :let [v (get source-tables alias)]]
                       {:alias alias
                        :table (if-let [schema (:schema v)]
                                 (str schema "." (:table v))
                                 (:table v))
                        :ref   v})]
    (when (seq unresolved)
      (throw (ex-info (str "Tables not found: " (str/join ", " (map :table unresolved)))
                      {:unresolved unresolved
                       :transform-message "Input table not found"})))
    resolved))

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

(def ^:private metabase-index-prefix "mb_transform_idx_")

(defn- incremental-filter-index-name [schema table-name filter-column-name]
  (let [prefix metabase-index-prefix
        suffix (codecs/bytes->hex (buddy-hash/md5 (str/join "|" [schema table-name filter-column-name])))]
    (str prefix suffix)))

(defn- should-index-incremental-filter-column? [driver database]
  (and (driver.u/supports? driver :describe-indexes database)
       (driver.u/supports? driver :transforms/index-ddl database)))

(defn- metabase-owned-index? [index]
  (str/starts-with? (:index-name index) metabase-index-prefix))

(defn- metabase-incremental-filter-index [filter-column target]
  (let [table-name  (:name target)
        schema      (:schema target)
        filter-name (:name filter-column)]
    ;; match the schema used by describe-table-indexes (:value denotes the column name, assumed leading column if a composite index)
    {:index-name (incremental-filter-index-name schema table-name filter-name)
     :value      filter-name}))

(defn- decide-secondary-index-ddl
  "Decides which indexes should be dropped/created on the target table.

  e.g. Indexing the incremental :filter-column to accelerate MAX(target.checkpoint) queries on OLTP databases.

  Indexes are represented as maps with at least the keys :index-name, :value.
  This matches the form used by [[metabase.driver/describe-table-indexes]].

  Returns a map:
  :drop   - a vector of indexes that are redundant and should be dropped.
  :create - a vector of desirable indexes that do not exist and that should be created.

  Notes:
  - If user covering indexes exist they should be reused.
  - Will never drop user indexes.
  - Indexes we previously created and are no longer required are dropped."
  [{:keys [filter-column indexes target database]}]
  (let [[mb-indexes user-indexes] ((juxt filter remove) metabase-owned-index? indexes)
        default-mb-index    (when filter-column (metabase-incremental-filter-index filter-column target))
        column-name         (:name filter-column)
        existing-user-index (first (filter #(= (:value %) column-name) user-indexes))
        existing-mb-index   (first (filter #(= (:index-name %) (:index-name default-mb-index)) mb-indexes))
        driver              (:engine database)
        intended-index      (when (should-index-incremental-filter-column? driver database)
                              ;; Prefer reuse to not create redundant indexes
                              (or existing-user-index default-mb-index))
        drop                (if intended-index
                              (remove #(= (:index-name intended-index) (:index-name %)) mb-indexes)
                              mb-indexes)
        create              (when (and intended-index
                                       (not= (:index-name intended-index) (:index-name existing-user-index))
                                       (not= (:index-name intended-index) (:index-name existing-mb-index)))
                              [intended-index])]
    {:drop   (vec drop)
     :create (vec create)}))

(defn execute-secondary-index-ddl-if-required!
  "If target table index modifications are required, executes those CREATE/DROP commands.
  See [[metabase.transforms-util/decide-secondary-index-ddl]] for details."
  [transform run-id database target]
  (when (driver.u/supports? (:engine database) :describe-indexes database)
    (let [driver     (:engine database)
          indexes    (driver/describe-table-indexes driver database target)
          checkpoint (next-checkpoint transform)
          {:keys [drop create]}
          (decide-secondary-index-ddl
           {:filter-column (:filter-column checkpoint)
            :database      database
            :target        target
            :indexes       indexes})]
      (doseq [{:keys [index-name value]} drop]
        (transforms.instrumentation/with-stage-timing [run-id [:import :drop-incremental-filter-index]]
          (log/infof "Dropping secondary index %s(%s) for target %s" index-name value (pr-str target))
          (driver/drop-index! driver (:id database) (:schema target) (:name target) index-name)))
      (doseq [{:keys [index-name value]} create]
        (transforms.instrumentation/with-stage-timing [run-id [:import :create-incremental-filter-index]]
          (log/infof "Creating secondary index %s(%s) for target %s" index-name value (pr-str target))
          (driver/create-index! driver (:id database) (:schema target) (:name target) index-name [value]))))))

(mu/defn handle-transform-complete!
  "Handles followup tasks for when a transform has completed.

  Specifically, this syncs the target db, publishes a `:event/transform-run-complete` event, and potentially updates
  the target table's index.

  See [[metabase.transforms-util/decide-secondary-index-ddl]] for details on the index handling."
  [& {:keys [run-id transform db]}
   :- [:map
       [:run-id ::transforms.schema/run-id]
       [:transform ::transforms.schema/transform]
       [:db [:fn {:error/message "Must a t2 database object"} #(= (t2/model %) :model/Database)]]]]
  (let [target (:target transform)]
    (transforms.instrumentation/with-stage-timing [run-id [:import :table-sync]]
      (sync-target! target db)
      ;; This event must be published only after the sync is complete - the new table needs to be in AppDB.
      (events/publish-event! :event/transform-run-complete
                             {:object {:db-id (:id db)
                                       :transform-id (:id transform)
                                       :transform-type (keyword (:type target))
                                       :output-schema (:schema target)
                                       :output-table (qualified-table-name (:engine db) target)}})
      ;; Creating an index after sync means the filter column is known in the appdb.
      ;; The index would be synced the next time sync runs, but at time of writing, index sync is disabled.
      (execute-secondary-index-ddl-if-required! transform run-id db target))))
