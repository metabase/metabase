(ns metabase-enterprise.transforms-python.execute
  "Python transform implementation for scheduled execution.

   This namespace provides the scheduled wrapper that creates transform_run rows,
   tracks status, and saves logs. The actual execution logic is in transforms-base.python."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-base.util :as transforms-base.util]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io Closeable)
   (java.net SocketException)
   (java.time Duration)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Log Saving -------------------------------------------------

(defn- save-log-to-transform-run-message!
  "Saves logs to the transform_run's message field."
  [run-id logs]
  (when (and run-id logs)
    (t2/update! :model/TransformRun run-id {:message logs})))

;;; ------------------------------------------------- Log Polling Loop -------------------------------------------------

(def ^:private ^Duration python-message-loop-sleep-duration
  "How often to poll for log updates during Python execution.
  Should be short enough to provide meaningful feedback during execution."
  (Duration/ofMillis 50))

(defn- python-message-update-loop!
  "Block while relevant log data is replicated from the runner into the transform_run.message field.
  The loop will poll the python runner /logs endpoint and save the logs to the database.

  The loop will exit on error or when interrupted."
  [run-id]
  (try
    (loop []
      (if (.isInterrupted (Thread/currentThread))
        (log/debug "Message update loop interrupted")
        (let [{:keys [status body]} (python-runner/get-logs run-id)]
          (cond
            (<= 200 status 299)
            (let [{:keys [execution_id events]} body]
              (if-not (= run-id execution_id)
                (do (log/debugf "Run id did not match expected: %s actual: %s" run-id execution_id)
                    (Thread/sleep (.toMillis python-message-loop-sleep-duration))
                    (recur))
                (let [message (str "Executing Python transform\n"
                                   (->> events (map :message) (str/join "\n")))]
                  (save-log-to-transform-run-message! run-id message)
                  (Thread/sleep (.toMillis python-message-loop-sleep-duration))
                  (recur))))
            (= 404 status)
            (do
              (log/debugf "No logs yet (or run finished), run-id: %s" run-id)
              (Thread/sleep (.toMillis python-message-loop-sleep-duration))
              (recur))
            :else
            (do
              (log/warnf "Unexpected status polling for logs %s %s, run-id: %s" status body run-id)
              (log/debug "Exiting due to poll error"))))))
    (catch SocketException se (when-not (= "Closed by interrupt" (ex-message se)) (throw se)))
    (catch InterruptedException _)
    (catch Throwable e
      (log/errorf e "An exception was caught during msg update loop, run-id: %s" run-id))))

(defn- open-python-message-update-future!
  "Start a background thread that polls for logs and updates transform_run.message.
  Returns a Closeable that should be closed when execution completes."
  ^Closeable [run-id]
  (let [cleanup (fn [fut]
                  (future-cancel fut)
                  (if (= ::timeout (try (deref fut 10000 ::timeout) (catch Throwable _)))
                    (log/fatalf "Log polling task did not respond to interrupt, run-id: %s" run-id)
                    (log/debugf "Log polling task done, run-id: %s" run-id)))
        fut     (u.jvm/in-virtual-thread*
                 (python-message-update-loop! run-id))]
    (reify Closeable
      (close [_] (cleanup fut)))))

;;; ------------------------------------------------- Scheduled Execution Wrapper --------------------------------

(defn execute-python-transform!
  "Execute a Python transform with transform_run tracking.

   This wrapper:
   1. Creates a transform_run row via try-start-unless-already-running
   2. Starts a background log polling loop for immediate feedback
   3. Calls the base execution
   4. Saves logs to transform_run.message
   5. Updates transform_run status on completion/failure

   Blocks until the transform returns."
  [transform {:keys [run-method start-promise user-id]}]
  (assert (transforms-base.util/python-transform? transform) "Transform must be a python transform")
  (let [*run-id (atom nil)]
    (try
      (let [{:keys [owner_user_id creator_id] transform-id :id} transform
            ;; For manual runs, use the triggering user; for cron, use owner/creator
            run-user-id  (if (and (= run-method :manual) user-id)
                           user-id
                           (or owner_user_id creator_id))
            {run-id :id} (transforms.util/try-start-unless-already-running transform-id run-method run-user-id)]
        (reset! *run-id run-id)

        (some-> start-promise (deliver [:started run-id]))
        (log/info "Executing Python transform" transform-id)

        ;; Start log polling loop for immediate feedback during execution
        (with-open [_log-poller (open-python-message-update-future! run-id)]
          ;; Call the base execution - it handles all the work and returns results
          (let [result (transforms.util/run-cancelable-transform!
                        run-id transform
                        {:ex-message-fn (fn [ex]
                                          (or (:transform-message (ex-data ex))
                                              (ex-message ex)))})]
            ;; Save final logs (this overwrites the polled logs with the complete log)
            (when-let [logs (:logs result)]
              (save-log-to-transform-run-message! run-id logs))
            {:run_id run-id
             :result result})))
      (catch Throwable t
        ;; Save logs from exception data if available
        (when @*run-id
          (when-let [logs (:logs (ex-data t))]
            (save-log-to-transform-run-message! @*run-id logs)))
        (log/error t "Error executing Python transform")
        (throw t)))))
