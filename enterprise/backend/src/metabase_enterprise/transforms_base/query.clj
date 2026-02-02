(ns metabase-enterprise.transforms-base.query
  "Base query transform execution - core logic without transform_run tracking.

   This namespace handles MBQL/native query transform execution and returns
   results in memory rather than writing to transform_run rows."
  (:require
   [metabase-enterprise.transforms-base.interface :as transforms-base.i]
   [metabase-enterprise.transforms-base.util :as transforms-base.util]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib.schema.common :as schema.common]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Interface Implementations -------------------------------------------------

(defmethod transforms-base.i/source-db-id :query
  [transform]
  (-> transform :source :query :database))

(defmethod transforms-base.i/target-db-id :query
  [transform]
  ;; For query transforms, the target needs to match the source, so use the query as the source of truth.
  (or (-> transform :source :query :database)
      ;; Fallback to using a configured value.
      (get-in transform [:target :database])
      (:target_db_id transform)))

;;; ------------------------------------------------- Schemas -------------------------------------------------

(mr/def ::transform-details
  [:map
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :table :table-incremental]]
   [:conn-spec :any]
   [:query ::qp.compile/compiled]
   [:output-table [:keyword {:decode/normalize schema.common/normalize-keyword}]]])

(mr/def ::transform-opts
  [:map
   [:overwrite? :boolean]])

;;; ------------------------------------------------- Helpers -------------------------------------------------

(defn- transform-opts [{:keys [transform-type]}]
  (case transform-type
    :table {:overwrite? true}
    ;; once we have more than just append, dispatch on :target-incremental-strategy
    :table-incremental {}))

;;; ------------------------------------------------- Base Execution -------------------------------------------------

(defn run-query-transform!
  "Execute query transform (MBQL/native). Returns result map.

   Does:
   - Compile query
   - Create schema if needed
   - Call driver/run-transform!
   - Sync target table
   - Manage secondary indexes

   Does NOT:
   - Create transform_run row
   - Update transform_run status

   Options:
   - `:cancelled?` - (fn [] boolean), polled to check for cancellation
   - `:run-id` - optional, for instrumentation (nil skips metrics)
   - `:with-stage-timing-fn` - optional, (fn [run-id stage thunk] result)

   Returns:
   {:status :succeeded | :failed | :cancelled
    :result <driver result>
    :error <exception if failed>}"
  [{:keys [id source target] :as transform}
   {:keys [cancelled? run-id with-stage-timing-fn]}]
  (try
    ;; Check cancellation before starting
    (when (and cancelled? (cancelled?))
      (throw (ex-info "Transform cancelled before start" {:status :cancelled})))

    (let [db (get-in source [:query :database])
          {driver :engine :as database} (t2/select-one :model/Database db)
          transform-details {:db-id db
                             :database database
                             :transform-id   id
                             :transform-type (keyword (:type target))
                             :conn-spec (driver/connection-spec driver database)
                             :query (transforms-base.util/compile-source transform)
                             :output-schema (:schema target)
                             :output-table (transforms-base.util/qualified-table-name driver target)}
          opts (transform-opts transform-details)
          features (transforms-base.util/required-database-features transform)]

      (when (transforms-base.util/db-routing-enabled? database)
        (throw (ex-info "Transforms are not supported on databases with DB routing enabled."
                        {:driver driver, :database database})))
      (when-not (every? (fn [feature] (driver.u/supports? (:engine database) feature database)) features)
        (throw (ex-info "The database does not support the requested transform target type."
                        {:driver driver, :database database, :features features})))

      (log/info "Executing transform" id "with target" (pr-str target))

      ;; Create schema if needed
      (when-not (driver/schema-exists? driver db (:schema target))
        (driver/create-schema-if-needed! driver (:conn-spec transform-details) (:schema target)))

      ;; Check cancellation before running query
      (when (and cancelled? (cancelled?))
        (throw (ex-info "Transform cancelled before query execution" {:status :cancelled})))

      ;; Run the actual transform
      (let [result (driver/run-transform! driver transform-details opts)]

        ;; Check cancellation after query but before sync
        (when (and cancelled? (cancelled?))
          (throw (ex-info "Transform cancelled after query execution" {:status :cancelled})))

        ;; Sync target table
        (transforms-base.util/sync-target! target database)

        ;; Publish event (after sync, so table exists in AppDB)
        (events/publish-event! :event/transform-run-complete {:object transform-details})

        ;; Create secondary indexes if needed
        (transforms-base.util/execute-secondary-index-ddl-if-required!
         transform run-id database target with-stage-timing-fn)

        {:status :succeeded
         :result result}))

    (catch Exception e
      (let [data (ex-data e)]
        (if (= :cancelled (:status data))
          {:status :cancelled
           :error e}
          (do
            (log/error e "Error executing transform")
            {:status :failed
             :error e}))))))

;;; ------------------------------------------------- Interface Implementation -------------------------------------------------

(defmethod transforms-base.i/execute-base! :query
  [transform opts]
  (run-query-transform! transform opts))
