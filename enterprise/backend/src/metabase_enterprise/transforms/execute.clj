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

(def ^:const temp-table-suffix-new
  "Suffix used for temporary tables containing new data during swap operations."
  "new")

(def ^:const temp-table-suffix-old
  "Suffix used for temporary tables containing old data during swap operations."
  "old")

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
      (transform-run/fail-started-run! run-id {:message (.getMessage t)})
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

(defn- log! [message-log s]
  (when message-log
    (swap! message-log (fn [m] (update m (if (:python m) :post-python :pre-python) conj s))))
  nil)

(defn- replace-python-logs! [message-log events]
  (when message-log (swap! message-log assoc :python events))
  nil)

(defn- save-log-as-message! [run-id message-log]
  (when message-log
    (let [{:keys [pre-python python post-python]} @message-log]
      (t2/update! :model/TransformRun
                  :id run-id
                  {:message (str/join "\n" (concat pre-python
                                                   (for [{:keys [stream message]} python]
                                                     (if (= "stdout" stream)
                                                       (str "\033[32m" message "\033[0m")
                                                       (str "\033[31m" message "\033[0m")))
                                                   post-python))}))))

(defn- log-loop! [run-id message-log]
  (let [poll #(python-runner/get-logs run-id)]
    (try
      (loop []
        (if (.isInterrupted (Thread/currentThread))
          (log/debug "Message update loop interrupted")
          (do (Thread/sleep 1000)
              (let [{:keys [status body]} (poll)]
                (cond
                  (<= 200 status 299)
                  (let [{:keys [execution_id events]} body]
                    (if-not (= run-id execution_id)
                      (do (log/debugf "Run id did not match expected: %s actual: %s" run-id execution_id)
                          (recur))
                      (do
                        (replace-python-logs! message-log events)
                        (save-log-as-message! run-id message-log)
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
        (log/errorf e "An exception was caught during msg update loop, run-id: %s" run-id)))))

(defn- open-log-future! ^Closeable [run-id message-log]
  (let [cleanup (fn [fut]
                  (future-cancel fut)
                  (if (= ::timeout (try (deref fut 10000 ::timeout) (catch Throwable _)))
                    (log/fatalf "Log polling task did not respond to interrupt, run-id: %s" run-id)
                    (log/debugf "Log polling task done, run-id: %s")))
        fut     (u.jvm/in-virtual-thread*
                 (log-loop! run-id message-log))]
    (reify Closeable
      (close [_] (cleanup fut)))))

(defn- debug-info-str [{:keys [exit-code events]}]
  (str/join "\n"
            ;; todo this was temporary before the log stuff, needs a rethink at some point
            ["stdout"
             "======"
             (->> events (filter #(= "stdout" (:stream %))) (map :message) (str/join "\n"))
             "stderr"
             "======"
             (->> events (filter #(= "stderr" (:stream %))) (map :message) (str/join "\n"))
             "======"
             (format "exit code %d" exit-code)]))

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

(defn test-python-transform!
  "Execute a transform in test mode (does not write result into a table)."
  [code tables->id run-id cancel-chan]
  (with-open [shared-storage-ref (python-runner/open-s3-shared-storage! tables->id)]
    (let [server-url              (transforms.settings/python-execution-server-url)
          _                       (python-runner/copy-tables-to-s3! {:run-id         run-id
                                                                     :shared-storage @shared-storage-ref
                                                                     :table-name->id tables->id
                                                                     :cancel-chan    cancel-chan})
          _                       (python-runner/open-cancellation-process! server-url run-id cancel-chan) ; inherits lifetime of cancel-chan
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
  (with-open [log-thread-ref     (open-log-future! run-id message-log)
              shared-storage-ref (python-runner/open-s3-shared-storage! (:source-tables source))]
    (let [driver     (:engine db)
          server-url (transforms.settings/python-execution-server-url)
          _          (python-runner/copy-tables-to-s3! {:run-id                  run-id
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
          {:keys [exit_code]} body
          ;; TODO temporary to keep more code stable while refactoring
          ;; no need to materialize these early (i.e output we can stream directly into a tmp file or db if small)
          {:keys [output output-manifest events]} (python-runner/read-output-objects @shared-storage-ref)]
      (.close log-thread-ref)           ; early close to force any writes to flush
      (when (seq events)
        (replace-python-logs! message-log events))
      (if (not= 200 status)
        (throw (ex-info (debug-info-str {:exit-code exit_code :events events}) ;; todo do better here
                        {:status-code     400
                         :api-status-code status
                         :body            body
                         :events          events
                         :error           (:error body)}))
        (try
          (let [temp-file (File/createTempFile "transform-output-" ".csv")]
            (when-not (seq (:fields output-manifest))
              (throw (ex-info "No fields in metadata"
                              {:metadata output-manifest
                               :raw-body body
                               :events   events})))
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
            (throw (ex-info "Failed to create the resulting table" {:error (.getMessage e)}))))))))

(defn execute-python-transform!
  "Execute a Python transform by calling the python runner.

  This is executing synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  [transform {:keys [run-method start-promise message-log]}]
  (when (transforms.util/python-transform? transform)
    (try
      (let [message-log (or message-log (atom {:pre-python  []
                                               :python      nil
                                               :post-python []}))
            {:keys [target] transform-id :id} transform
            {driver :engine :as db} (t2/select-one :model/Database (:database target))
            {run-id :id} (try-start-unless-already-running transform-id run-method)]
        (some-> start-promise (deliver [:started run-id]))
        (log! message-log "Executing Python transform")
        (log/info "Executing Python transform" transform-id "with target" (pr-str target))
        (let [start-ms (u/start-timer)
              transform-details
              {:db db
               :transform-type (keyword (:type target))
               :conn-spec (driver/connection-spec driver db)
               :output-schema (:schema target)
               :output-table (transforms.util/qualified-table-name driver target)}
              result   (run-cancelable-transform! run-id driver transform-details (fn [cancel-chan] (run-python-transform! transform db run-id cancel-chan message-log)))]
          (transforms.instrumentation/with-stage-timing [run-id :sync :table-sync]
            (sync-target! target db run-id))
          (log! message-log (format "Python execution finished in %s" (Duration/ofMillis (u/since-ms start-ms))))
          (save-log-as-message! run-id message-log)
          {:run_id run-id
           :result result}))
      (catch Throwable t
        (log/error t "Error executing Python transform")
        (log! message-log "Error executing python transform")
        (throw t)))))
