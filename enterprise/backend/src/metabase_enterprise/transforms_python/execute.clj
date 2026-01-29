(ns metabase-enterprise.transforms-python.execute
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase-enterprise.transforms.core :as transforms]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.app-db.core :as app-db]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.format :as u.format]
   [metabase.util.i18n :as i18n]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io Closeable)
   (java.net SocketException)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.time Duration)))

(set! *warn-on-reflection* true)

(defn- empty-message-log
  "Returns a new message log.

  Python transforms produce output while they run. The message log is a stateful structure that buffers log outputs during the run.
  The goal is to assist in debugging in the case of python runtime or syntax errors, and to provide some immediate feedback for longer running transforms.

  Important Note: in memory buffering is considered acceptable as we expect /logs output to be truncated or small.

  The intended use of this structure is to produce a string suitable for `transform_run.message`, saving it every few seconds."
  []
  (atom {:pre-python  []                                    ; log! outputs previous to the python execution, i.e table read progress
         :python      nil                                   ; events json structured logs from the /logs endpoint
         :post-python []}))                                 ; log! outputs after the python execution, i.e. output reads, writes to target

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
    (catch SocketException se (when-not (= "Closed by interrupt" (ex-message se)) (throw se)))
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

(defn- table-schema [table-name metadata]
  {:name (if (keyword? table-name) table-name (keyword table-name))
   :columns (mapv (fn [{:keys [name base_type #_database_type]}]
                    {:name name
                     :type (python-runner/restricted-insert-type base_type)
                     ;; :database-type database_type
                     :nullable? true})
                  (:fields metadata))})

(defn- insert-data!
  "Insert data from source into an existing table."
  [driver db-id table-schema data-source]
  (let [data-source (assoc data-source :table-schema table-schema)]
    (->> #(driver/insert-from-source! driver db-id table-schema data-source)
         (maybe-retry-with-backoff driver))))

(defn- create-table-and-insert-data!
  "Create a table from metadata and insert data from source."
  [driver db-id table-schema data-source]
  (transforms.util/create-table-from-schema! driver db-id table-schema)
  (insert-data! driver db-id table-schema data-source))

(defn- transfer-with-rename-tables-strategy!
  "Transfer data using the rename-tables*! multimethod with atomicity guarantees.
   Creates new table, then atomically renames target->old and new->target, then drops old."
  [driver db-id table-name metadata data-source]
  (let [source-table-name (driver.u/temp-table-name driver table-name)
        temp-table-name   (driver.u/temp-table-name driver table-name)]
    (log/info "Using rename-tables strategy with atomicity guarantees")
    (try

      (create-table-and-insert-data! driver db-id (table-schema source-table-name metadata) data-source)
      (transforms.util/rename-tables! driver db-id {table-name temp-table-name
                                                    source-table-name table-name})
      (transforms.util/drop-table! driver db-id temp-table-name)

      (catch Exception e
        (log/error e "Failed to transfer data using rename-tables strategy")
        (try
          (transforms.util/drop-table! driver db-id source-table-name)
          (catch Exception _))
        (throw e)))))

(defn- transfer-with-create-drop-rename-strategy!
  "Transfer data using create + drop + rename to minimize time without data.
   Creates new table, drops old table, then renames new->target."
  [driver db-id table-name metadata data-source]
  (let [source-table-name (driver.u/temp-table-name driver table-name)]
    (log/info "Using create-drop-rename strategy to minimize downtime")
    (try

      (create-table-and-insert-data! driver db-id (table-schema source-table-name metadata) data-source)
      (transforms.util/drop-table! driver db-id table-name)
      (driver/rename-table! driver db-id source-table-name table-name)

      (catch Exception e
        (log/error e "Failed to transfer data using create-drop-rename strategy")
        (try
          (transforms.util/drop-table! driver db-id source-table-name)
          (catch Exception _))
        (throw e)))))

(defn- transfer-with-drop-create-fallback-strategy!
  "Transfer data using drop + create fallback strategy.
   Drops old table, then creates new table directly with target name."
  [driver db-id table-name metadata data-source]
  (log/info "Using drop-create fallback strategy")
  (try

    (transforms.util/drop-table! driver db-id table-name)
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
  (let [table-name (transforms.util/qualified-table-name driver target)
        table-exists? (transforms.util/target-table-exists? transform)
        data-source {:type :jsonl-file
                     :file temp-file}]

    ;; once we have more than just append, dispatch on :target-incremental-strategy

    (if (not table-exists?)
      (do
        (log/info "New table")
        (create-table-and-insert-data! driver db-id (table-schema table-name metadata) data-source))
      (insert-data! driver db-id (table-schema table-name metadata) data-source))))

(defmethod transfer-file-to-db :table
  [driver {db-id :id :as db}
   {:keys [target] :as transform}
   metadata temp-file]
  (let [table-name (transforms.util/qualified-table-name driver target)
        table-exists? (transforms.util/target-table-exists? transform)
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

(defn- start-cancellation-process!
  "Starts a core.async process that optimistically sends a cancellation request to the python executor if cancel-chan receives a value.
  Returns a channel that will receive either the async http call j.u.c.FutureTask in the case of cancellation, or nil when the cancel-chan is closed."
  [server-url run-id cancel-chan]
  (a/go (when (a/<! cancel-chan)
          (python-runner/cancel-python-code-http-call! server-url run-id))))

(defn- run-python-transform! [{:keys [source] :as transform} db run-id cancel-chan message-log]
  ;; Resolve name-based source table refs to table IDs (throws if any not found)
  (let [resolved-source-tables (transforms.util/resolve-source-tables (:source-tables source))]
    ;; TODO restructure things such that s3 can we swapped out for other transfer mechanisms
    (with-open [^Closeable log-future-ref
                (if (app-db/in-transaction?)
                  ;; if in a transaction (such as under mt/with-temp), it is not safe to poll for logs (close race / contention)
                  ;; tests that want to test async log behaviour should opt out of thread-local test helpers
                  (reify Closeable (close [_]))
                  (open-python-message-update-future! run-id message-log))
                shared-storage-ref (s3/open-shared-storage! resolved-source-tables)]
      (let [driver          (:engine db)
            server-url      (transforms-python.settings/python-runner-url)
            _               (python-runner/copy-tables-to-s3! {:run-id         run-id
                                                               :shared-storage @shared-storage-ref
                                                               :source         (assoc source :source-tables resolved-source-tables)
                                                               :cancel-chan    cancel-chan
                                                               :limit          (:limit source)
                                                               :transform-id   (:id transform)})
            _               (start-cancellation-process! server-url run-id cancel-chan) ; inherits lifetime of cancel-chan
            {:keys [status body] :as response}
            (python-runner/execute-python-code-http-call!
             {:server-url     server-url
              :code           (:body source)
              :run-id         run-id
              :table-name->id resolved-source-tables
              :shared-storage @shared-storage-ref})

            output-manifest (python-runner/read-output-manifest @shared-storage-ref)
            events          (python-runner/read-events @shared-storage-ref)]
        (.close ^Closeable log-future-ref)                 ; early close to force any writes to flush
        (replace-python-logs! message-log events)
        (if (not= 200 status)
          (do
            (when (:timeout body)
              (transforms/timeout-run! run-id))
            (throw (ex-info "Python runner call failed"
                            {:transform-message (i18n/tru "Python execution failure (exit code {0})" (:exit_code body "?"))
                             :status-code       400
                             :api-status-code   status
                             :body              body
                             :events            events})))
          (try
            (let [temp-path (Files/createTempFile "transform-output-" ".jsonl" (u/varargs FileAttribute))
                  temp-file (.toFile temp-path)]
              (when-not (seq (:fields output-manifest))
                (throw (ex-info "No fields in metadata"
                                {:metadata               output-manifest
                                 :raw-body               body
                                 :events                 events})))
              (try
                (with-open [in (python-runner/open-output @shared-storage-ref)]
                  (io/copy in temp-file))
                (let [file-size (.length temp-file)]
                  (transforms.instrumentation/with-stage-timing [run-id [:import :file-to-dwh]]
                    (transfer-file-to-db driver db transform output-manifest temp-file))
                  (transforms.instrumentation/record-data-transfer! run-id :file-to-dwh file-size nil))
                (finally
                  (.delete temp-file))))
            response
            (catch Exception e
              (log/error e "Failed to to create resulting table")
              (throw (ex-info "Failed to create the resulting table"
                              {:transform-message (or (:transform-message (ex-data e))
                                                    ;; TODO keeping messaging the same at this level
                                                    ;;  should be more specific in underlying calls
                                                      (i18n/tru "Failed to create the resulting table"))}
                              e)))))))))

(defn- exceptional-run-message [message-log ex]
  (str/join "\n" (remove str/blank? [(message-log->transform-run-message message-log)
                                     (or (:transform-message (ex-data ex))
                                         (if (instance? InterruptedException ex)
                                           (i18n/tru "Transform interrupted")
                                           (i18n/tru "Something went wrong")))])))

(defn execute-python-transform!
  "Execute a Python transform by calling the python runner.

  Blocks until the transform returns."
  [transform {:keys [run-method start-promise user-id]}]
  (assert (transforms.util/python-transform? transform) "Transform must be a python transform")
  (try
    (let [message-log (empty-message-log)
          {:keys [target owner_user_id creator_id] transform-id :id} transform
          {driver :engine :as db} (t2/select-one :model/Database (:database target))
          ;; For manual runs, use the triggering user; for cron, use owner/creator
          run-user-id (if (and (= run-method :manual) user-id)
                        user-id
                        (or owner_user_id creator_id))
          {run-id :id} (transforms.util/try-start-unless-already-running transform-id run-method run-user-id)]
      (some-> start-promise (deliver [:started run-id]))
      (log! message-log (i18n/tru "Executing Python transform"))
      (log/info "Executing Python transform" transform-id "with target" (pr-str target))
      (let [start-ms          (u/start-timer)
            transform-details {:db-id          (:id db)
                               :transform-type (keyword (:type target))
                               :conn-spec      (driver/connection-spec driver db)
                               :output-schema  (:schema target)
                               :output-table   (transforms.util/qualified-table-name driver target)}
            run-fn            (fn [cancel-chan]
                                (run-python-transform! transform db run-id cancel-chan message-log)
                                (log! message-log (i18n/tru "Python execution finished successfully in {0}" (u.format/format-milliseconds (u/since-ms start-ms))))
                                (save-log-to-transform-run-message! run-id message-log))
            ex-message-fn     #(exceptional-run-message message-log %)
            result            (transforms.instrumentation/with-stage-timing [run-id [:computation :python-execution]]
                                (transforms.util/run-cancelable-transform! run-id driver transform-details run-fn :ex-message-fn ex-message-fn))]
        (transforms.util/handle-transform-complete!
         :run-id run-id
         :transform transform
         :db db)
        {:run_id run-id
         :result result}))
    (catch Throwable t
      (log/error t "Error executing Python transform")
      (throw t))))
