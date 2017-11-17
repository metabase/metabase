(ns metabase.task.sync-databases
  "Scheduled tasks for syncing metadata/analyzing and caching FieldValues for connected Databases."
  (:require [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [conversion :as qc]
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [metabase
             [task :as task]
             [util :as u]]
            [metabase.models.database :refer [Database]]
            [metabase.sync
             [analyze :as analyze]
             [field-values :as field-values]
             [sync-metadata :as sync-metadata]]
            [metabase.util.cron :as cron-util]
            [schema.core :as s]
            [toucan.db :as db])
  (:import metabase.models.database.DatabaseInstance
           [org.quartz CronTrigger JobDetail JobKey TriggerKey]))

;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                       JOB LOGIC                                                        |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate job-context->database :- DatabaseInstance
  "Get the Database referred to in JOB-CONTEXT. Guaranteed to return a valid Database."
  [job-context]
  (Database (u/get-id (get (qc/from-job-data job-context) "db-id"))))


(jobs/defjob SyncAndAnalyzeDatabase [job-context]
  (let [database (job-context->database job-context)]
    (sync-metadata/sync-db-metadata! database)
    ;; only run analysis if this is a "full sync" database
    (when (:is_full_sync database)
      (analyze/analyze-db! database))))


(jobs/defjob UpdateFieldValues [job-context]
  (let [database (job-context->database job-context)]
    (when (:is_full_sync database)
      (field-values/update-field-values! (job-context->database job-context)))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                             TASK INFO AND GETTER FUNCTIONS                                             |
;;; +------------------------------------------------------------------------------------------------------------------------+

(def ^:private TaskInfo
  "One-off schema for information about the various sync tasks we run for a DB."
  {:key                s/Keyword
   :db-schedule-column s/Keyword
   :job-class          Class})


(def ^:private task-infos
  "Maps containing info about the different independent sync tasks we schedule for each DB."
  [{:key                :sync-and-analyze
    :db-schedule-column :metadata_sync_schedule
    :job-class          SyncAndAnalyzeDatabase}
   {:key                :update-field-values
    :db-schedule-column :cache_field_values_schedule
    :job-class          UpdateFieldValues}])


;; These getter functions are not strictly neccesary but are provided primarily so we can get some extra validation by using them

(s/defn ^:private ^:always-validate job-key :- JobKey
  "Return an appropriate string key for the job described by TASK-INFO for DATABASE-OR-ID."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (jobs/key (format "metabase.task.%s.job.%d" (name (:key task-info)) (u/get-id database))))

(s/defn ^:private ^:always-validate trigger-key :- TriggerKey
  "Return an appropriate string key for the trigger for TASK-INFO and DATABASE-OR-ID."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (triggers/key (format "metabase.task.%s.trigger.%d" (name (:key task-info)) (u/get-id database))))

(s/defn ^:private ^:always-validate cron-schedule :- cron-util/CronScheduleString
  "Fetch the appropriate cron schedule string for DATABASE and TASK-INFO."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (get database (:db-schedule-column task-info)))

(s/defn ^:private ^:always-validate job-class :- Class
  "Get the Job class for TASK-INFO."
  [task-info :- TaskInfo]
  (:job-class task-info))

(s/defn ^:private ^:always-validate description :- s/Str
  "Return an appropriate description string for a job/trigger for Database described by TASK-INFO."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (format "%s Database %d" (name (:key task-info)) (u/get-id database)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                DELETING TASKS FOR A DB                                                 |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate delete-task!
  "Cancel a single sync job for DATABASE-OR-ID and TASK-INFO."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (let [job-key     (job-key database task-info)
        trigger-key (trigger-key database task-info)]
    (log/debug (u/format-color 'red "Unscheduling task for Database %d: job: %s; trigger: %s" (u/get-id database) (.getName job-key) (.getName trigger-key)))
    (task/delete-task! job-key trigger-key)))

(s/defn ^:always-validate unschedule-tasks-for-db!
  "Cancel *all* scheduled sync and FieldValues caching tassks for DATABASE-OR-ID."
  [database :- DatabaseInstance]
  (doseq [task-info task-infos]
    (delete-task! database task-info)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                             (RE)SCHEDULING TASKS FOR A DB                                              |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate job :- JobDetail
  "Build a Quartz Job for DATABASE and TASK-INFO."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (jobs/build
   (jobs/with-description (description database task-info))
   (jobs/of-type (job-class task-info))
   (jobs/using-job-data {"db-id" (u/get-id database)})
   (jobs/with-identity (job-key database task-info))))

(s/defn ^:private ^:always-validate trigger :- CronTrigger
  "Build a Quartz Trigger for DATABASE and TASK-INFO."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (triggers/build
   (triggers/with-description (description database task-info))
   (triggers/with-identity (trigger-key database task-info))
   (triggers/start-now)
   (triggers/with-schedule
     (cron/schedule
      (cron/cron-schedule (cron-schedule database task-info))
      ;; drop tasks if they start to back up
      (cron/with-misfire-handling-instruction-do-nothing)))))


(s/defn ^:private ^:always-validate schedule-task-for-db!
  "Schedule a new Quartz job for DATABASE and TASK-INFO."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (let [job     (job database task-info)
        trigger (trigger database task-info)]
    (log/debug (u/format-color 'green "Scheduling task for Database %d: job: %s; trigger: %s" (u/get-id database) (.getName (.getKey job)) (.getName (.getKey trigger))))
    (task/schedule-task! job trigger)))


(s/defn ^:always-validate schedule-tasks-for-db!
  "Schedule all the different sync jobs we have for DATABASE.
   Unschedules any existing jobs."
  [database :- DatabaseInstance]
  ;; unschedule any tasks that might already be scheduled
  (unschedule-tasks-for-db! database)
  ;; now (re)schedule all the tasks
  (doseq [task-info task-infos]
    (schedule-task-for-db! database task-info)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                  TASK INITIALIZATION                                                   |
;;; +------------------------------------------------------------------------------------------------------------------------+

(defn task-init
  "Automatically called during startup; start the jobs for syncing/analyzing and updating FieldValues for all
   Databases."
  []
  (doseq [database (db/select Database)]
    (schedule-tasks-for-db! database)))
