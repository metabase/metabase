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

(defn source-tables-readable?
  "Check if the source tables/database in a transform are readable by the current user.
  Returns true if the user can query all source tables (for python transforms) or the
  source database (for query transforms). Returns false if the referenced source database
  no longer exists."
  ([transform] (source-tables-readable? transform nil))
  ([transform models-cache]
   (let [resolve* (fn [model id]
                    (if models-cache
                      (get-in models-cache [model id])
                      (t2/select-one model id)))
         source   (:source transform)]
     (case (keyword (:type source))
       :query
       (if-let [db-id (get-in source [:query :database])]
         (if-let [db (resolve* :model/Database db-id)]
           (boolean (mi/can-query? db))
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

(defn prefetch-source-models
  "Bulk-load the source databases and tables referenced by `transforms` into a
  `{:model/Database {id db} :model/Table {id table}}` map"
  [transforms]
  (let [db-ids    (into #{} (keep #(get-in % [:source :query :database])) transforms)
        table-ids (into #{} (mapcat #(keep :table_id (get-in % [:source :source-tables]))) transforms)]
    {:model/Database (when (seq db-ids)
                       (u/index-by :id (t2/select :model/Database :id [:in db-ids])))
     :model/Table    (when (seq table-ids)
                       (u/index-by :id (t2/select :model/Table :id [:in table-ids])))}))

(defn add-source-readable
  "Add :source_readable field to a transform or collection of transforms.
  The field indicates whether the current user can read the source tables/database
  referenced by the transform."
  [transform-or-transforms]
  (if (sequential? transform-or-transforms)
    (mapv #(assoc % :source_readable (source-tables-readable? %))
          transform-or-transforms)
    (assoc transform-or-transforms :source_readable (source-tables-readable? transform-or-transforms))))

;;; ------------------------------------------------- Scheduled Execution -------------------------------------------------

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
   If `user-id` is provided, it will be stored with the run for attribution purposes.
   If `job-run-id` is provided, it will be stored with the run to link it to its parent job run."
  [id run-method user-id & {:keys [job-run-id]}]
  (try
    (transform-run/start-run! id (cond-> {:run_method run-method}
                                   user-id    (assoc :user_id user-id)
                                   job-run-id (assoc :job_run_id job-run-id)))
    (catch Exception e
      (if (duplicate-key-violation? e)
        (throw (ex-info "Transform is already running"
                        {:error        :already-running
                         :transform-id id}
                        e))
        (throw e)))))

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
                                driver.settings/*network-timeout-ms* (max driver.settings/*network-timeout-ms* transform-timeout-ms)]
                        (run-transform! cancel-chan source-range-params)))]
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
                  (log/warnf t "Failed to emit incremental-rows metric for transform %s" (:id transform)))))
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
