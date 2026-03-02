(ns metabase-enterprise.transforms-python.execute
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.base :as transforms-python.base]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase.app-db.core :as app-db]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.transforms-base.util :as transforms-base.util]
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
   (java.time Duration)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Transform-run log persistence ------------------------------------

(defn- save-log-to-transform-run-message!
  "Saves the content of the log into the transform_run's message field."
  [run-id message-log]
  (t2/update! :model/TransformRun
              :id run-id
              {:message (transforms-python.base/message-log->transform-run-message message-log)}))

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
                      (transforms-python.base/replace-python-logs! message-log events)
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

;;; ------------------------------------------------- Lifecycle wrapper ------------------------------------------------

(defn- exceptional-run-message [message-log ex]
  (str/join "\n" (remove str/blank?
                         [(transforms-python.base/message-log->transform-run-message message-log)
                          (or (:transform-message (ex-data ex))
                              (if (instance? InterruptedException ex)
                                (i18n/tru "Transform interrupted")
                                (i18n/tru "Something went wrong")))])))

(defn execute-python-transform!
  "Execute a Python transform by calling the python runner.

  Blocks until the transform returns."
  [transform {:keys [run-method start-promise user-id]}]
  (assert (transforms-base.util/python-transform? transform) "Transform must be a python transform")
  (try
    (let [message-log                                                (transforms-python.base/empty-message-log)
          {:keys [target owner_user_id creator_id] transform-id :id} transform
          {driver :engine :as db}                                    (t2/select-one :model/Database (transforms.i/target-db-id transform))
          ;; For manual runs, use the triggering user; for cron, use owner/creator
          run-user-id                                                (if (and (= run-method :manual) user-id)
                                                                       user-id
                                                                       (or owner_user_id creator_id))
          {run-id :id}                                               (transforms.util/try-start-unless-already-running transform-id run-method run-user-id)]
      (some-> start-promise (deliver [:started run-id]))
      (transforms-python.base/log! message-log (i18n/tru "Executing Python transform"))
      (driver.conn/with-write-connection
        (log/info "Executing Python transform" transform-id "with target" (pr-str target)
                  (when (driver.conn/write-connection-requested?)
                    " using write connection"))
        (let [start-ms          (u/start-timer)
              conn-spec         (driver/connection-spec driver db)
              transform-details {:db-id          (:id db)
                                 :transform-id   transform-id
                                 :transform-type (keyword (:type target))
                                 :conn-spec      conn-spec
                                 :output-schema  (:schema target)
                                 :output-table   (transforms-base.util/qualified-table-name driver target)}
              run-fn            (fn [cancel-chan]
                                  (with-open [^Closeable _log-future-ref
                                              (if (app-db/in-transaction?)
                                                (reify Closeable (close [_]))
                                                (open-python-message-update-future! run-id message-log))]
                                    (transforms-python.base/run-python-transform! transform db run-id cancel-chan message-log))
                                  (transforms-python.base/log! message-log (i18n/tru "Python execution finished successfully in {0}" (u.format/format-milliseconds (u/since-ms start-ms))))
                                  (save-log-to-transform-run-message! run-id message-log))
              ex-message-fn     #(exceptional-run-message message-log %)
              result            (transforms.instrumentation/with-stage-timing [run-id [:computation :python-execution]]
                                  (transforms.util/run-cancelable-transform! run-id driver transform-details run-fn :ex-message-fn ex-message-fn))]
          (transforms.util/handle-transform-complete!
           :run-id run-id
           :transform transform
           :db db)
          {:run_id run-id
           :result result})))
    (catch Throwable t
      (log/error t "Error executing Python transform")
      (throw t))))
