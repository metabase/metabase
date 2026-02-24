(ns metabase-enterprise.transforms-javascript.execute
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.app-db.core :as app-db]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.util :as driver.u]
   [metabase.transforms.core :as transforms]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.util :as transforms.util]
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
  "Returns a new message log for JavaScript transform execution."
  []
  (atom {:pre-js []
         :js nil
         :post-js []}))

(defn- log!
  [message-log s]
  (swap! message-log (fn [m] (update m (if (:js m) :post-js :pre-js) conj s)))
  nil)

(defn- replace-js-logs!
  [message-log events]
  (swap! message-log assoc :js events)
  nil)

(defn- message-log->transform-run-message
  [message-log]
  (let [{:keys [pre-js js post-js]} @message-log]
    (str/join "\n" (concat pre-js
                           (map :message js)
                           post-js))))

(defn- save-log-to-transform-run-message!
  [run-id message-log]
  (t2/update! :model/TransformRun
              :id run-id
              {:message (message-log->transform-run-message message-log)}))

(def ^:private ^Duration js-message-loop-sleep-duration
  (Duration/ofMillis 1000))

(defn- js-message-update-loop!
  [run-id message-log]
  (try
    (loop []
      (if (.isInterrupted (Thread/currentThread))
        (log/debug "Message update loop interrupted")
        (do (let [sleep-ms (.toMillis js-message-loop-sleep-duration)]
              (when (pos? sleep-ms) (Thread/sleep sleep-ms)))
            (let [{:keys [status body]} (python-runner/get-logs run-id)]
              (cond
                (<= 200 status 299)
                (let [{:keys [execution_id events]} body]
                  (if-not (= run-id execution_id)
                    (do (log/debugf "Run id did not match expected: %s actual: %s" run-id execution_id)
                        (recur))
                    (do
                      (replace-js-logs! message-log events)
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

(defn- open-js-message-update-future! ^Closeable [run-id message-log]
  (let [cleanup (fn [fut]
                  (future-cancel fut)
                  (if (= ::timeout (try (deref fut 10000 ::timeout) (catch Throwable _)))
                    (log/fatalf "Log polling task did not respond to interrupt, run-id: %s" run-id)
                    (log/debugf "Log polling task done, run-id: %s" run-id)))
        fut (u.jvm/in-virtual-thread*
             (js-message-update-loop! run-id message-log))]
    (reify Closeable
      (close [_] (cleanup fut)))))

(defn- maybe-retry-with-backoff
  [driver thunk]
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
   :columns (mapv (fn [{:keys [name base_type]}]
                    {:name name
                     :type (python-runner/restricted-insert-type base_type)
                     :nullable? true})
                  (:fields metadata))})

(defn- insert-data!
  [driver db-id table-schema data-source]
  (let [data-source (assoc data-source :table-schema table-schema)]
    (->> #(driver/insert-from-source! driver db-id table-schema data-source)
         (maybe-retry-with-backoff driver))))

(defn- create-table-and-insert-data!
  [driver db-id table-schema data-source]
  (transforms.util/create-table-from-schema! driver db-id table-schema)
  (insert-data! driver db-id table-schema data-source))

(defn- transfer-with-rename-tables-strategy!
  [driver db-id table-name metadata data-source]
  (let [source-table-name (driver.u/temp-table-name driver table-name)
        temp-table-name (driver.u/temp-table-name driver table-name)]
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
  [server-url run-id cancel-chan]
  (a/go (when (a/<! cancel-chan)
          (python-runner/cancel-python-code-http-call! server-url run-id))))

(defn- run-javascript-transform! [{:keys [source] :as transform} db run-id cancel-chan message-log]
  (let [resolved-source-tables (transforms.util/resolve-source-tables (:source-tables source))]
    (with-open [^Closeable log-future-ref
                (if (app-db/in-transaction?)
                  (reify Closeable (close [_]))
                  (open-js-message-update-future! run-id message-log))
                shared-storage-ref (s3/open-shared-storage! resolved-source-tables)]
      (let [driver (:engine db)
            server-url (transforms-python.settings/python-runner-url)
            _ (python-runner/copy-tables-to-s3! {:run-id run-id
                                                 :shared-storage @shared-storage-ref
                                                 :source (assoc source :source-tables resolved-source-tables)
                                                 :cancel-chan cancel-chan
                                                 :limit (:limit source)
                                                 :transform-id (:id transform)})
            _ (start-cancellation-process! server-url run-id cancel-chan)
            {:keys [status body] :as response}
            (python-runner/execute-python-code-http-call!
             {:server-url server-url
              :code (:body source)
              :run-id run-id
              :table-name->id resolved-source-tables
              :shared-storage @shared-storage-ref
              :runtime "javascript"})

            output-manifest (python-runner/read-output-manifest @shared-storage-ref)
            events (python-runner/read-events @shared-storage-ref)]
        (.close ^Closeable log-future-ref)
        (replace-js-logs! message-log events)
        (if (not= 200 status)
          (do
            (when (:timeout body)
              (transforms/timeout-run! run-id))
            (throw (ex-info "JavaScript runner call failed"
                            {:transform-message (i18n/tru "JavaScript execution failure (exit code {0})" (:exit_code body "?"))
                             :status-code 400
                             :api-status-code status
                             :body body
                             :events events})))
          (try
            (let [temp-path (Files/createTempFile "transform-output-" ".jsonl" (u/varargs FileAttribute))
                  temp-file (.toFile temp-path)]
              (when-not (seq (:fields output-manifest))
                (throw (ex-info "No fields in metadata"
                                {:metadata output-manifest
                                 :raw-body body
                                 :events events})))
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
              (log/error e "Failed to create resulting table")
              (throw (ex-info "Failed to create the resulting table"
                              {:transform-message (or (:transform-message (ex-data e))
                                                      (i18n/tru "Failed to create the resulting table"))}
                              e)))))))))

(defn- exceptional-run-message [message-log ex]
  (str/join "\n" (remove str/blank? [(message-log->transform-run-message message-log)
                                     (or (:transform-message (ex-data ex))
                                         (if (instance? InterruptedException ex)
                                           (i18n/tru "Transform interrupted")
                                           (i18n/tru "Something went wrong")))])))

(defn execute-javascript-transform!
  "Execute a JavaScript transform by calling the runner.

  Blocks until the transform returns."
  [transform {:keys [run-method start-promise user-id]}]
  (assert (transforms.util/javascript-transform? transform) "Transform must be a javascript transform")
  (try
    (let [message-log (empty-message-log)
          {:keys [target owner_user_id creator_id] transform-id :id} transform
          {driver :engine :as db} (t2/select-one :model/Database (transforms.i/target-db-id transform))
          run-user-id (if (and (= run-method :manual) user-id)
                        user-id
                        (or owner_user_id creator_id))
          {run-id :id} (transforms.util/try-start-unless-already-running transform-id run-method run-user-id)]
      (some-> start-promise (deliver [:started run-id]))
      (log! message-log (i18n/tru "Executing JavaScript transform"))
      (driver.conn/with-write-connection
        (log/info "Executing JavaScript transform" transform-id "with target" (pr-str target)
                  (when (driver.conn/write-connection-requested?)
                    " using write connection"))
        (let [start-ms (u/start-timer)
              conn-spec (driver/connection-spec driver db)
              transform-details {:db-id (:id db)
                                 :transform-id transform-id
                                 :transform-type (keyword (:type target))
                                 :conn-spec conn-spec
                                 :output-schema (:schema target)
                                 :output-table (transforms.util/qualified-table-name driver target)}
              run-fn (fn [cancel-chan]
                       (run-javascript-transform! transform db run-id cancel-chan message-log)
                       (log! message-log (i18n/tru "JavaScript execution finished successfully in {0}" (u.format/format-milliseconds (u/since-ms start-ms))))
                       (save-log-to-transform-run-message! run-id message-log))
              ex-message-fn #(exceptional-run-message message-log %)
              result (transforms.instrumentation/with-stage-timing [run-id [:computation :javascript-execution]]
                       (transforms.util/run-cancelable-transform! run-id driver transform-details run-fn :ex-message-fn ex-message-fn))]
          (transforms.util/handle-transform-complete!
           :run-id run-id
           :transform transform
           :db db)
          {:run_id run-id
           :result result})))
    (catch Throwable t
      (log/error t "Error executing JavaScript transform")
      (throw t))))
