(ns metabase-enterprise.transforms.schedule
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.driver :as driver]
   [metabase.events.core :as events]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.util TimeZone)
   (org.quartz CronTrigger TriggerKey)))

(set! *warn-on-reflection* true)

(def ^:private global-job-key (jobs/key "metabase.task.transforms.schedule.global"))

(defn- timezone
  []
  (or (driver/report-timezone)
      (qp.timezone/system-timezone-id)
      "UTC"))

(def ^:private ^TriggerKey global-trigger-key
  (triggers/key "metabase.task.transforms.trigger.global"))

(defn- build-global-trigger
  ^CronTrigger [schedule]
  (triggers/build
   (triggers/with-description "Transform Global Schedule")
   (triggers/with-identity global-trigger-key)
   (triggers/for-job global-job-key)
   (triggers/start-now)
   (triggers/with-schedule
    (cron/schedule
     (cron/cron-schedule schedule)
     (cron/in-time-zone (TimeZone/getTimeZone ^String (timezone)))
     ;; We want to fire the trigger once even if the previous triggers missed
     ;; (potentially several times)
     (cron/with-misfire-handling-instruction-fire-and-proceed)))
   ;; higher than sync
   (triggers/with-priority 6)))

(defn- create-global-trigger!
  "Creates the global trigger for a transform."
  [schedule]
  (when schedule
    (log/info "Creating global trigger for transforms with schedule" schedule)
    (task/add-trigger! (build-global-trigger schedule))))

(defn- delete-global-trigger!
  "Delete the global trigger for a transform."
  ([]
   (if-let [trigger (first (task/existing-triggers global-job-key global-trigger-key))]
     (delete-global-trigger! trigger)
     (log/info "No global trigger for transforms exists")))
  ([trigger]
   (log/info "Deleting global trigger for transforms with schedule" (:schedule trigger))
   (task/delete-trigger! (-> trigger :key triggers/key))))

(defn- update-global-trigger!
  "Update the global trigger."
  [schedule]
  (let [existing-trigger (first (task/existing-triggers global-job-key global-trigger-key))]
    (if (not= schedule (:schedule existing-trigger))
      (do
        (when existing-trigger
          (delete-global-trigger! existing-trigger))
        (when schedule
          (create-global-trigger! schedule)))
      (log/info "No changes to the global trigger for transforms with schedule" schedule))))

(task/defjob ^{:doc "Execute transforms."
               org.quartz.DisallowConcurrentExecution true}
  ExecuteTransforms
  [_context]
  (when-let [transforms (t2/select :model/Transform :execution_trigger :global-schedule)]
    (task-history/with-task-history {:task "execute-transforms"}
      (transforms.execute/execute-transforms! transforms {:run-method :cron}))))

(defmethod task/init! ::ExecuteTransform [_]
  (log/info "Initializing global transform execution job")
  (let [job (jobs/build
             (jobs/with-identity global-job-key)
             (jobs/with-description "Execute Transforms")
             (jobs/of-type ExecuteTransforms)
             (jobs/store-durably))
        trigger (build-global-trigger (transforms.settings/transform-schedule))]
    (task/schedule-task! job trigger)))

(derive ::gloabal-transform-schedule-update :metabase/event)
(derive :event/gloabal-transform-schedule-update ::gloabal-transform-schedule-update)

(methodical/defmethod events/publish-event! ::gloabal-transform-schedule-update
  [_topic {:keys [new-schedule]}]
  (update-global-trigger! new-schedule))
