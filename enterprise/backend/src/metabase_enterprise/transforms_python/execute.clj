(ns metabase-enterprise.transforms-python.execute
  "Python transform implementation for scheduled execution.

   This namespace provides the scheduled wrapper that creates transform_run rows,
   tracks status, and saves logs. The actual execution logic is in transforms-base.python."
  (:require
   [metabase-enterprise.transforms-base.util :as transforms-base.util]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Log Saving -------------------------------------------------

(defn- save-log-to-transform-run-message!
  "Saves logs to the transform_run's message field."
  [run-id logs]
  (when (and run-id logs)
    (t2/update! :model/TransformRun run-id {:message logs})))

;;; ------------------------------------------------- Scheduled Execution Wrapper --------------------------------

(defn execute-python-transform!
  "Execute a Python transform with transform_run tracking.

   This wrapper:
   1. Creates a transform_run row via try-start-unless-already-running
   2. Calls the base execution
   3. Saves logs to transform_run.message
   4. Updates transform_run status on completion/failure

   Blocks until the transform returns."
  [transform {:keys [run-method start-promise user-id]}]
  (assert (transforms-base.util/python-transform? transform) "Transform must be a python transform")
  (try
    (let [{:keys [owner_user_id creator_id] transform-id :id} transform
          ;; For manual runs, use the triggering user; for cron, use owner/creator
          run-user-id (if (and (= run-method :manual) user-id)
                        user-id
                        (or owner_user_id creator_id))
          {run-id :id} (transforms.util/try-start-unless-already-running transform-id run-method run-user-id)]
      (some-> start-promise (deliver [:started run-id]))
      (log/info "Executing Python transform" transform-id)

      ;; Call the base execution - it handles all the work and returns results
      (let [result (transforms.util/run-cancelable-transform!
                    run-id transform
                    {:ex-message-fn (fn [ex]
                                      (or (:transform-message (ex-data ex))
                                          (ex-message ex)))})]
        ;; Save logs if available in result
        (when-let [logs (:logs result)]
          (save-log-to-transform-run-message! run-id logs))
        {:run_id run-id
         :result result})
      (catch Throwable t
        ;; Save logs from exception data if available
        (when-let [logs (:logs (ex-data t))]
          (save-log-to-transform-run-message! run-id logs))
        (log/error t "Error executing Python transform")
        (throw t)))))
