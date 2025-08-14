(ns metabase-enterprise.transforms.canceling
  (:require
   [clojure.core.async :as a]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.models.transform-run-cancelation :as wr.cancelation]
   [metabase.task.core :as task]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Executors ScheduledExecutorService TimeUnit)))

(set! *warn-on-reflection* true)

(defonce ^:private ^ScheduledExecutorService scheduler
  (Executors/newScheduledThreadPool 1))

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

(defn chan-start-timeout-vthread! [run-id timeout-minutes]
  (u.jvm/in-virtual-thread*
   (Thread/sleep (long (* timeout-minutes 60 1000))) ;; 4 hours
   (chan-signal-cancel! run-id)
   (transform-run/timeout-run! run-id)))

(defn- cancel-run! [run-id]
  (when (chan-signal-cancel! run-id)
    (transform-run/cancel-run! run-id)))

(defmethod task/init! ::CancelRuns [_]
  ;; does not use the Quartz scheduler
  (.scheduleAtFixedRate scheduler
                        #(try
                           (log/trace "Checking for canceling items.")
                           (run! (fn [{:keys [id]}]
                                   (try
                                     (cancel-run! id)
                                     (catch Throwable t
                                       (log/error t (str "Error canceling " id)))))
                                 (wr.cancelation/reducible-canceled-local-runs))
                           (catch Throwable t
                             (log/error t "Error while canceling a transform run."))) 0 20 TimeUnit/SECONDS))
