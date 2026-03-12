(ns metabase.transforms.schedule
  (:require
   [clojurewerkz.quartzite.conversion :as conversion]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.transforms.jobs :as transforms.jobs]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util TimeZone)
   (org.quartz CronTrigger TriggerKey CronExpression)))

(set! *warn-on-reflection* true)

(defn validate-cron-expression
  "Returns true if valid, false otherwise."
  [expr]
  (try
    ;; throwing is its only mechanism:
    (CronExpression/validateExpression expr)
    true
    (catch Exception _ false)))

(defn- job-key [job-id] (jobs/key (str "metabase.task.transforms.schedule." job-id)))

(defn- timezone
  []
  (or (driver/report-timezone)
      (qp.timezone/system-timezone-id)
      "UTC"))

(defn- trigger-key ^TriggerKey [job-id]
  (triggers/key (str "metabase.task.transforms.trigger." job-id)))

(defn- build-trigger
  ^CronTrigger [job-id schedule]
  (triggers/build
   (triggers/with-description (str "Transform Job Schedule " job-id))
   (triggers/with-identity (trigger-key job-id))
   (triggers/for-job (job-key job-id))
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

(defn- create-trigger!
  "Creates the trigger for a transform job."
  [job-id schedule]
  (when schedule
    (log/info "Creating trigger for transform job" job-id "with schedule" schedule)
    (task/add-trigger! (build-trigger job-id schedule))))

(defn existing-trigger
  "Return the existing trigger for `job-id-or-trigger`, or nil, if the trigger doesn't exist."
  [job-id-or-trigger]
  (first (task/existing-triggers (job-key job-id-or-trigger)
                                 (trigger-key job-id-or-trigger))))

(defn- delete-trigger!
  "Delete the trigger for a transform job."
  ([job-id-or-trigger]
   (if (number? job-id-or-trigger)
     (if-let [trigger (existing-trigger job-id-or-trigger)]
       (delete-trigger! trigger)
       (log/info "No trigger for this transform job exists"))
     (do
       (log/info "Deleting trigger for transform job with schedule" (:schedule job-id-or-trigger))
       (task/delete-trigger! (-> job-id-or-trigger :key triggers/key))))))

(task/defjob ^{:doc "Run transforms."
               org.quartz.DisallowConcurrentExecution true}
  RunTransforms
  [context]
  (let [job-id (-> (conversion/from-job-data context)
                   (get "job-id"))]
    (log/info "Executing scheduled run of transform job" job-id)
    (task-history/with-task-history {:task "run-transforms"
                                     :task_details {:job-id job-id
                                                    :run-method :cron}}
      (transforms.jobs/run-job! job-id {:run-method :cron}))))

(defn initialize-job!
  "Initialize a schedule for a transform job."
  [{job-id :id :keys [schedule]}]
  (log/info "Initializing schedule for transform job" job-id)
  (let [job (jobs/build
             (jobs/with-identity (job-key job-id))
             (jobs/with-description (str "Run Transform job " job-id))
             (jobs/using-job-data {"job-id" job-id})
             (jobs/of-type RunTransforms)
             (jobs/store-durably))
        trigger (build-trigger job-id schedule)]
    (task/schedule-task! job trigger)))

(defn update-job!
  "Update the trigger for a transform job."
  [job-id schedule]
  (log/info "Updating schedule for transform job" job-id "to" schedule)
  (let [existing-trigger (first (task/existing-triggers (job-key job-id) (trigger-key job-id)))]
    (if (not= schedule (:schedule existing-trigger))
      (do
        (when existing-trigger
          (delete-trigger! existing-trigger))
        (when schedule
          (create-trigger! job-id schedule)))
      (log/info "No changes to the trigger for transform job" job-id))))

(defn delete-job!
  "Delete a job."
  [job-id]
  (log/info "Deleting schedule for transform job" job-id)
  (task/delete-task! (job-key job-id) (trigger-key job-id)))

(defmethod task/init! ::RunTransform [_]
  (log/info "Initializing transform job execution jobs")
  (->> (t2/select :model/TransformJob)
       (run! initialize-job!)))
