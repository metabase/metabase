(ns metabase.analytics.quartz
  (:require
   [clojurewerkz.quartzite.matchers :as qm]
   [clojurewerkz.quartzite.scheduler :as qs]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   [org.quartz JobListener Scheduler TriggerListener Trigger$TriggerState]))

(set! *warn-on-reflection* true)

(def ^:private listener-name ::prometheus-job-execution-listener)

;; +----------------------------------------------------------------------------------------------------------------+
;; |                                             Job Listener                                                       |
;; +----------------------------------------------------------------------------------------------------------------+

(defn create-job-execution-listener
  "Creates an instance of an anonymous JobListener to record execution metrics to prometheus."
  ^JobListener [] ; No registry argument needed
  (reify JobListener
    (getName [_]
      (name listener-name))

    (jobToBeExecuted [_ _])

    (jobExecutionVetoed [_ _])

    (jobWasExecuted [_ ctx job-exception]
      (try
        (let [tags {:status (if job-exception "failed" "succeeded")
                    :job-name (.. ctx getJobDetail getKey toString)}]
          (prometheus/inc! :metabase-tasks/quartz-tasks-executed tags))
        (catch Throwable e
          (log/error e "Failed to record Prometheus metric for Quartz job completion"))))))

;; +----------------------------------------------------------------------------------------------------------------+
;; |                                             Trigger Listener                                                   |
;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private trigger-listener-name ::prometheus-trigger-listener)

(defn- get-quartz-task-states
  "Fetches the counts of Quartz tasks in various states."
  [^Scheduler scheduler]
  (let [executing-count (count (.getCurrentlyExecutingJobs scheduler))
        state-counts    (->> (qs/get-trigger-group-names scheduler)
                             (map qm/group-equals)
                             (mapcat #(qs/get-trigger-keys scheduler %))
                             (group-by #(.getTriggerState scheduler %))
                             (into {} (map (fn [[state keys]] [state (count keys)]))))]
    ;; Combine executing count with counts derived from trigger states
    (concat
     [["EXECUTING" executing-count]]
     (map (fn [[quartz-state state-label]]
            (let [count (get state-counts quartz-state 0)]
              [state-label count]))
          [[Trigger$TriggerState/NORMAL "WAITING"]
           [Trigger$TriggerState/PAUSED "PAUSED"]
           [Trigger$TriggerState/BLOCKED "BLOCKED"]
           [Trigger$TriggerState/ERROR "ERROR"]]))))

(defn create-trigger-listener
  "Creates an instance of an anonymous TriggerListener to record trigger state metrics to prometheus."
  ^TriggerListener [scheduler]
  (reify TriggerListener
    (getName [_]
      (name trigger-listener-name))

    (triggerFired [_ _ _])

    (vetoJobExecution [_ _ _]
      false) ; Must return boolean

    (triggerMisfired [_ _])

    (triggerComplete [_ _ _ _]
      ;; When a trigger completes, update the gauge for all known triggers and their current states.
      ;; This ensures we capture the state even if it changed outside of a direct completion event.
      (try
        (doseq [[state count] (get-quartz-task-states scheduler)]
          (prometheus/set! :metabase-tasks/quartz-tasks-states
                           {:state state}
                           count))
        (catch Throwable e
          (log/error e "Failed to record Prometheus metrics for Quartz trigger completion"))))))

(defn add-listeners-to-scheduler!
  "Add triggers to the quartz scheduler, must be initialized before adding."
  []
  (task/add-job-listener! (create-job-execution-listener)))
