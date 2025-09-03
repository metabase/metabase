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
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.upload.core :as upload]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (clojure.lang IDeref)
   (java.io Closeable File)
   (java.time Duration)))

(set! *warn-on-reflection* true)

(mr/def ::transform-details
  [:map
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :table]]
   [:connection-details :any]
   [:query :string]
   [:output-table [:keyword {:decode/normalize schema.common/normalize-keyword}]]])

(mr/def ::transform-opts
  [:map
   [:overwrite? :boolean]])

(defmacro with-transform-lifecycle
  "Macro to manage transform run lifecycle. Starts a run, executes body,
   and handles success/failure appropriately.

   Usage:
   (with-transform-lifecycle [run-id transform-id opts]
     ;; body that returns result on success or throws on failure
     )"
  [[run-id-sym [transform-id opts]] & body]
  `(let [{~run-id-sym :id} (transform-run/start-run! ~transform-id ~opts)]
     (try
       (let [result# (do ~@body)]
         (transform-run/succeed-started-run! ~run-id-sym)
         result#)
       (catch Throwable t#
         (transform-run/fail-started-run! ~run-id-sym {:message (.getMessage t#)})
         (throw t#)))))

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
  [run-id run-transform!]
  ;; local run is responsible for status, using canceling lifecycle
  (try
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
           transform-details {:transform-type (keyword (:type target))
                              :connection-details (driver/connection-details driver database)
                              :query (transforms.util/compile-source source)
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
         (run-cancelable-transform! run-id (fn [_cancel-chan] (driver/run-transform! driver transform-details opts)))
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

(defn- replace-python-logs! [message-log stdout stderr]
  ;; todo would be better to interleave python output
  (when message-log
    (swap! message-log assoc :python (str/join "\n" (remove str/blank? [stdout stderr]))))
  nil)

(defn- save-log-as-message! [run-id message-log]
  (when message-log
    (let [{:keys [pre-python python post-python]} @message-log]
      (t2/update! :model/TransformRun
                  :id run-id
                  {:message (str/join "\n" (concat pre-python
                                                   (for [l (str/split-lines python)]
                                                     (str "\033[32m" l "\033[0m"))
                                                   post-python))}))))

(defn- log-loop! [run-id message-log]
  ;; TODO ensure we poll only for this run-id
  (let [poll python-runner/get-logs]
    (try
      (loop []
        (if (.isInterrupted (Thread/currentThread))
          (log/debug "Message update loop interrupted")
          (do (Thread/sleep 1000)
              (let [{:keys [status body]} (poll)]
                (if-not (= 200 status)
                  (do
                    (log/warnf "Something went wrong polling the logs %s %s" status body)
                    (log/debug "Exiting due to poll error"))
                  (let [{:keys [execution_id stdout stderr]} body]
                    (if-not (= run-id execution_id)
                      (do (log/debugf "Run id did not match expected: %s actual: %s" run-id execution_id)
                          (recur))
                      (do
                        (replace-python-logs! message-log stdout stderr)
                        (save-log-as-message! run-id message-log)
                        (recur)))))))))
      (catch InterruptedException _)
      (catch Throwable e
        (log/errorf e "An exception was caught during msg update loop, run-id: %s" run-id)))))

(defn- open-log-thread! ^Closeable [run-id message-log]
  (let [log-thread-promise (promise)
        cleanup (fn []
                  (let [^Thread log-thread (deref log-thread-promise 1000 nil)]
                    (when-not log-thread (log/fatalf "Log thread reference not bound, run-id: %s" run-id))
                    (when (.isAlive log-thread)
                      (.interrupt log-thread)
                      (when-not (.join log-thread (Duration/ofSeconds 10))
                        (log/fatalf "Log thread could not be interrupted, run-id: %s" run-id)))))]
    (u.jvm/in-virtual-thread*
     (deliver log-thread-promise (Thread/currentThread))
     (log-loop! run-id message-log))
    (when-not (deref log-thread-promise 1000 nil) (log/fatalf "Log thread reference not bound, run-id: %s" run-id))
    (reify
      IDeref
      (deref [_] @log-thread-promise)
      Closeable
      (close [_] (cleanup)))))

(defn call-python-runner-api!
  "Call the Python runner API endpoint to execute Python code.
   Returns the result map or throws on error."
  [code table-name->id run-id cancel-chan]
  ;; TODO probably don't need this hack anymore, double check
  (transforms.instrumentation/with-python-api-timing [run-id]
    (update (python-runner/execute-python-code run-id code table-name->id cancel-chan)
            :body #(if (string? %) json/decode+kw %))))

(defn- debug-info-str [{:keys [exit-code stdout stderr]}]
  (str/join "\n"
            ["stdout"
             "======"
             stdout
             "stderr"
             "======"
             stderr
             "======"
             (format "exit code %d" exit-code)]))

(defn- run-python-transform! [{:keys [schema name]} {:keys [source-tables body]} db run-id cancel-chan message-log]
  (with-open [log-thread-ref (open-log-thread! run-id message-log)]
    (let [driver                           (:engine db)
          {:keys [body status] :as result} (call-python-runner-api! body source-tables run-id cancel-chan)
          {:keys [stdout stderr]}          body]
      (.close log-thread-ref)                               ; early close to force any writes to flush
      (when (or stdout stderr)
        (replace-python-logs! message-log stdout stderr))
      (if (not= 200 status)
        (throw (ex-info (debug-info-str body)
                        {:status-code 400
                         :api-status-code status
                         :body        body
                         :error       (or stderr (:error body))
                         :stdout      stdout
                         :stderr      stderr}))
        (try
          ;; TODO would be nice if we have create or replace in upload
          ;; NOTE (chris) we do have a replace, so this would be easy! but we're gonna stop using csv
          ;; TODO we can remove this hack once we move away from upload-csv
          (binding [api/*is-superuser?* true]
            (when-let [table (t2/select-one :model/Table
                                            :name (ddl.i/format-name driver name)
                                            :schema (ddl.i/format-name driver schema)
                                            :db_id (:id db))]
              (upload/delete-upload! table)
              ;; TODO shouldn't this be handled in upload?
              ;; NO - because we don't delete these records typically, we just mark them as inactive (chris)
              ;;      this hack here actually breaks links - we'll want the :model/Table id to be stable in prod
              (t2/delete! :model/Table (:id table)))
            (let [temp-file (File/createTempFile "transform-output-" ".csv")
                  csv-data  (:output body)]
              (try
                (with-open [writer (io/writer temp-file)]
                  (.write writer ^String csv-data))
                (let [file-size (.length temp-file)]
                  (transforms.instrumentation/record-data-transfer! run-id :file-to-dwh file-size nil)
                  (transforms.instrumentation/with-stage-timing [run-id :data-transfer :file-to-dwh]
                    (upload/create-from-csv-and-sync! {:db         db
                                                       :filename   (.getName temp-file)
                                                       :file       temp-file
                                                       :schema     schema
                                                       :table-name name})))
                (finally
                  (.delete temp-file))))
            result)
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
            {:keys [source target] transform-id :id} transform
            db (t2/select-one :model/Database (:target-database source))
            {run-id :id} (try-start-unless-already-running transform-id run-method)]
        (some-> start-promise (deliver [:started run-id]))
        (log! message-log "Executing Python transform")
        (log/info "Executing Python transform" transform-id "with target" (pr-str target))
        (let [start-ms (u/start-timer)
              result   (run-cancelable-transform! run-id (fn [cancel-chan] (run-python-transform! target source db run-id cancel-chan message-log)))]
          (log! message-log (format "Python execution finished in %s" (Duration/ofMillis (u/since-ms start-ms))))
          (save-log-as-message! run-id message-log)
          {:run_id run-id
           :result result}))
      (catch Throwable t
        (log/error t "Error executing Python transform")
        (log! message-log "Error executing python transform")
        (throw t)))))
