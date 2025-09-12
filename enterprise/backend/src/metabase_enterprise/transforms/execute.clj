(ns metabase-enterprise.transforms.execute
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms.canceling :as canceling]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.python-runner :as python-runner]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.io Closeable File)
   (java.time Duration)))

(set! *warn-on-reflection* true)

(mr/def ::transform-details
  [:map
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :table]]
   [:conn-spec :any]
   [:query :string]
   [:output-table [:keyword {:decode/normalize schema.common/normalize-keyword}]]])

(mr/def ::transform-opts
  [:map
   [:overwrite? :boolean]])

(defn- sync-target!
  ([transform-id run-id]
   (let [{:keys [source target]} (t2/select-one :model/Transform transform-id)
         db (get-in source [:query :database])
         database (t2/select-one :model/Database db)]
     (sync-target! target database run-id)))
  ([target database _run-id]
   ;; sync the new table (note that even a failed sync status means that the execution succeeded)
   (log/info "Syncing target" (pr-str target) "for transform")
   (transforms.util/activate-table-and-mark-computed! database target)))

(defn run-cancelable-transform!
  "Run a compiled transform"
  [run-id driver {:keys [db conn-spec output-schema]} run-transform!]
  ;; local run is responsible for status, using canceling lifecycle
  (try
    (when (driver.u/supports? driver :schemas db)
      (when-not (driver/schema-exists? driver (:id db) output-schema)
        (driver/create-schema-if-needed! driver conn-spec output-schema)))
    (canceling/chan-start-timeout-vthread! run-id (transforms.settings/transform-timeout))
    (let [cancel-chan (a/promise-chan)
          ret (binding [qp.pipeline/*canceled-chan* cancel-chan]
                (canceling/chan-start-run! run-id cancel-chan)
                (run-transform! cancel-chan))]
      (transform-run/succeed-started-run! run-id)
      ret)
    (catch Throwable t
      (let [{::keys [transform-run-message]} (ex-data t)]
        (transform-run/fail-started-run! run-id {:message (or transform-run-message (.getMessage t))}))
      (throw t))
    (finally
      (canceling/chan-end-run! run-id))))

(defn- try-start-unless-already-running [id run-method]
  (try
    (transform-run/start-run! id {:run_method run-method})
    (catch java.sql.SQLException e
      (if (= (.getSQLState e) "23505")
        (throw (ex-info "Transform is already running"
                        {:error :already-running
                         :transform-id id}
                        e))
        (throw e)))))

(defn run-mbql-transform!
  "Run `transform` and sync its target table.

  This is executing synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  ([transform] (run-mbql-transform! transform nil))
  ([{:keys [id source target] :as transform} {:keys [run-method start-promise]}]
   (try
     (let [db (get-in source [:query :database])
           {driver :engine :as database} (t2/select-one :model/Database db)
           feature (transforms.util/required-database-feature transform)
           transform-details {:db db
                              :transform-type (keyword (:type target))
                              :conn-spec (driver/connection-spec driver database)
                              :query (transforms.util/compile-source source)
                              :output-schema (:schema target)
                              :output-table (transforms.util/qualified-table-name driver target)}
           opts {:overwrite? true}]
       (when-not (driver.u/supports? driver feature database)
         (throw (ex-info "The database does not support the requested transform target type."
                         {:driver driver, :database database, :feature feature})))
       ;; mark the execution as started and notify any observers
       (let [{run-id :id} (try-start-unless-already-running id run-method)]
         (when start-promise
           (deliver start-promise [:started run-id]))
         (log/info "Executing transform" id "with target" (pr-str target))
         (run-cancelable-transform! run-id driver transform-details (fn [_cancel-chan] (driver/run-transform! driver transform-details opts)))
         (transforms.instrumentation/with-stage-timing [run-id :sync :table-sync]
           (sync-target! target database run-id))))
     (catch Throwable t
       (log/error t "Error executing transform")
       (when start-promise
         ;; if the start-promise has been delivered, this is a no-op,
         ;; but we assume nobody would catch the exception anyway
         (deliver start-promise t))
       (throw t)))))

(defn- empty-message-log
  "Returns a new message log.

  Python transforms produce output while they run. The message log is a stateful structure that buffers log outputs during the run.
  The goal is to assist in debugging in the case of python runtime or syntax errors, and to provide some immediate feedback for longer running transforms.

  Important Note: in memory buffering is considered acceptable as we expect /logs output to be truncated or small.

  The intended use of this structure is to produce a string suitable for `transform_run.message`, saving it every few seconds."
  []
  (atom {:pre-python  []                                    ; log! outputs previous to the python execution, i.e table read progress
         :python      nil                                   ; events json structured logs from the /logs endpoint
         :post-python []                                    ; log! outputs after the python execution, i.e. output reads, writes to target
         }))

(defn- log!
  "Appends a string to the message log, the string is user facing and should be suitable for presentation as part of the `transform_run.message` field."
  [message-log s]
  (swap! message-log (fn [m] (update m (if (:python m) :post-python :pre-python) conj s)))
  nil)

(defn- replace-python-logs!
  "Called when events output is received from a /logs call to copy those events into the message-log."
  [message-log events]
  (swap! message-log assoc :python events)
  nil)

(defn- message-log->transform-run-message
  "Presents the content of the log as a string suitable for storage in transform_run.message."
  [message-log]
  (let [{:keys [pre-python python post-python]} @message-log]
    (str/join "\n" (concat pre-python
                           (map :message python)
                           post-python))))

(defn- save-log-to-transform-run-message!
  "Saves the content of the log into the transform_run's message field. Lossy, string contains user facing information only."
  [run-id message-log]
  (t2/update! :model/TransformRun
              :id run-id
              {:message (message-log->transform-run-message message-log)}))

(defn- python-message-update-loop!
  "Block while relevant log data is replicated from the runner into the message log.
  When new logs are received, the log data will be flushed to the transform_run.message field as a string.

  The loop will exit on error or when interrupted."
  [run-id message-log]
  (try
    (loop []
      (if (.isInterrupted (Thread/currentThread))
        (log/debug "Message update loop interrupted")
        (do (Thread/sleep 1000)
            (let [{:keys [status body]} (python-runner/get-logs run-id)]
              (cond
                (<= 200 status 299)
                (let [{:keys [execution_id events]} body]
                  (if-not (= run-id execution_id)
                    (do (log/debugf "Run id did not match expected: %s actual: %s" run-id execution_id)
                        (recur))
                    (do
                      (replace-python-logs! message-log events)
                      (save-log-to-transform-run-message! run-id message-log)
                      (recur))))
                (= 404 status)
                (do
                  (log/debugf "No logs yet (or run finished), run-id: %s" run-id)
                  (recur))
                :else
                (do
                  (log/warnf "Unexpected status polling for logs %s %s, run-id: %s" status body run-id)
                  (log/debug "Exiting due to poll error")))))))
    (catch InterruptedException _)
    (catch Throwable e
      (log/errorf e "An exception was caught during msg update loop, run-id: %s" run-id))))

(defn- open-python-message-update-future! ^Closeable [run-id message-log]
  (let [cleanup (fn [fut]
                  (future-cancel fut)
                  (if (= ::timeout (try (deref fut 10000 ::timeout) (catch Throwable _)))
                    (log/fatalf "Log polling task did not respond to interrupt, run-id: %s" run-id)
                    (log/debugf "Log polling task done, run-id: %s" run-id)))
        fut     (u.jvm/in-virtual-thread*
                 (python-message-update-loop! run-id message-log))]
    (reify Closeable
      (close [_] (cleanup fut)))))

(defn- create-table-and-insert-data!
  "Create a table from metadata and insert data from source."
  [driver db-id table-name metadata data-source]
  (let [table-schema {:name (if (keyword? table-name) table-name (keyword table-name))
                      :columns (mapv (fn [{:keys [name dtype base_type database_type]}]
                                       {:name name
                                        :type (or (some->> base_type (keyword "type"))
                                                  (transforms.util/dtype->base-type dtype))
                                        :database-type database_type
                                        :nullable? true})
                                     (:fields metadata))}
        data-source (assoc data-source :table-schema table-schema)]
    (transforms.util/create-table-from-schema! driver db-id table-schema)
    (driver/insert-from-source! driver db-id table-schema data-source)))

(defn- transfer-file-to-db [driver db {:keys [target] :as transform} metadata temp-file]
  (let [table-name (transforms.util/qualified-table-name driver target)
        table-exists? (transforms.util/target-table-exists? transform)
        data-source {:type :csv-file
                     :file temp-file}]
    (if table-exists?
      ;; Table exists - use temp table + atomic swap pattern
      (let [temp-table-name (keyword (str (u/qualified-name table-name) "_temp_" (System/currentTimeMillis)))]
        (log/info "Existing table deletected, Create then swap")
        (try
          (create-table-and-insert-data! driver (:id db) temp-table-name metadata data-source)
          ;; TODO: These operations should be within a transaction for atomicity
          (transforms.util/drop-table! driver (:id db) table-name)
          (transforms.util/rename-table! driver (:id db) temp-table-name table-name)
          (catch Exception e
            (log/error e "Failed to transfer data to table")
            (try
              (transforms.util/drop-table! driver (:id db) temp-table-name)
              (catch Exception _))
            (throw e))))
      ;; Table doesn't exist - create directly with target name
      (do
        (log/info "New table")
        (create-table-and-insert-data! driver (:id db) table-name metadata data-source)))))

(defn test-python-transform!
  "Execute a transform in test mode (does not write result into a table)."
  [code tables->id run-id cancel-chan]
  (with-open [shared-storage-ref (python-runner/open-s3-shared-storage! tables->id)]
    (let [server-url (transforms.settings/python-execution-server-url)
          _          (python-runner/copy-tables-to-s3! {:run-id         run-id
                                                        :shared-storage @shared-storage-ref
                                                        :table-name->id tables->id
                                                        :cancel-chan    cancel-chan})
          _          (python-runner/open-cancellation-process! server-url run-id cancel-chan) ; inherits lifetime of cancel-chan
          response
          (python-runner/execute-python-code-http-call!
           {:server-url     server-url
            :code           code
            :run-id         run-id
            :table-name->id tables->id
            :shared-storage @shared-storage-ref})
          {:keys [output events]} (python-runner/read-output-objects @shared-storage-ref)]
      {:response response
       :events   events
       :output   output})))

(defn- run-python-transform! [{:keys [source] :as transform} db run-id cancel-chan message-log]
  (with-open [log-future-ref     (open-python-message-update-future! run-id message-log)
              shared-storage-ref (python-runner/open-s3-shared-storage! (:source-tables source))]
    (let [driver     (:engine db)
          server-url (transforms.settings/python-execution-server-url)
          _          (python-runner/copy-tables-to-s3! {:run-id         run-id
                                                        :shared-storage @shared-storage-ref
                                                        :table-name->id (:source-tables source)
                                                        :cancel-chan    cancel-chan})
          _          (python-runner/open-cancellation-process! server-url run-id cancel-chan) ; inherits lifetime of cancel-chan
          {:keys [status body] :as response}
          (python-runner/execute-python-code-http-call!
           {:server-url     server-url
            :code           (:body source)
            :run-id         run-id
            :table-name->id (:source-tables source)
            :shared-storage @shared-storage-ref})
          ;; TODO temporary to keep more code stable while refactoring
          ;; no need to materialize these early (i.e output we can stream directly into a tmp file or db if small)
          {:keys [output output-manifest events]} (python-runner/read-output-objects @shared-storage-ref)]
      (.close log-future-ref)                               ; early close to force any writes to flush
      (when (seq events)
        (replace-python-logs! message-log events))
      (if (not= 200 status)
        (throw (ex-info "Python runner call failed"
                        {:status-code     400
                         :api-status-code status
                         :body            body
                         :events          events
                         ::transform-run-message (message-log->transform-run-message message-log)}))
        (try
          (let [temp-file (File/createTempFile "transform-output-" ".csv")]
            (when-not (seq (:fields output-manifest))
              (throw (ex-info "No fields in metadata"
                              {:metadata               output-manifest
                               :raw-body               body
                               :events                 events
                               ::transform-run-message (message-log->transform-run-message message-log)})))
            (try
              (with-open [writer (io/writer temp-file)]
                (.write writer ^String output))
              (let [file-size (.length temp-file)]
                (transforms.instrumentation/with-stage-timing [run-id :data-transfer :file-to-dwh]
                  (transfer-file-to-db driver db transform output-manifest temp-file))
                (transforms.instrumentation/record-data-transfer! run-id :file-to-dwh file-size nil))
              (finally
                (.delete temp-file))))
          response
          (catch Exception e
            (log/error e "Failed to to create resulting table")
            (throw (ex-info "Failed to create the resulting table"
                            {::transform-run-message (message-log->transform-run-message message-log)}
                            e))))))))

(defn execute-python-transform!
  "Execute a Python transform by calling the python runner.

  This is executing synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  [transform {:keys [run-method start-promise]}]
  (when (transforms.util/python-transform? transform)
    (try
      (let [message-log (empty-message-log)
            {:keys [target] transform-id :id} transform
            {driver :engine :as db} (t2/select-one :model/Database (:database target))
            {run-id :id} (try-start-unless-already-running transform-id run-method)]
        (some-> start-promise (deliver [:started run-id]))
        (log! message-log "Executing Python transform")
        (log/info "Executing Python transform" transform-id "with target" (pr-str target))
        (let [start-ms          (u/start-timer)
              transform-details {:db             db
                                 :transform-type (keyword (:type target))
                                 :conn-spec      (driver/connection-spec driver db)
                                 :output-schema  (:schema target)
                                 :output-table   (transforms.util/qualified-table-name driver target)}
              run-fn            (fn [cancel-chan] (run-python-transform! transform db run-id cancel-chan message-log))
              result            (run-cancelable-transform! run-id driver transform-details run-fn)]
          (transforms.instrumentation/with-stage-timing [run-id :sync :table-sync]
            (sync-target! target db run-id))
          (log! message-log (format "Python execution finished successfully in %s" (Duration/ofMillis (u/since-ms start-ms))))
          (save-log-to-transform-run-message! run-id message-log)
          {:run_id run-id
           :result result}))
      (catch Throwable t
        (log/error t "Error executing Python transform")
        (throw t)))))
