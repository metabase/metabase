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
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.models.transforms.transform-run :as transform-run]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Feature Gating -------------------------------------------------

(defn check-feature-enabled
  "Checking whether we have proper feature flags for using a given transform."
  [transform]
  (cond
    (transforms-base.u/query-transform? transform) (transforms.gating/query-transforms-enabled?)
    (transforms-base.u/python-transform? transform) (transforms.gating/python-transforms-enabled?)
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
          (let [table-ids (into [] (keep :table_id) source-tables)]
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
      (if (:timeout (ex-data t))
        (transform-run/timeout-run! run-id {:message (ex-message-fn t)})
        (transform-run/fail-started-run! run-id {:message (ex-message-fn t)}))
      (throw t))
    (finally
      (canceling/chan-end-run! run-id))))

(defn is-temp-transform-table?
  "Return true when `table` matches the transform temporary table naming pattern and transforms are enabled."
  [table]
  (boolean
   (when-let [table-name (and (transforms.gating/any-transforms-enabled?) (:name table))]
     (str/starts-with? (u/lower-case-en table-name) driver.u/transform-temp-table-prefix))))
