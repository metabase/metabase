(ns metabase-enterprise.worker.canceling
  (:require
   [clojure.core.async :as a]
   [metabase-enterprise.worker.models.worker-run :as worker-run]
   [metabase-enterprise.worker.models.worker-run-cancelation :as wr.cancelation]
   [metabase-enterprise.worker.tracking :as tracking]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Executors ExecutorService Future ScheduledExecutorService TimeUnit)))

(set! *warn-on-reflection* true)

(defonce ^:private ^ScheduledExecutorService scheduler (Executors/newScheduledThreadPool 1))
(defonce ^:private ^ExecutorService executor (Executors/newVirtualThreadPerTaskExecutor))

(defonce ^:private connections (atom {}))

(defn chan-start-run! [run-id cancel-chan]
  (swap! connections assoc run-id cancel-chan)
  nil)

(defn chan-end-run! [run-id]
  (-> (swap-vals! connections dissoc run-id)
      first ;; old value
      (get run-id)))

(defn chan-signal-cancel! [run-id]
  (when-some [cancel-chan (chan-end-run! run-id)]
    (a/put! cancel-chan :cancel!)
    true))

(defn chan-start-timeout-vthread! [run-id]
  (.submit executor ^Runnable (fn []
                                (Thread/sleep (* 4 60 60 1000)) ;; 4 hours
                                (chan-signal-cancel! run-id)
                                (worker-run/timeout-run! run-id))))

;; please do not export from module
(defn chan-start-timeout-vthread-worker-instance! [run-id]
  (.submit executor ^Runnable (fn []
                                (Thread/sleep (* 4 60 60 1000)) ;; 4 hours
                                (chan-signal-cancel! run-id)
                                ;; we don't store timeouts in worker db
                                )))

(defn- cancel-run-mb-instance! [run-id]
  (when (chan-signal-cancel! run-id)
    (worker-run/cancel-run! run-id)))

;; please do not export from module
(defn- cancel-run-worker-instance! [run-id]
  (when (chan-signal-cancel! run-id)
    #_(tracking/track-cancel! run-id)))

(defn schedule-cancel-runs!
  []
  (.scheduleAtFixedRate scheduler
                        #(try
                           (log/trace "Checking for canceling items.")
                           (run! (fn [{:keys [run_id]}]
                                   (try
                                     (cancel-run-worker-instance! run_id)
                                     (catch Throwable t
                                       (log/error t (str "Error canceling " run_id)))))
                                 (wr.cancelation/reducible-canceled-local-runs))
                           (catch Throwable t
                             (log/error t "Error while canceling on worker."))) 0 20 TimeUnit/SECONDS))

(defmethod task/init! ::CancelRuns [_]
  ;; does not use the Quartz scheduler, should only run on the instance
  (.scheduleAtFixedRate scheduler
                        #(try
                           (log/trace "Checking for canceling items.")
                           (run! (fn [{:keys [run_id]}]
                                   (try
                                     (cancel-run-mb-instance! run_id)
                                     (catch Throwable t
                                       (log/error t (str "Error canceling " run_id)))))
                                 (wr.cancelation/reducible-canceled-local-runs))
                           (catch Throwable t
                             (log/error t "Error while canceling on worker."))) 0 20 TimeUnit/SECONDS))
