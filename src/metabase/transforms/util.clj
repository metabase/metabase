(ns metabase.transforms.util
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.models.transforms.transform-run :as transform-run]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.add-remaps :as remap]
   [metabase.query-processor.middleware.catch-exceptions :as qp.catch-exceptions]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.sync.core :as sync]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.formatting.date :as fmt.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLException)
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZoneId ZoneOffset ZonedDateTime)
   (java.util Date)))

(set! *warn-on-reflection* true)

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
  (cond
    (query-transform? transform) (transforms.gating/query-transforms-enabled?)
    (python-transform? transform) (transforms.gating/python-transforms-enabled?)
    :else false))

(defn enabled-source-types-for-user
  "Returns set of enabled source types for WHERE clause filtering."
  []
  (when (api/is-data-analyst?)
    (transforms.gating/enabled-source-types)))

(defn source-tables-readable?
  "Check if the source tables/database in a transform are readable by the current user.
  Returns true if the user can query all source tables (for python transforms) or the
  source database (for query transforms)."
  [transform]
  (let [source (:source transform)]
    (case (keyword (:type source))
      :query
      (if-let [db-id (get-in source [:query :database])]
        (boolean (mi/can-query? (t2/select-one :model/Database db-id)))
        false)

      :python
      (let [source-tables (:source-tables source)]
        (if (empty? source-tables)
          true
          (let [table-ids (into []
                                (comp (map val)
                                      (map #(cond
                                              (int? %) %
                                              (map? %) (:table_id %)
                                              :else nil))
                                      (filter some?))
                                source-tables)]
            (and (seq table-ids)
                 (every? (fn [table-id]
                           (when-let [table (t2/select-one :model/Table table-id)]
                             (mi/can-query? table)))
                         table-ids)))))

      (throw (ex-info (str "Unknown transform source type: " (:type source)) {})))))

(defn add-source-readable
  "Add :source_readable field to a transform or collection of transforms.
  The field indicates whether the current user can read the source tables/database
  referenced by the transform."
  [transform-or-transforms]
  (if (sequential? transform-or-transforms)
    (mapv #(assoc % :source_readable (source-tables-readable? %))
          transform-or-transforms)
    (assoc transform-or-transforms :source_readable (source-tables-readable? transform-or-transforms))))

(defn- duplicate-key-violation?
  "Check if an exception is a duplicate key violation.
   Returns true for Postgres, MySQL/MariaDB, and H2 duplicate key errors."
  [e]
  (or (and (instance? SQLException e)
           (let [sql-state (sql-jdbc/get-sql-state e)]
             (str/starts-with? sql-state "23")))
      (some-> (ex-cause e) duplicate-key-violation?)))

(defn try-start-unless-already-running
  "Start a transform run. Throws ex-info with {:error :already-running} if another
   run is already active (duplicate key violation). Other errors are rethrown.
   If `user-id` is provided, it will be stored with the run for attribution purposes."
  [id run-method user-id]
  (try
    (transform-run/start-run! id (cond-> {:run_method run-method}
                                   user-id (assoc :user_id user-id)))
    (catch Exception e
      (if (duplicate-key-violation? e)
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
  (-> query
      remap/disable-remaps
      lib/disable-default-limit))

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

  Supports three strategies:
  - field-id: MBQL/Python transforms with field ID from source table
  - unique-key: Legacy MBQL/Python or native query fallback
  - checkpoint-filter: Native queries with plain column name

  Validates that the resolved column has a supported type for checkpoint filtering (numeric or temporal).
  Throws an exception if the column type is not supported."
  [query source-incremental-strategy table metadata-provider]
  (let [{:keys [checkpoint-filter checkpoint-filter-unique-key checkpoint-filter-field-id]}
        source-incremental-strategy]
    (when-some [{column-name :name
                 :keys [base-type]
                 :as column}
                (cond
                  ;; New approach: field-id for MBQL/Python
                  checkpoint-filter-field-id
                  (lib.metadata/field metadata-provider checkpoint-filter-field-id)

                  ;; Existing approaches: unique-key or column name
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

(defn- build-filtered-subquery
  "Build a HoneySQL subquery for a table tag with incremental filtering applied.

   Returns [sql & params]"
  [table-metadata checkpoint-column source-range-params driver]
  (let [{:keys [schema name]} table-metadata
        table-hsql (if schema
                     [(keyword schema name)]
                     [(keyword name)])
        col-name   (:name checkpoint-column)
        col-hsql   (keyword col-name)
        {:keys [lo hi]} source-range-params
        base-query {:select [:*]
                    :from   table-hsql}
        ;; Build WHERE clause: > lo AND <= hi
        where-clause (cond
                       (and lo hi)
                       [:and
                        [:> col-hsql [:lift (:value lo)]]
                        [:<= col-hsql [:lift (:value hi)]]]

                       lo
                       [:> col-hsql [:lift (:value lo)]]

                       hi
                       [:<= col-hsql [:lift (:value hi)]]

                       :else nil)
        filtered (cond-> base-query
                   where-clause (assoc :where where-clause
                                       :order-by [[col-hsql :asc]]))]
    (sql.qp/format-honeysql driver filtered)))

(defn- expand-table-tag-to-subquery
  "Expand the table template tag containing the checkpoint field to a filtered subquery.

   For queries with multiple table tags, only the tag referencing the table that contains
   the checkpoint field is expanded. Other table tags are processed normally by the QP.

   Finds the table tag matching the checkpoint field's table, builds a filtered subquery,
   replaces {{tag}} in SQL with the subquery, and prepends subquery params to the param list."
  [query source-range-params]
  (let [template-tags       (get-in query [:stages 0 :template-tags])
        checkpoint-field-id (:checkpoint-filter-field-id source-range-params)
        _                   (when-not checkpoint-field-id
                              (throw (ex-info "No checkpoint-filter-field-id in source-range-params"
                                              {:source-range-params source-range-params})))
        db-id               (:database query)
        metadata-provider   (lib-be/application-database-metadata-provider db-id)
        checkpoint-column   (lib.metadata/field metadata-provider checkpoint-field-id)
        checkpoint-table-id (:table-id checkpoint-column)
        ;; Find the table tag that references the checkpoint field's table
        table-tag           (some (fn [[k v]]
                                    (when (and (#{:table "table"} (:type v))
                                               (= checkpoint-table-id (:table-id v)))
                                      [k v]))
                                  template-tags)
        _                   (when-not table-tag
                              (throw (ex-info "No table template tag found for checkpoint field's table"
                                              {:checkpoint-table-id checkpoint-table-id
                                               :template-tags       template-tags})))
        [tag-name _tag-value] table-tag
        driver              (some->> db-id (t2/select-one :model/Database) :engine keyword)
        table-metadata      (lib.metadata/table metadata-provider checkpoint-table-id)
        [sql & params] (build-filtered-subquery table-metadata checkpoint-column source-range-params driver)
        native-sql          (get-in query [:stages 0 :native])
        ;; Replace {{tag-name}} with (subquery-sql)
        expanded-sql        (str/replace native-sql
                                         (re-pattern (str "\\{\\{" tag-name "\\}\\}"))
                                         (str "(" sql ")"))
        ;; Remove the table tag from template-tags since we've expanded it
        ;; Other table tags remain and will be processed by QP normally
        updated-tags        (dissoc template-tags tag-name)]
    (-> query
        (assoc-in [:stages 0 :native] expanded-sql)
        (assoc-in [:stages 0 :template-tags] updated-tags)
        (assoc ::subquery-params params))))

(defn preprocess-incremental-query
  "Add checkpoint filtering to a query for incremental execution.

   For native queries, expands the table tag containing the checkpoint field to a filtered subquery.
   For MBQL queries, adds filter clauses `WHERE checkpoint_column > lo AND checkpoint_column <= hi`.
   Returns the query unchanged when source-range-params is nil."
  [query source-range-params]
  (if source-range-params
    (if (lib/native? query)
      ;; Native: expand table tag to filtered subquery
      (expand-table-tag-to-subquery query source-range-params)
      ;; MBQL: add filter clauses
      (cond-> query
        (:lo source-range-params) (lib/filter (lib/>  (:column source-range-params) (:value (:lo source-range-params))))
        (:hi source-range-params) (lib/filter (lib/<= (:column source-range-params) (:value (:hi source-range-params))))))
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

(defn- parse-datetime [^String s] (u.date/parse s))

(defn- serialize-checkpoint-value [type value]
  (case type
    "DateTime" (fmt.date/datetime->iso-string value)
    nil nil
    (str value)))

(defn save-watermark!
  "Commits the incremental transforms :hi watermark value to the appdb."
  [transform-id source-range-params]
  (t2/update! :model/Transform
              transform-id
              {:last_checkpoint_type  (:type (:hi source-range-params))
               :last_checkpoint_value (serialize-checkpoint-value (:type (:hi source-range-params)) (:value (:hi source-range-params)))}))

(defn- deserialize-checkpoint-value [last_checkpoint_type last_checkpoint_value]
  (case last_checkpoint_type
    "DateTime" (parse-datetime last_checkpoint_value)
    "Integer"  (bigint last_checkpoint_value)
    "Float"    (bigdec last_checkpoint_value)
    "Decimal"  (bigdec last_checkpoint_value)))

(defn- interpret-database-checkpoint-value [base-type qp-value]
  (case base-type
    :type/Integer  {:type "Integer",  :value  (bigint qp-value)}
    :type/Float    {:type "Float",    :value  (bigdec qp-value)}
    :type/Decimal  {:type "Decimal",  :value  (bigdec qp-value)}
    :type/DateTime {:type "DateTime", :value  (parse-datetime qp-value)}))

(defn- get-max-from-native-query
  "Compute MAX(checkpoint-col) from a native query by wrapping it in SELECT MAX().
   This preserves the user's query logic (LIMITs, filters, etc.).
   Reuses expand-table-tag-to-subquery with only lo filter (no hi) to avoid computing max of future data."
  [source-query checkpoint-column checkpoint-field-id lo]
  (let [db-id (:database source-query)
        driver (some->> db-id (t2/select-one :model/Database) :engine keyword)

        ;; Build source-range-params with only lo (no hi) - we're computing the new hi!
        range-params {:lo                         (when lo {:value lo})
                      :hi                         nil  ; No hi filter for watermark computation
                      :column                     checkpoint-column
                      :checkpoint-filter-field-id checkpoint-field-id}

        ;; Expand table tags using the same logic as execution
        ;; This replaces {{source_table}} with (SELECT * FROM table WHERE col > lo)
        expanded-query (expand-table-tag-to-subquery source-query range-params)

        ;; Get the expanded SQL and params
        expanded-sql (get-in expanded-query [:stages 0 :native])
        subquery-params (::subquery-params expanded-query)

        ;; Wrap the entire user query in SELECT MAX()
        col-name (:name checkpoint-column)
        col-kw (keyword col-name)
        max-query {:select [[[:max col-kw] :max]]
                   :from [[[:raw (str "(" expanded-sql ")")] :subquery]]}
        [max-sql & max-params] (sql.qp/format-honeysql driver max-query)

        ;; Combine params: subquery params + max params
        all-params (concat subquery-params (or max-params []))

        ;; Execute the query
        native-max-query {:database db-id
                          :type :native
                          :native {:query max-sql
                                   :params all-params}}
        result (qp/process-query native-max-query)]
    (some-> result :data :rows first first)))

(defn get-source-range-params
  "Returns information on the incremental range filters that ought to be applied to a source query.

  Returns a map:
   :column                     (the lib column value of the incremental filter column)
   :checkpoint-filter-field-id (the field ID of the checkpoint column)
   Range predicate terms (maps :type, :value), can be nil (in which case the filter clause should be omitted):
   :lo                         values in the source table must be > this :value.
   :hi                         values in the source table must be <= this :value."
  [{:keys [source] :as transform}]
  (let [{source-query :query, :keys [source-incremental-strategy]} source
        {:keys [checkpoint-filter-field-id]} source-incremental-strategy]
    (when checkpoint-filter-field-id
      (let [{:keys [last_checkpoint_type last_checkpoint_value]} transform
            db-id             (transforms.i/target-db-id transform)
            metadata-provider (lib-be/application-database-metadata-provider db-id)
            column            (lib.metadata/field metadata-provider checkpoint-filter-field-id)
            lo                (when last_checkpoint_type (deserialize-checkpoint-value last_checkpoint_type last_checkpoint_value))

            ;; Compute MAX differently for native vs MBQL queries
            [max-value base_type]
            (if (and source-query (lib/native? source-query))
              ;; Native: wrap the user's query in SELECT MAX() to preserve query logic
              [(get-max-from-native-query source-query column checkpoint-filter-field-id lo)
               (:base-type column)]

              ;; MBQL: use the existing logic
              (let [table-id          (:table-id column)
                    limit             (-> transform :source :limit)
                    table-metadata    (lib.metadata/table metadata-provider table-id)
                    base-query        (or source-query (lib/query metadata-provider table-metadata))
                    filtered-query    (if lo (lib/filter base-query (lib/> column lo)) base-query)
                    ;; if limited need to order by the column otherwise you will get the MAX for the first N rows in arbitrary order instead of top-k
                    limited-query     (if limit
                                        (-> (lib/order-by filtered-query column)
                                            (lib/limit limit))
                                        filtered-query)
                    query             (lib/aggregate (lib/append-stage limited-query) (lib/max column))
                    query-result      (qp/process-query query)
                    {:keys [results_metadata rows]} (:data query-result)
                    [{:keys [base_type]}] (:columns results_metadata)]
                [(ffirst rows) base_type]))

            hi max-value]
        {:column                     column
         :checkpoint-filter-field-id checkpoint-filter-field-id
         :lo                         (when last_checkpoint_type {:type last_checkpoint_type, :value lo})
         :hi                         (cond (some? hi) (interpret-database-checkpoint-value base_type hi)
                                           last_checkpoint_type {:type last_checkpoint_type, :value lo})}))))

(defn compile-source
  "Compile the source query of a transform to SQL, applying incremental filtering if required."
  [{:keys [source]} source-range-params]
  (let [{query-type :type} source]
    (assert (= :query query-type))
    (let [query  (:query source)
          driver (some->> query :database (t2/select-one :model/Database) :engine keyword)]
      (binding [driver/*compile-with-inline-parameters*
                (or (= :clickhouse driver)
                    driver/*compile-with-inline-parameters*)]
        (let [preprocessed (-> query
                               (preprocess-incremental-query source-range-params)
                               massage-sql-query)
              compiled     (qp.compile/compile preprocessed)]
          ;; Prepend subquery params before regular template tag params
          (if-let [subquery-params (::subquery-params preprocessed)]
            (update compiled :params #(into subquery-params %))
            compiled))))))

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

(defn rename-tables!
  "Rename multiple tables atomically within a transaction using the new driver/rename-tables method.
   This is a simpler, composable operation that only handles renaming."
  [driver database-id rename-map]
  (log/infof "Renaming tables: %s" (pr-str rename-map))
  (driver/rename-tables! driver database-id rename-map))

(defn is-temp-transform-table?
  "Return true when `table` matches the transform temporary table naming pattern and transforms are enabled."
  [table]
  (boolean
   (when-let [table-name (and (transforms.gating/any-transforms-enabled?) (:name table))]
     (str/starts-with? (u/lower-case-en table-name) driver.u/transform-temp-table-prefix))))

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

(mu/defn handle-transform-complete!
  "Handles followup tasks for when a transform has completed.

  Specifically, this syncs the target db and publishes a `:event/transform-run-complete` event."
  [& {:keys [run-id transform db]}
   :- [:map
       [:run-id ::transforms.schema/run-id]
       [:transform ::transforms.schema/transform]
       [:db [:fn {:error/message "Must a t2 database object"} #(= (t2/model %) :model/Database)]]]]
  (let [target (:target transform)]
    (transforms.instrumentation/with-stage-timing [run-id [:import :table-sync]]
      (when-let [table (sync-target! target db)]
        (t2/update! :model/Table (:id table) {:transform_id (:id transform)}))
      ;; This event must be published only after the sync is complete - the new table needs to be in AppDB.
      (events/publish-event! :event/transform-run-complete
                             {:object {:db-id (:id db)
                                       :transform-id (:id transform)
                                       :transform-type (keyword (:type target))
                                       :output-schema (:schema target)
                                       :output-table (qualified-table-name (:engine db) target)}}))))
