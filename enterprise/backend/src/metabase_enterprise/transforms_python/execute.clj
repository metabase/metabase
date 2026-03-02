(ns metabase-enterprise.transforms-python.execute
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.base :as base]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase.app-db.core :as app-db]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.i18n :as i18n]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io Closeable)
   (java.net SocketException)
   (java.time Duration)))

(set! *warn-on-reflection* true)

(defn- save-log-to-transform-run-message!
  "Saves the content of the log into the transform_run's message field. Lossy, string contains user facing information only."
  [run-id message-log]
  (t2/update! :model/TransformRun
              :id run-id
              {:message (base/message-log->string message-log)}))

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
                      (swap! message-log assoc :python events)
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

(defn- exceptional-run-message [message-log ex]
  (str/join "\n" (remove str/blank? [(base/message-log->string message-log)
                                     (or (:transform-message (ex-data ex))
                                         (if (instance? InterruptedException ex)
                                           (i18n/tru "Transform interrupted")
                                           (i18n/tru "Something went wrong")))])))

(defn execute-python-transform!
  "Execute a Python transform by calling the python runner.

  Blocks until the transform returns."
  [transform {:keys [run-method start-promise user-id]}]
  (try
    (let [message-log                                                (base/empty-message-log)
          {:keys [target owner_user_id creator_id] transform-id :id} transform
          {driver :engine :as db}                                    (t2/select-one :model/Database (transforms-base.i/target-db-id transform))
          run-user-id                                                (if (and (= run-method :manual) user-id)
                                                                       user-id
                                                                       (or owner_user_id creator_id))
          {run-id :id}                                               (transforms.u/try-start-unless-already-running transform-id run-method run-user-id)]
      (some-> start-promise (deliver [:started run-id]))
      (with-open [_ (if (app-db/in-transaction?)
                      ;; if in a transaction (such as under mt/with-temp), it is not safe to poll for logs
                      ^Closeable (reify Closeable (close [_]))
                      (open-python-message-update-future! run-id message-log))]
        (driver.conn/with-write-connection
          (let [conn-spec         (driver/connection-spec driver db)
                transform-details {:db-id (:id db) :conn-spec conn-spec :output-schema (:schema target)}
                run-fn            (fn [cancel-chan]
                                    (let [result (transforms-base.i/execute-base!
                                                  transform
                                                  {:cancelled?           #(boolean (a/poll! cancel-chan))
                                                   :run-id               run-id
                                                   :message-log          message-log
                                                   :with-stage-timing-fn (fn [rid stage thunk]
                                                                           (transforms.instrumentation/with-stage-timing [rid stage]
                                                                             (thunk)))})]
                                      (save-log-to-transform-run-message! run-id message-log)
                                      (when-not (= :succeeded (:status result))
                                        (throw (or (:error result) (ex-info "Transform failed" {:status (:status result)}))))
                                      result))
                ex-message-fn     #(exceptional-run-message message-log %)
                result            (transforms.instrumentation/with-stage-timing [run-id [:computation :python-execution]]
                                    (transforms.u/run-cancelable-transform! run-id driver transform-details run-fn :ex-message-fn ex-message-fn))]
            ;; Table.transform_id update
            (when-let [table (t2/select-one :model/Table
                                            :db_id (:id db)
                                            :schema (:schema target)
                                            :name (:name target))]
              (t2/update! :model/Table (:id table) {:transform_id transform-id}))
            {:run_id run-id :result result}))))
    (catch Throwable t
      (log/error t "Error executing Python transform")
      (throw t))))
