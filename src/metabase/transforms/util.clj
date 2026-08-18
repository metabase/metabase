(ns metabase.transforms.util
  "Transform utilities for scheduled execution.

   Most pure utilities are in metabase.transforms-base.util and re-exported here.
   This namespace adds scheduled-execution-specific functions that depend on
   transform_run tracking, cancellation, instrumentation, and feature gating."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.util :as driver.u]
   [metabase.indexes.models.table-index :as table-index]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Feature Gating -------------------------------------------------

(defn check-feature-enabled
  "Checking whether we have proper feature flags for using a given transform."
  [transform]
  (cond
    (transforms-base.u/query-transform? transform) (premium-features/query-transforms-enabled?)
    (transforms-base.u/python-transform? transform) (premium-features/python-transforms-enabled?)
    :else false))

(defn enabled-source-types-for-user
  "Returns set of enabled source types for WHERE clause filtering."
  []
  (when (api/is-data-analyst?)
    (transforms.gating/enabled-source-types)))

(defn- source-query-references
  "The Cards and Snippets a query transform's `source` names in its template tags, and the Tables it reads, as a
  `{model #{id}}` map. Each is spliced into the compiled SQL and carries a permission of its own that access to
  the source database doesn't extend to. Only what the query names; the raw SQL text around them isn't parsed.

  Empty when the query isn't MBQL 5. A source that reaches a permission check through the API or the app DB is
  normalized, apart from one whose database is unset: [[source-tables-readable?]] refuses that before consulting
  references, and execution fails on the missing database immediately after reaching here."
  [source]
  (let [query (:query source)]
    (when (= :mbql/query (:lib/type query))
      {:model/Card               (into #{} (keep :card-id) (lib/all-template-tags query))
       :model/Table              (into (set (lib/all-source-table-ids query))
                                       (lib/all-template-tag-table-ids query))
       :model/NativeQuerySnippet (lib/all-template-tag-snippet-ids query)})))

(defn- reference-readable?
  "Whether the current user may use `instance`: reading a Card or a Snippet is what lets a query splice it in,
  while a Table has to be queryable, not merely visible."
  [model instance]
  (case model
    (:model/Card :model/NativeQuerySnippet) (mi/can-read? instance)
    :model/Table                            (mi/can-query? instance)))

(defn- model-resolver
  "How a permission check looks an entity up: out of `models-cache` when [[prefetch-source-models]] loaded one,
  from the app DB otherwise."
  [models-cache]
  (fn [model id]
    (if models-cache
      (get-in models-cache [model id])
      (t2/select-one model id))))

(defn- references-readable?
  "Whether the current user may read every entity [[source-query-references]] finds in `source`. A reference that
  no longer resolves counts as unreadable, so it fails closed."
  [source resolve*]
  (every? (fn [[model ids]]
            (every? #(boolean (some->> (resolve* model %) (reference-readable? model))) ids))
          (source-query-references source)))

(defn source-references-readable?
  "Whether the current user may read every entity `transform`'s source query names.

  Separate from [[source-tables-readable?]] on purpose: reading a transform tells you it exists and what it is
  called, which the source database alone covers, while writing one or running it makes its query read those
  entities. So this gates create, write and execution rather than read."
  ([transform] (source-references-readable? transform nil))
  ([transform models-cache]
   (references-readable? (:source transform) (model-resolver models-cache))))

(defn source-tables-readable?
  "Check if the source tables/database in a transform are readable by the current user.
  Returns true if the user can query all source tables (for python transforms) or the
  source database (for query transforms). Returns false if the referenced source database
  no longer exists.

  What the query itself names is checked separately, by [[source-references-readable?]]."
  ([transform] (source-tables-readable? transform nil))
  ([transform models-cache]
   (let [resolve* (model-resolver models-cache)
         source   (:source transform)]
     (case (keyword (:type source))
       :query
       (if-let [db-id (get-in source [:query :database])]
         (if-let [db (resolve* :model/Database db-id)]
           (and (boolean (mi/can-query? db))
                (source-references-readable? transform models-cache))
           false)
         false)

       :python
       (let [source-tables (:source-tables source)]
         (if (empty? source-tables)
           true
           (let [table-ids (into [] (keep :table_id) source-tables)]
             (and (seq table-ids)
                  (every? (fn [table-id]
                            (when-let [table (resolve* :model/Table table-id)]
                              (mi/can-query? table)))
                          table-ids)))))

       (throw (ex-info (str "Unknown transform source type: " (:type source)) {}))))))

(defn- index-by-id
  "`{id instance}` for the `ids` of `model`, or nil when there are none to load."
  [model ids]
  (when (seq ids)
    (t2/select-pk->fn identity model :id [:in ids])))

(defn prefetch-source-models
  "Bulk-load the entities `transforms` reference into a `{model {id instance}}` map for
  [[source-tables-readable?]] to resolve against, so checking N transforms doesn't query per transform.

  An id missing from the map reads as a missing entity, and so as unreadable -- whatever that check consults has
  to be loaded here."
  [transforms]
  (let [references (map (comp source-query-references :source) transforms)
        referenced (fn [model] (into #{} (mapcat model) references))
        db-ids     (into #{} (keep #(get-in % [:source :query :database])) transforms)
        table-ids  (into (referenced :model/Table)
                         (mapcat #(keep :table_id (get-in % [:source :source-tables])))
                         transforms)]
    {:model/Database           (index-by-id :model/Database db-ids)
     :model/Table              (index-by-id :model/Table table-ids)
     :model/Card               (index-by-id :model/Card (referenced :model/Card))
     :model/NativeQuerySnippet (index-by-id :model/NativeQuerySnippet (referenced :model/NativeQuerySnippet))}))

(defn add-source-readable
  "Add :source_readable field to a transform or collection of transforms.
  The field indicates whether the current user can read the source tables/database
  referenced by the transform."
  [transform-or-transforms]
  (if (sequential? transform-or-transforms)
    (mapv #(assoc % :source_readable (source-tables-readable? %))
          transform-or-transforms)
    (assoc transform-or-transforms :source_readable (source-tables-readable? transform-or-transforms))))

(defn check-source-references-readable!
  "Throw a 403 unless the current user may read every entity `transform`'s source query names -- see
  [[source-tables-readable?]]. A no-op when no user is bound, so a scheduled run is unaffected.

  Transforms compile and run their source query directly rather than through `qp.execute/run`, so the check is
  made here."
  [transform]
  (when api/*current-user-id*
    (api/check-403 (source-references-readable? transform))
    nil))

;;; ------------------------------------------------- Scheduled Execution -------------------------------------------------

(defn duplicate-key-violation?
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
   If `user-id` is provided, it will be stored with the run for attribution purposes.
   `parent-run`, when provided, links the run to its coordinating run as a `[type id]` tuple:
   `[:job id]` is stored in `job_run_id`, `[:dag id]` in `dag_run_id`."
  [id run-method user-id & {:keys [parent-run]}]
  (let [[parent-type parent-id] parent-run]
    (try
      (transform-run/start-run! id (cond-> {:run_method run-method}
                                     user-id                (assoc :user_id user-id)
                                     (= parent-type :job)   (assoc :job_run_id parent-id)
                                     (= parent-type :dag)   (assoc :dag_run_id parent-id)))
      (catch Exception e
        (if (duplicate-key-violation? e)
          (throw (ex-info "Transform is already running"
                          {:error        :already-running
                           :transform-id id}
                          e))
          (throw e))))))

(defn run-cancelable-transform!
  "Execute a transform with cancellation support and proper error handling.

  Computes `source-range-params` once upfront, saves them to the run record, and passes them
  to `run-transform!` which receives `cancel-chan` and `source-range-params` as arguments.

  Options:
  - `:ex-message-fn` change how caught exceptions are presented to the user in run logs, by default the same as clojure.core/ex-message"
  [run-id transform driver {:keys [db-id conn-spec output-schema]} run-transform! & {:keys [ex-message-fn] :or {ex-message-fn ex-message}}]
  ;; local run is responsible for status, using canceling lifecycle
  (let [cancel-chan          (a/promise-chan)
        transform-timeout    (transforms.settings/transform-timeout)
        transform-timeout-ms (u/minutes->ms transform-timeout)]
    (canceling/with-cancelation [run-id cancel-chan transform-timeout]
      (try
        (let [source-range-params (transforms-base.u/get-source-range-params transform)
              full-incremental?   (transforms-base.u/full-incremental-run? transform)
              full-create?        (transforms-base.u/full-create-run? transform)
              ;; Efficiency metrics (rows-available / rows-processed) are only meaningful when this run's
              ;; rows-affected count can be trusted. On drivers that declare
              ;; `:transforms/accurate-rows-affected` false, a full-rebuild (CTAS) run reports a bogus
              ;; count, so we skip emitting efficiency metrics for those runs entirely. The INSERT path's
              ;; count is accurate even on those drivers.
              reliable-row-count? (or (driver.u/supports? driver :transforms/accurate-rows-affected
                                                          {:lib/type :metadata/database :id db-id})
                                      (not full-incremental?))]
          (when (and (not (str/blank? output-schema))
                     (not (driver/schema-exists? driver db-id output-schema)))
            (driver/create-schema-if-needed! driver conn-spec output-schema))
          (transforms-base.u/save-run-checkpoint-range! run-id source-range-params)
          (when-let [{:keys [rows-available] :as srp} source-range-params]
            (tracing/add-span-attrs! :tasks
                                     (cond-> (transforms-base.u/checkpoint-span-attrs srp)
                                       (and reliable-row-count? rows-available)
                                       (assoc :transform/rows-available rows-available))))
          (let [ret (driver.conn/with-transform-connection
                      ;; Route through the `:transform` JDBC pool, whose `unreturnedConnectionTimeout` will be set
                      ;; from the `*query-timeout-ms*` binding below at pool-creation time. This keeps the default
                      ;; pool's leak-detector at `MB_DB_QUERY_TIMEOUT_MINUTES` for all non-transform traffic.
                      (binding [qp.pipeline/*canceled-chan*          cancel-chan
                                driver.settings/*query-timeout-ms*   transform-timeout-ms
                                ;; Match the query timeout so a single slow socket read (or a driver that waits for
                                ;; the full server-side query) does not get killed before the transform's own deadline.
                                driver.settings/*network-timeout-ms* (max driver.settings/*network-timeout-ms*
                                                                          transform-timeout-ms)]
                        (run-transform! cancel-chan source-range-params)))]
            (when full-create?
              ;; Before the watermark/succeed mark, so a failure hits the catch below and fails the run (and a retry
              ;; stays a full rebuild that re-attempts the index).
              (let [running-indexes (table-index/mark-runnable-indexes-running!
                                     (:index-request-ids (:target transform)))]
                (try
                  (transforms-base.u/apply-target-indexes! transform)
                  (transforms-base.u/verify-managed-indexes! transform)
                  (finally
                    ;; Fail any request verification couldn't settle -- whether apply/verify threw or just left it
                    ;; running. On a throw the exception still propagates to the run-level catch.
                    (table-index/mark-unverified-running-indexes-failed!
                     running-indexes
                     "Index status could not be verified after the transform completed.")))))
            (transforms-base.u/save-watermark! (:id transform) source-range-params)
            (transform-run/succeed-started-run! run-id)
            ;; Narrow try/catch so an emission throw doesn't trigger the outer catch's
            ;; fail-started-run! after succeed-started-run! has already fired.
            (when reliable-row-count?
              (try
                (when-some [rows-available (:rows-available source-range-params)]
                  (when-some [rp (:rows-affected (:result ret))]
                    (tracing/add-span-attrs! :tasks {:transform/rows-processed rp})
                    (transforms.instrumentation/record-incremental-rows!
                     rows-available
                     rp
                     full-incremental?)))
                (catch Throwable t
                  (log/warnf "Failed to emit incremental-rows metric for transform %s: %s" (:id transform) (ex-message t)))))
            ret))
        (catch Throwable t
          (if (:timeout (ex-data t))
            (transform-run/timeout-run! run-id {:message (ex-message-fn t)})
            (transform-run/fail-started-run! run-id {:message (ex-message-fn t)}))
          (throw t))))))

(defn is-temp-transform-table?
  "Return true when `table` matches the transform temporary table naming pattern and transforms are enabled."
  [table]
  (boolean
   (when-let [table-name (and (premium-features/any-transforms-enabled?) (:name table))]
     (str/starts-with? (u/lower-case-en table-name) driver.u/transform-temp-table-prefix))))
