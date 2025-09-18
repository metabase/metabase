(ns metabase-enterprise.transforms-python.execute
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io Closeable File)
   (java.time Duration)))

(set! *warn-on-reflection* true)

(def ^:const temp-table-suffix-new
  "Suffix used for temporary tables containing new data during swap operations."
  "new")

(def ^:const temp-table-suffix-old
  "Suffix used for temporary tables containing old data during swap operations."
  "old")

(defn- empty-message-log
  "Returns a new message log.

  Python transforms produce output while they run. The message log is a stateful structure that buffers log outputs during the run.
  The goal is to assist in debugging in the case of python runtime or syntax errors, and to provide some immediate feedback for longer running transforms.

  Important Note: in memory buffering is considered acceptable as we expect /logs output to be truncated or small.

  The intended use of this structure is to produce a string suitable for `transform_run.message`, saving it every few seconds."
  []
  (atom {:pre-python  []                                    ; log! outputs previous to the python execution, i.e table read progress
         :python      nil                                   ; events json structured logs from the /logs endpoint
         :post-python []}))                                    ; log! outputs after the python execution, i.e. output reads, writes to target

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

(def ^:private ^Duration python-message-loop-sleep-duration
  (Duration/ofMillis 1000))

(defn- python-message-update-loop!
  "Block while relevant log data is replicated from the runner into the message log.
  When new logs are received, the log data will be flushed to the transform_run.message field as a string.

  The loop will exit on error or when interrupted."
  [run-id message-log]
  (try
    (loop []
      (if (.isInterrupted (Thread/currentThread))
        (log/debug "Message update loop interrupted")
        (do (let [sleep-ms (.toMillis python-message-loop-sleep-duration)]
              (when (pos? sleep-ms) (Thread/sleep sleep-ms)))
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
                      :columns (mapv (fn [{:keys [name base_type #_database_type]}]
                                       {:name name
                                        :type (if base_type
                                                (let [base-type-kw (keyword "type" base_type)]
                                                  (if (python-runner/root-type base-type-kw)
                                                    base-type-kw
                                                    :type/Text))
                                                :type/Text)
                                        ;; :database-type database_type
                                        :nullable? true})
                                     (:fields metadata))}
        data-source (assoc data-source :table-schema table-schema)]
    (transforms.util/create-table-from-schema! driver db-id table-schema)
    (driver/insert-from-source! driver db-id table-schema data-source)))

(defn- transfer-file-to-db [driver db {:keys [target] :as transform} metadata temp-file]
  (let [table-name (transforms.util/qualified-table-name driver target)
        table-exists? (transforms.util/target-table-exists? transform)
        data-source {:type :jsonl-file
                     :file temp-file}]
    (if table-exists?
      ;; Table exists - use temp table + atomic swap pattern
      (let [source-table-name (transforms.util/temp-table-name table-name temp-table-suffix-new)
            temp-table-name (transforms.util/temp-table-name table-name temp-table-suffix-old)]
        (log/info "Existing table detected, Create then swap")
        (try
          (create-table-and-insert-data! driver (:id db) source-table-name metadata data-source)
          ;; Use the new atomic rename-tables! function: target <- source (using temp)
          (transforms.util/rename-tables! driver (:id db) {table-name temp-table-name
                                                           source-table-name table-name})
          ;; Drop the old table (now stored in temp-table-name) separately
          (transforms.util/drop-table! driver (:id db) temp-table-name)
          (catch Exception e
            (log/error e "Failed to transfer data to table")
            (try
              (transforms.util/drop-table! driver (:id db) source-table-name)
              (catch Exception _))
            (throw e))))
      ;; Table doesn't exist - create directly with target name
      (do
        (log/info "New table")
        (create-table-and-insert-data! driver (:id db) table-name metadata data-source)))))

(defn- run-python-transform! [{:keys [source] :as transform} db run-id cancel-chan message-log]
  ;; TODO restructure things such that s3 can we swapped out for other transfer mechanisms
  (with-open [log-future-ref     (open-python-message-update-future! run-id message-log)
              shared-storage-ref (s3/open-s3-shared-storage! (:source-tables source))]
    (let [driver     (:engine db)
          server-url (transforms-python.settings/python-runner-url)
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
                        {:status-code           400
                         :api-status-code       status
                         :body                  body
                         :events                events
                         :transform-run-message (message-log->transform-run-message message-log)}))
        (try
          (let [temp-file (File/createTempFile "transform-output-" ".jsonl")]
            (when-not (seq (:fields output-manifest))
              (throw (ex-info "No fields in metadata"
                              {:metadata               output-manifest
                               :raw-body               body
                               :events                 events
                               :transform-run-message  (message-log->transform-run-message message-log)})))
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
                            {:transform-run-message (message-log->transform-run-message message-log)}
                            e))))))))

(defn execute-python-transform!
  "Execute a Python transform by calling the python runner.

  Blocks until the transform returns."
  [transform {:keys [run-method start-promise]}]
  (when (transforms.util/python-transform? transform)
    (try
      (let [message-log (empty-message-log)
            {:keys [target] transform-id :id} transform
            {driver :engine :as db} (t2/select-one :model/Database (:database target))
            {run-id :id} (transforms.util/try-start-unless-already-running transform-id run-method)]
        (some-> start-promise (deliver [:started run-id]))
        (log! message-log "Executing Python transform")
        (log/info "Executing Python transform" transform-id "with target" (pr-str target))
        (let [start-ms          (u/start-timer)
              transform-details {:db-id          (:id db)
                                 :transform-type (keyword (:type target))
                                 :conn-spec      (driver/connection-spec driver db)
                                 :output-schema  (:schema target)
                                 :output-table   (transforms.util/qualified-table-name driver target)}
              run-fn            (fn [cancel-chan] (run-python-transform! transform db run-id cancel-chan message-log))
              result            (transforms.util/run-cancelable-transform! run-id driver transform-details run-fn)]
          (transforms.instrumentation/with-stage-timing [run-id :sync :table-sync]
            (transforms.util/sync-target! target db run-id))
          (log! message-log (format "Python execution finished successfully in %s" (Duration/ofMillis (u/since-ms start-ms))))
          (save-log-to-transform-run-message! run-id message-log)
          {:run_id run-id
           :result result}))
      (catch Throwable t
        (log/error t "Error executing Python transform")
        (throw t)))))
