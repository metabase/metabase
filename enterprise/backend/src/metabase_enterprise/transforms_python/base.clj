(ns metabase-enterprise.transforms-python.base
  "Base Python transform execution - core logic without transform_run tracking.

   This namespace handles Python transform execution and returns results in memory
   rather than writing to transform_run rows. Logs are returned in the result map
   instead of being saved to transform_run.message."
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms-base.interface :as transforms-base.i]
   [metabase-enterprise.transforms-base.util :as transforms-base.util]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.format :as u.format]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Interface Implementations -------------------------------------------------

(defmethod transforms-base.i/target-db-id :python
  [transform]
  (-> transform :target :database))

(defmethod transforms-base.i/source-db-id :python
  [transform]
  (-> transform :source :database))

(defn- source-table-value->dependency
  "Convert a source table value (int or ref map) to a dependency map."
  [v]
  (cond
    ;; Integer table ID - direct table dependency
    (int? v)
    {:table v}

    ;; Map with resolved table_id - direct table dependency
    (:table_id v)
    {:table (:table_id v)}

    ;; Map without table_id - return ref for ordering system to resolve
    :else
    {:table-ref (select-keys v [:database_id :schema :table])}))

(defmethod transforms-base.i/table-dependencies :python
  [transform]
  (into #{}
        (map source-table-value->dependency)
        (vals (get-in transform [:source :source-tables]))))

;;; ------------------------------------------------- Message Log (in-memory only) -------------------------------------------------

(defn- empty-message-log
  "Returns a new message log for accumulating execution logs in memory."
  []
  (atom {:pre-python  []
         :python      nil
         :post-python []}))

(defn- log!
  "Appends a string to the message log."
  [message-log s]
  (swap! message-log (fn [m] (update m (if (:python m) :post-python :pre-python) conj s)))
  nil)

(defn- replace-python-logs!
  "Called when events output is received to copy those events into the message-log."
  [message-log events]
  (swap! message-log assoc :python events)
  nil)

(defn- message-log->string
  "Presents the content of the log as a string."
  [message-log]
  (let [{:keys [pre-python python post-python]} @message-log]
    (str/join "\n" (concat pre-python
                           (map :message python)
                           post-python))))

;;; ------------------------------------------------- Transfer Strategies -------------------------------------------------

(defn- table-schema [table-name metadata]
  {:name (if (keyword? table-name) table-name (keyword table-name))
   :columns (mapv (fn [{:keys [name base_type]}]
                    {:name name
                     :type (python-runner/restricted-insert-type base_type)
                     :nullable? true})
                  (:fields metadata))})

(defn- maybe-retry-with-backoff
  [driver thunk]
  ;; bigquery can have eventual consistency hiccups where the table is not yet available for insertion
  ;; immediately after creation, so we retry a few times with backoff
  (if (= driver :bigquery-cloud-sdk)
    (loop [attempt 0]
      (let [ret (try
                  (thunk)
                  (catch Exception e
                    (if (and (< attempt 5)
                             (or (str/includes? (str e) "not found")
                                 (str/includes? (str e) "Not found")))
                      (let [delay-ms (* 150 (Math/pow 2 attempt))]
                        (log/debugf "BigQuery operation failed (attempt %d), retrying in %dms" (inc attempt) delay-ms)
                        (Thread/sleep (long delay-ms))
                        ::recur)
                      (throw e))))]
        (if (= ::recur ret)
          (recur (inc attempt))
          ret)))
    (thunk)))

(defn- insert-data!
  "Insert data from source into an existing table."
  [driver db-id table-schema data-source]
  (let [data-source (assoc data-source :table-schema table-schema)]
    (->> #(driver/insert-from-source! driver db-id table-schema data-source)
         (maybe-retry-with-backoff driver))))

(defn- create-table-and-insert-data!
  "Create a table from metadata and insert data from source."
  [driver db-id table-schema data-source]
  (transforms-base.util/create-table-from-schema! driver db-id table-schema)
  (insert-data! driver db-id table-schema data-source))

(defn- transfer-with-rename-tables-strategy!
  "Transfer data using the rename-tables*! multimethod with atomicity guarantees."
  [driver db-id table-name metadata data-source]
  (let [source-table-name (transforms-base.util/temp-table-name driver (namespace table-name))
        temp-table-name (u/poll {:thunk #(transforms-base.util/temp-table-name driver (namespace table-name))
                                 :done? #(not= source-table-name %)
                                 :interval-ms 1})]
    (log/info "Using rename-tables strategy with atomicity guarantees")
    (try
      (create-table-and-insert-data! driver db-id (table-schema source-table-name metadata) data-source)
      (transforms-base.util/rename-tables! driver db-id {table-name temp-table-name
                                                         source-table-name table-name})
      (transforms-base.util/drop-table! driver db-id temp-table-name)
      (catch Exception e
        (log/error e "Failed to transfer data using rename-tables strategy")
        (try
          (transforms-base.util/drop-table! driver db-id source-table-name)
          (catch Exception _))
        (throw e)))))

(defn- transfer-with-create-drop-rename-strategy!
  "Transfer data using create + drop + rename to minimize time without data."
  [driver db-id table-name metadata data-source]
  (let [source-table-name (transforms-base.util/temp-table-name driver (namespace table-name))]
    (log/info "Using create-drop-rename strategy to minimize downtime")
    (try
      (create-table-and-insert-data! driver db-id (table-schema source-table-name metadata) data-source)
      (transforms-base.util/drop-table! driver db-id table-name)
      (driver/rename-table! driver db-id source-table-name table-name)
      (catch Exception e
        (log/error e "Failed to transfer data using create-drop-rename strategy")
        (try
          (transforms-base.util/drop-table! driver db-id source-table-name)
          (catch Exception _))
        (throw e)))))

(defn- transfer-with-drop-create-fallback-strategy!
  "Transfer data using drop + create fallback strategy."
  [driver db-id table-name metadata data-source]
  (log/info "Using drop-create fallback strategy")
  (try
    (transforms-base.util/drop-table! driver db-id table-name)
    (create-table-and-insert-data! driver db-id (table-schema table-name metadata) data-source)
    (catch Exception e
      (log/error e "Failed to transfer data using drop-create fallback strategy")
      (throw e))))

(defmulti ^:private transfer-file-to-db
  {:arglists '([driver db transform metadata temp-file])}
  (fn [_ _ transform _ _] (-> transform :target :type keyword)))

(defmethod transfer-file-to-db :table-incremental
  [driver {db-id :id}
   {:keys [target] :as transform}
   metadata temp-file]
  (let [table-name (transforms-base.util/qualified-table-name driver target)
        table-exists? (transforms-base.util/target-table-exists? transform)
        data-source {:type :jsonl-file
                     :file temp-file}]
    (if (not table-exists?)
      (do
        (log/info "New table")
        (create-table-and-insert-data! driver db-id (table-schema table-name metadata) data-source))
      (insert-data! driver db-id (table-schema table-name metadata) data-source))))

(defmethod transfer-file-to-db :table
  [driver {db-id :id :as db}
   {:keys [target] :as transform}
   metadata temp-file]
  (let [table-name (transforms-base.util/qualified-table-name driver target)
        table-exists? (transforms-base.util/target-table-exists? transform)
        data-source {:type :jsonl-file
                     :file temp-file}]
    (cond
      (not table-exists?)
      (do
        (log/info "New table")
        (create-table-and-insert-data! driver db-id (table-schema table-name metadata) data-source))

      (driver.u/supports? driver :atomic-renames db)
      (transfer-with-rename-tables-strategy! driver db-id table-name metadata data-source)

      (driver.u/supports? driver :rename db)
      (transfer-with-create-drop-rename-strategy! driver db-id table-name metadata data-source)

      :else
      (transfer-with-drop-create-fallback-strategy! driver db-id table-name metadata data-source))))

;;; ------------------------------------------------- Cancellation -------------------------------------------------

(defn- start-cancellation-process!
  "Starts a core.async process that sends a cancellation request to the python executor if cancel-chan receives a value."
  [server-url run-id cancel-chan]
  (a/go (when (a/<! cancel-chan)
          (python-runner/cancel-python-code-http-call! server-url run-id))))

;;; ------------------------------------------------- Core Execution -------------------------------------------------

(defn- run-python-transform-impl!
  "Core Python transform execution. Returns {:status :result :logs :events}.

   Options:
   - `with-stage-timing-fn` - optional, (fn [run-id stage thunk] result) for instrumentation"
  [{:keys [source] :as transform} db run-id cancel-chan message-log {:keys [with-stage-timing-fn]}]
  ;; Resolve name-based source table refs to table IDs (throws if any not found)
  (let [resolved-source-tables (transforms-base.util/resolve-source-tables (:source-tables source))]
    (with-open [shared-storage-ref (s3/open-shared-storage! resolved-source-tables)]
      (let [driver          (:engine db)
            server-url      (transforms-python.settings/python-runner-url)
            _               (python-runner/copy-tables-to-s3! {:run-id         run-id
                                                               :shared-storage @shared-storage-ref
                                                               :source         (assoc source :source-tables resolved-source-tables)
                                                               :cancel-chan    cancel-chan
                                                               :limit          (:limit source)
                                                               :transform-id   (:id transform)})
            _               (start-cancellation-process! server-url run-id cancel-chan)
            {:keys [status body] :as response}
            (python-runner/execute-python-code-http-call!
             {:server-url     server-url
              :code           (:body source)
              :run-id         run-id
              :table-name->id resolved-source-tables
              :shared-storage @shared-storage-ref})

            output-manifest (python-runner/read-output-manifest @shared-storage-ref)
            events          (python-runner/read-events @shared-storage-ref)]
        (replace-python-logs! message-log events)
        (if (not= 200 status)
          (throw (ex-info "Python runner call failed"
                          {:transform-message (i18n/tru "Python execution failure (exit code {0})" (:exit_code body "?"))
                           :status-code       400
                           :api-status-code   status
                           :body              body
                           :events            events
                           :timeout           (:timeout body)}))
          (try
            (let [temp-path (Files/createTempFile "transform-output-" ".jsonl" (u/varargs FileAttribute))
                  temp-file ^File (.toFile temp-path)]
              (when-not (seq (:fields output-manifest))
                (throw (ex-info "No fields in metadata"
                                {:metadata               output-manifest
                                 :raw-body               body
                                 :events                 events})))
              (try
                (with-open [in (python-runner/open-output @shared-storage-ref)]
                  (io/copy in temp-file))
                ;; Transfer file to database with instrumentation
                (let [file-size (.length temp-file)
                      do-transfer (fn [] (transfer-file-to-db driver db transform output-manifest temp-file))]
                  (if with-stage-timing-fn
                    (with-stage-timing-fn run-id [:import :file-to-dwh] do-transfer)
                    (do-transfer))
                  (transforms.instrumentation/record-data-transfer! run-id :file-to-dwh file-size nil))
                (finally
                  (.delete temp-file))))
            response
            (catch Exception e
              (log/error e "Failed to create resulting table")
              (throw (ex-info "Failed to create the resulting table"
                              {:transform-message (or (:transform-message (ex-data e))
                                                      (i18n/tru "Failed to create the resulting table"))}
                              e)))))))))

;;; ------------------------------------------------- Base Execution Entry Point -------------------------------------------------

(defn run-python-transform!
  "Execute Python transform. Returns result map.

   Does:
   - Resolve source tables
   - Copy to S3
   - Call python runner
   - Transfer result to DB
   - Sync target

   Does NOT:
   - Create transform_run row
   - Poll/save logs to transform_run.message

   Options:
   - `:cancelled?` - (fn [] boolean), polled to check for cancellation
   - `:run-id` - optional, for cancellation signaling and instrumentation
   - `:with-stage-timing-fn` - optional, (fn [run-id stage thunk] result)

   Returns:
   {:status :succeeded | :failed | :cancelled
    :result <http response>
    :logs <string>
    :error <exception if failed>}"
  [transform {:keys [cancelled? run-id with-stage-timing-fn]}]
  (assert (transforms-base.util/python-transform? transform) "Transform must be a python transform")
  (let [message-log (empty-message-log)]
    (try
      ;; Check cancellation before starting
      (when (and cancelled? (cancelled?))
        (throw (ex-info "Transform cancelled before start" {:status :cancelled})))

      (let [{:keys [target] transform-id :id} transform
            db (t2/select-one :model/Database (:database target))
            ;; Use run-id if provided, otherwise generate a temp one for python runner
            effective-run-id (or run-id (rand-int Integer/MAX_VALUE))
            cancel-chan (a/promise-chan)
            ;; Bridge cancelled? to cancel-chan
            _ (when cancelled?
                (a/go
                  (loop []
                    (when-not (a/poll! cancel-chan)
                      (if (cancelled?)
                        (a/>! cancel-chan :cancel!)
                        (do
                          (a/<! (a/timeout 100))
                          (recur)))))))
            start-ms (u/start-timer)]

        (log! message-log (i18n/tru "Executing Python transform"))
        (log/info "Executing Python transform" transform-id "with target" (pr-str target))

        (let [result (run-python-transform-impl! transform db effective-run-id cancel-chan message-log
                                                 {:with-stage-timing-fn with-stage-timing-fn})]
          (log! message-log (i18n/tru "Python execution finished successfully in {0}"
                                      (u.format/format-milliseconds (u/since-ms start-ms))))

          ;; Check cancellation after python but before sync
          (when (and cancelled? (cancelled?))
            (throw (ex-info "Transform cancelled after python execution" {:status :cancelled})))

          ;; Sync target table
          (transforms-base.util/sync-target! target db)

          ;; Create secondary indexes if needed
          (transforms-base.util/execute-secondary-index-ddl-if-required!
           transform run-id db target with-stage-timing-fn)

          {:status :succeeded
           :result result
           :logs (message-log->string message-log)}))

      (catch Exception e
        (let [data (ex-data e)
              logs (message-log->string message-log)
              error-message (or (:transform-message data) (ex-message e))]
          (cond
            (= :cancelled (:status data))
            {:status :cancelled
             :error e
             :logs logs}

            (:timeout data)
            {:status :timeout
             :error e
             :logs (or (when-let [events (:events data)]
                         (str/join "\n" (map :message events)))
                       logs)}

            :else
            (do
              (log/error e "Error executing Python transform")
              {:status :failed
               :error e
               :logs (str logs "\n" error-message)})))))))

;;; ------------------------------------------------- Interface Implementation -------------------------------------------------

(defmethod transforms-base.i/execute-base! :python
  [transform opts]
  (run-python-transform! transform opts))
