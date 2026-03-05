(ns metabase.transforms.canceling
  (:require
   [clojure.core.async :as a]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.models.transforms.transform-run :as transform-run]
   [metabase.models.transforms.transform-run-cancelation :as wr.cancelation]
   [metabase.task.core :as task]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Executors ScheduledExecutorService TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.transforms.canceling")

(defonce ^:private ^ScheduledExecutorService scheduler
  (Executors/newScheduledThreadPool 1))

(defonce ^:private connections (atom {}))

(defn chan-start-run!
  "Registers cancel-chan for run-id"
  [run-id cancel-chan]
  (swap! connections assoc run-id cancel-chan)
  nil)

(defn chan-end-run!
  "Deregisters the cancel-chan for run-id and returns the channel"
  [run-id]
  (-> (swap-vals! connections dissoc run-id)
      first ;; old value
      (get run-id)))

(defn chan-signal-cancel!
  "Cancels the run for a given run-id"
  [run-id]
  (when-some [cancel-chan (chan-end-run! run-id)]
    (a/put! cancel-chan :cancel!)
    true))

(defn chan-start-timeout-vthread!
  "Starts a thread that will signal a timeout after a given number of minutes."
  [run-id timeout-minutes]
  (u.jvm/in-virtual-thread*
   (Thread/sleep (long (* timeout-minutes 60 1000))) ;; 4 hours
   (chan-signal-cancel! run-id)
   (transform-run/timeout-run! run-id)))

(defn cancel-run!
  "Cancel a run with id."
  [run-id]
  (when (chan-signal-cancel! run-id)
    (transform-run/cancel-run! run-id)))

(defn- cancel-old-transform-runs! [_ctx]
  (log/trace "Canceling items that haven't been marked canceled.")
  (try
    (transform-run/cancel-old-canceling-runs! 2 :minute)
    (catch Throwable t
      (log/error t "Error canceling items not marked canceled."))))

(task/defjob  ^{:doc "Cancel items that haven't been canceled in two minutes"
                org.quartz.DisallowConcurrentExecution true}
  CancelOldTransformRuns [ctx]
  (cancel-old-transform-runs! ctx))

(defn- start-job! []
  (when (not (task/job-exists? job-key))
    (let [job (jobs/build
               (jobs/of-type CancelOldTransformRuns)
               (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key job-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                    (calendar-interval/schedule
                     (calendar-interval/with-interval-in-minutes 10)
                     (calendar-interval/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))

(defmethod task/init! ::CancelOldTransformRuns [_]
  (log/info "Scheduling cancel transforms task.")
  (start-job!))

(defmethod task/init! ::CancelRuns [_]
  (log/info "Scheduling the cancelation background task.")
  ;; does not use the Quartz scheduler
  (.scheduleAtFixedRate scheduler
                        #(try
                           (log/trace "Checking for canceling items.")
                           (run! (fn [cancelation]
                                   (let [id (:run_id cancelation)]
                                     (try
                                       (cancel-run! id)
                                       (catch Throwable t
                                         (log/error t (str "Error canceling " id))))))
                                 (wr.cancelation/reducible-canceled-local-runs))
                           (catch Throwable t
                             (log/error t "Error while canceling a transform run."))) 0 20 TimeUnit/SECONDS))
