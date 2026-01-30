(ns metabase-enterprise.transforms.util
  "Scheduled execution utilities for transforms.

   These functions require transform_run database access and are NOT in the base module.
   For base utilities, use metabase-enterprise.transforms-base.util directly."
  (:require
   [clojure.core.async :as a]
   [metabase-enterprise.transforms-base.core :as transforms-base]
   [metabase-enterprise.transforms-base.util :as transforms-base.util]
   [metabase-enterprise.transforms.canceling :as canceling]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.schema :as transforms.schema]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.query-processor.pipeline :as qp.pipeline]))

(set! *warn-on-reflection* true)


(defn try-start-unless-already-running
  "Start a transform run, throwing an informative error if already running.
   If `user-id` is provided, it will be stored with the run for attribution purposes."
  [id run-method user-id]
  (try
    (transform-run/start-run! id (cond-> {:run_method run-method}
                                   user-id (assoc :user_id user-id)))
    (catch java.sql.SQLException e
      (if (= (.getSQLState e) "23505")
        (throw (ex-info "Transform is already running"
                        {:error        :already-running
                         :transform-id id}
                        e))
        (throw e)))))

(defn run-cancelable-transform!
  "Execute a transform with cancellation support, status tracking, and proper error handling.

  This is the wrapper for scheduled execution that:
  1. Sets up cancellation channel and timeout
  2. Calls the base execution via `cancelled?` callback
  3. Updates transform_run status on completion/failure

  Options:
  - `:ex-message-fn` - customize how caught exceptions are presented in run logs"
  [run-id transform {:keys [ex-message-fn] :or {ex-message-fn ex-message}}]
  (try
    (canceling/chan-start-timeout-vthread! run-id (transforms.settings/transform-timeout))
    (let [cancel-chan (a/promise-chan)
          cancelled? (fn [] (boolean (a/poll! cancel-chan)))
          ;; Create timing wrapper that uses instrumentation
          with-stage-timing-fn (fn [rid stage thunk]
                                 (transforms.instrumentation/with-stage-timing [rid stage]
                                   (thunk)))
          result (binding [qp.pipeline/*canceled-chan* cancel-chan]
                   (canceling/chan-start-run! run-id cancel-chan)
                   (transforms-base/execute! transform
                                             {:cancelled? cancelled?
                                              :run-id run-id
                                              :with-stage-timing-fn with-stage-timing-fn}))]
      (case (:status result)
        :succeeded
        (do
          (transform-run/succeed-started-run! run-id)
          result)

        :cancelled
        (do
          (transform-run/cancel-run! run-id {:message (or (:logs result) "Canceled by user")})
          (throw (ex-info "Transform cancelled" (assoc result :status :cancelled))))

        :timeout
        (do
          (transform-run/timeout-run! run-id)
          (throw (ex-info "Transform timed out" (assoc result :status :timeout))))

        :failed
        ;; if we have it, throw an error using original message so it's not as generic
        (throw (ex-info (or (some-> (:error result) ex-message)
                            "Transform failed")
                        result
                        (:error result)))))
    (catch Throwable t
      (transform-run/fail-started-run! run-id {:message (or (:logs (ex-data t))
                                                            (ex-message-fn t))})
      (throw t))
    (finally
      (canceling/chan-end-run! run-id))))

(defn execute-secondary-index-ddl-if-required!
  "Execute secondary index DDL with instrumentation timing.
  Wraps base function with transforms.instrumentation timing."
  [transform run-id database target]
  (let [with-timing (fn [rid stage thunk]
                      (transforms.instrumentation/with-stage-timing [rid stage]
                        (thunk)))]
    (transforms-base.util/execute-secondary-index-ddl-if-required!
     transform run-id database target with-timing)))
