(ns metabase.transforms.util
  "Transform utilities for scheduled execution.

   Most pure utilities are in metabase.transforms-base.util and re-exported here.
   This namespace adds scheduled-execution-specific functions that depend on
   transform_run tracking, cancellation, instrumentation, and feature gating."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.util :as driver.u]
   [metabase.indexes.models.table-index :as table-index]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.schema :as transforms-base.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(mr/def ::source-models
  "The source Databases and Tables of some transforms by ID, as [[prefetch-source-models]] loads them."
  [:map {:closed true}
   [:model/Database [:maybe [:map-of ::lib.schema.id/database :metabase.warehouses.schema/database]]]
   [:model/Table    [:maybe [:map-of ::lib.schema.id/table :metabase.warehouse-schema.schema/table]]]])

(mu/defn ->definition :- ::transforms.schema/transform.definition
  "What the saved `transform`, or the one a create request carries, computes and where it writes."
  [transform :- [:or ::transforms.schema/transform ::transforms.schema/transform.create]]
  (select-keys transform [:name :description :source :target]))

;;; ------------------------------------------------- Feature Gating -------------------------------------------------

(mu/defn check-feature-enabled :- :boolean
  "Checking whether we have proper feature flags for using a given transform."
  [transform :- ::transforms.schema/transform.definition]
  (cond
    (transforms-base.u/query-transform? transform) (premium-features/query-transforms-enabled?)
    (transforms-base.u/python-transform? transform) (premium-features/python-transforms-enabled?)
    :else false))

(mu/defn- source-query-permissions-ok? :- :boolean
  "Whether the current user may run a query transform's source `query`, per the query processor's own permission
  check. The query is preprocessed first so references that only appear after expansion (cards, snippets) are
  checked too. Throws when no user is bound: every caller must establish one, a scheduled run included."
  [query :- :metabase.lib.schema/query]
  (when-not api/*current-user-id*
    (throw (ex-info "A transform needs to be run with a bound user"
                    {})))
  (try
    (qp.setup/with-qp-setup [query query]
      (qp.perms/check-query-permissions* (qp.preprocess/preprocess query))
      true)
    (catch Exception e
      ;; Only a permission refusal makes the source unreadable. A source that fails to preprocess for any
      ;; other reason (a missing required parameter, a malformed query, an inactive table) cannot run at all, and
      ;; rejecting it is left to validation and execution, which report the specific problem.
      (let [data (ex-data e)]
        (not (or (:permissions-error? data)
                 (= 403 (:status-code data))))))))

(mu/defn source-tables-readable? :- :boolean
  "Check if the source tables/database in a transform are readable by the current user.
  Returns true if the user can query all source tables (for python transforms) or the
  source database (for query transforms). Returns false if the referenced source database
  no longer exists."
  ([transform :- ::transforms.schema/transform.definition]
   (source-tables-readable? transform nil))
  ([transform    :- ::transforms.schema/transform.definition
    models-cache :- [:maybe ::source-models]]
   (let [resolve* (fn [model id]
                    (if models-cache
                      (get-in models-cache [model id])
                      (case model
                        :model/Database (transforms.db/database id)
                        :model/Table    (transforms.db/table id))))
         source   (:source transform)]
     (case (keyword (:type source))
       :query
       (if-let [db-id (get-in source [:query :database])]
         (if-let [db (resolve* :model/Database db-id)]
           (and (boolean (mi/can-query? db))
                (source-query-permissions-ok? (:query source)))
           false)
         false)

       :python
       (let [source-tables (:source-tables source)]
         (if (empty? source-tables)
           true
           (let [table-ids (into [] (keep :table_id) source-tables)]
             (boolean
              (and (seq table-ids)
                   (every? (fn [table-id]
                             (when-let [table (resolve* :model/Table table-id)]
                               (mi/can-query? table)))
                           table-ids))))))

       (throw (ex-info (str "Unknown transform source type: " (:type source)) {}))))))

(mu/defn check-source-query-permissions! :- :nil
  "Throw a 403 unless the current user may run `transform`'s source query -- see
  [[source-query-permissions-ok?]]. Requires a bound user; the execution path binds the user the run
  executes as before calling.

  Transforms compile and run their source query directly rather than through `qp.execute/run`, so the check is
  made here."
  [transform :- ::transforms-base.schema/transform]
  (api/check-403 (source-query-permissions-ok? (get-in transform [:source :query])))
  nil)

(mu/defn prefetch-source-models :- ::source-models
  "Bulk-load the source databases and tables referenced by `transforms` into a
  `{:model/Database {id db} :model/Table {id table}}` map"
  [transforms :- [:sequential ::transforms.schema/transform]]
  (let [db-ids    (into #{} (keep #(get-in % [:source :query :database])) transforms)
        table-ids (into #{} (mapcat #(keep :table_id (get-in % [:source :source-tables]))) transforms)]
    {:model/Database (when (seq db-ids)
                       (u/index-by :id (transforms.db/databases db-ids)))
     :model/Table    (when (seq table-ids)
                       (u/index-by :id (transforms.db/tables table-ids)))}))

(mu/defn add-source-readable :- [:or ::transforms.schema/transform [:sequential ::transforms.schema/transform]]
  "Add :source_readable field to a transform or collection of transforms.
  The field indicates whether the current user can read the source tables/database
  referenced by the transform."
  [transform-or-transforms :- [:or ::transforms.schema/transform [:sequential ::transforms.schema/transform]]]
  (if (sequential? transform-or-transforms)
    (mapv #(assoc % :source_readable (source-tables-readable? (->definition %)))
          transform-or-transforms)
    (assoc transform-or-transforms :source_readable (source-tables-readable? (->definition transform-or-transforms)))))

;;; ------------------------------------------------- Scheduled Execution -------------------------------------------------

(mu/defn duplicate-key-violation? :- :boolean
  "Check if an exception is a duplicate key violation.
   Returns true for Postgres, MySQL/MariaDB, and H2 duplicate key errors."
  [e :- [:maybe (ms/InstanceOfClass Throwable)]]
  (or (and (instance? SQLException e)
           (let [sql-state (sql-jdbc/get-sql-state e)]
             (str/starts-with? sql-state "23")))
      (some-> (ex-cause e) duplicate-key-violation?)))

(mu/defn try-start-unless-already-running :- ::transforms.schema/transform-run
  "Start a transform run. Throws ex-info with {:error :already-running} if another
   run is already active (duplicate key violation). Other errors are rethrown.
   If `user-id` is provided, it will be stored with the run for attribution purposes.
   `parent-run`, when provided, links the run to its coordinating run as a `[type id]` tuple:
   `[:job id]` is stored in `job_run_id`, `[:dag id]` in `dag_run_id`."
  [id          :- ::lib.schema.id/transform
   run-method  :- [:enum :manual :cron]
   user-id     :- [:maybe ::lib.schema.id/user]
   & {:keys [parent-run]} :- [:maybe [:map {:closed true}
                                      [:parent-run {:optional true} [:maybe [:tuple [:enum :job :dag] ms/PositiveInt]]]]]]
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

(mu/defn run-cancelable-transform! :- ::transforms-base.schema/execute-base-result
  "Execute a transform with cancellation support and proper error handling.

  Computes `source-range-params` once upfront, saves them to the run record, and passes them
  to `run-transform!` which receives `cancel-chan` and `source-range-params` as arguments.

  Options:
  - `:ex-message-fn` change how caught exceptions are presented to the user in run logs, by default the same as clojure.core/ex-message"
  [run-id    :- ms/PositiveInt
   transform :- ::transforms-base.schema/transform
   driver    :- :keyword
   {:keys [db-id conn-spec output-schema]} :- [:map {:closed true}
                                               [:db-id         ::lib.schema.id/database]
                                               [:conn-spec     (ms/InstanceOfClass clojure.lang.IPersistentMap)]
                                               [:output-schema [:maybe :string]]]
   run-transform! :- [:=> [:cat ::transforms-base.schema/chan [:maybe ::transforms-base.schema/source-range-params]]
                      ::transforms-base.schema/execute-base-result]
   & {:keys [ex-message-fn] :or {ex-message-fn ex-message}} :- [:maybe [:map {:closed true}
                                                                        [:ex-message-fn {:optional true} [:=> [:cat (ms/InstanceOfClass Throwable)] [:maybe :string]]]]]]
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
          (transforms-base.u/create-target-schema! driver db-id conn-spec output-schema)
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

(mu/defn is-temp-transform-table? :- :boolean
  "Return true when `table` matches the transform temporary table naming pattern and transforms are enabled."
  [table :- [:or :metabase.warehouse-schema.schema/table [:map {:closed true} [:name :string]]]]
  (boolean
   (when-let [table-name (and (premium-features/any-transforms-enabled?) (:name table))]
     (str/starts-with? (u/lower-case-en table-name) driver.u/transform-temp-table-prefix))))

(mu/defn source-readable? :- :boolean
  "Whether the current user may read `transform`, saved or not: its kind of transform is enabled, and the user is a
  superuser or a data analyst who may query its source, looked up in `models-cache` when given."
  ([transform :- ::transforms.schema/transform.definition]
   (source-readable? transform nil))
  ([transform    :- ::transforms.schema/transform.definition
    models-cache :- [:maybe ::source-models]]
   (boolean
    (and (check-feature-enabled transform)
         (or api/*is-superuser?*
             (and (api/entitled-data-analyst?)
                  (source-tables-readable? transform models-cache)))))))
