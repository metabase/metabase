(ns metabase.transforms-base.util
  "Transform utility functions without transform_run lifecycle dependencies.
  Functions here depend on driver, lib, query-processor, and standard utils.
  Some functions perform read-only database queries (e.g. table lookups) but none
  write transform_run rows or trigger sync/event side-effects."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-remaps :as remap]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (java.util Date)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Type Predicates --------------------------------------------------

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

;;; ------------------------------------------------- Query Helpers ----------------------------------------------------

(defn massage-sql-query
  "Adjusts mbql query for use in a transform."
  [query]
  (-> query
      remap/disable-remaps
      lib/disable-default-limit))

(defn supported-incremental-filter-type?
  "Returns true if the given base-type is supported for incremental filtering.

  We only support temporal (timestamp/tz) and numeric (int/float) types."
  [base-type]
  (or (isa? base-type :type/Temporal)
      (isa? base-type :type/Number)))

(defn source->checkpoint-filter-unique-key
  "Extract the checkpoint filter column from `query` using the unique key specified in `source-incremental-strategy`."
  [query source-incremental-strategy]
  (some->> source-incremental-strategy :checkpoint-filter-unique-key (lib/column-with-unique-key query)))

(defn required-database-features
  "Returns the database features necessary to execute `transform`."
  [transform]
  (if (python-transform? transform)
    [:transforms/python]
    [:transforms/table]))

;;; ------------------------------------------------- Incremental Query ------------------------------------------------

(defn next-checkpoint-value
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
    (if (lib/native? query)
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

;;; ------------------------------------------------- Timestamps ------------------------------------------------------

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

;;; ------------------------------------------------- Table Schema / DDL -----------------------------------------------

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

;;; ------------------------------------------------- Filter Transducers -----------------------------------------------

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

;;; ------------------------------------------------- Source Table Resolution -------------------------------------------

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

(defn source-table-ref->key
  "Convert a source table ref map to a lookup key [db_id schema name]."
  [{:keys [database_id schema table]}]
  [database_id schema table])

(defn missing-table-id?
  "Returns true if `v` is a source table ref map that needs table_id lookup."
  [v]
  (and (map? v) (nil? (:table_id v))))

(defn target-table-exists?
  "Test if the target table of a transform already exists."
  [{:keys [target] :as transform}]
  (let [db-id (transforms-base.i/target-db-id transform)
        {driver :engine :as database} (t2/select-one :model/Database db-id)]
    (driver/table-exists? driver database target)))

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

;;; ------------------------------------------------- Index DDL --------------------------------------------------------

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

(defn decide-secondary-index-ddl
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
