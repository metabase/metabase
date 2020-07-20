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
            [metabase.util
             [cron :as cron-util]
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import metabase.models.database.DatabaseInstance
           [org.quartz CronTrigger JobDetail JobKey TriggerKey]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   JOB LOGIC                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private job-context->database-id :- (s/maybe su/IntGreaterThanZero)
  "Get the Database ID referred to in `job-context`."
  [job-context]
  (u/get-id (get (qc/from-job-data job-context) "db-id")))

;; The DisallowConcurrentExecution on the two defrecords below attaches an annotation to the generated class that will
;; constrain the job execution to only be one at a time. Other triggers wanting the job to run will misfire.
(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true} SyncAndAnalyzeDatabase [job-context]
  (when-let [database-id (job-context->database-id job-context)]
    (log/info (trs "Starting sync task for Database {0}." database-id))
    (when-let [database (or (Database database-id)
                            (log/warn (trs "Cannot sync Database {0}: Database does not exist." database-id)))]
      (sync-metadata/sync-db-metadata! database)
      ;; only run analysis if this is a "full sync" database
      (when (:is_full_sync database)
        (analyze/analyze-db! database)))))

(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true} UpdateFieldValues [job-context]
  (when-let [database-id (job-context->database-id job-context)]
    (log/info (trs "Update Field values task triggered for Database {0}." database-id))
    (when-let [database (or (Database database-id)
                            (log/warn "Cannot update Field values for Database {0}: Database does not exist." database-id))]
      (if (:is_full_sync database)
        (field-values/update-field-values! database)
        (log/info (trs "Skipping update, automatic Field value updates are disabled for Database {0}." database-id))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         TASK INFO AND GETTER FUNCTIONS                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private TaskInfo
  "One-off schema for information about the various sync tasks we run for a DB."
  {:key                s/Keyword
   :db-schedule-column s/Keyword
   :job-class          Class})

(s/def ^:private sync-analyze-task-info :- TaskInfo
  {:key                :sync-and-analyze
   :db-schedule-column :metadata_sync_schedule
   :job-class          SyncAndAnalyzeDatabase})

(s/def ^:private field-values-task-info :- TaskInfo
  {:key                :update-field-values
   :db-schedule-column :cache_field_values_schedule
   :job-class          UpdateFieldValues})


;; These getter functions are not strictly necessary but are provided primarily so we can get some extra validation by
;; using them

(s/defn ^:private job-key :- JobKey
  "Return an appropriate string key for the job described by `task-info` for `database-or-id`."
  [task-info :- TaskInfo]
  (jobs/key (format "metabase.task.%s.job" (name (:key task-info)))))

(s/defn ^:private trigger-key :- TriggerKey
  "Return an appropriate string key for the trigger for `task-info` and `database-or-id`."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (triggers/key (format "metabase.task.%s.trigger.%d" (name (:key task-info)) (u/get-id database))))

(s/defn ^:private cron-schedule :- cron-util/CronScheduleString
  "Fetch the appropriate cron schedule string for `database` and `task-info`."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (get database (:db-schedule-column task-info)))

(s/defn ^:private job-class :- Class
  "Get the Job class for `task-info`."
  [task-info :- TaskInfo]
  (:job-class task-info))

(s/defn ^:private trigger-description :- s/Str
  "Return an appropriate description string for a job/trigger for Database described by `task-info`."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (format "%s Database %d" (name (:key task-info)) (u/get-id database)))

(s/defn ^:private job-description :- s/Str
  "Return an appropriate description string for a job"
  [task-info :- TaskInfo]
  (format "%s for all databases" (name (:key task-info))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            DELETING TASKS FOR A DB                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private delete-task!
  "Cancel a single sync task for `database-or-id` and `task-info`."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (let [trigger-key (trigger-key database task-info)]
    (log/debug (u/format-color 'red
                   (trs "Unscheduling task for Database {0}: trigger: {1}" (u/get-id database) (.getName trigger-key))))
    (task/delete-trigger! trigger-key)))

(s/defn unschedule-tasks-for-db!
  "Cancel *all* scheduled sync and FieldValues caching tasks for `database-or-id`."
  [database :- DatabaseInstance]
  (doseq [task [sync-analyze-task-info field-values-task-info]]
    (delete-task! database task)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         (RE)SCHEDULING TASKS FOR A DB                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private job :- JobDetail
  "Build a durable Quartz Job for `task-info`. Durable in Quartz allows the job to exist even if there are no triggers
  for it."
  [task-info :- TaskInfo]
  (jobs/build
   (jobs/with-description (job-description task-info))
   (jobs/of-type (job-class task-info))
   (jobs/with-identity (job-key task-info))
   (jobs/store-durably)))

(s/def ^:private sync-analyze-job (job sync-analyze-task-info))
(s/def ^:private field-values-job (job field-values-task-info))

(s/defn ^:private trigger :- CronTrigger
  "Build a Quartz Trigger for `database` and `task-info`."
  [database :- DatabaseInstance, task-info :- TaskInfo]
  (triggers/build
   (triggers/with-description (trigger-description database task-info))
   (triggers/with-identity (trigger-key database task-info))
   (triggers/using-job-data {"db-id" (u/get-id database)})
   (triggers/for-job (job-key task-info))
   (triggers/start-now)
   (triggers/with-schedule
     (cron/schedule
      (cron/cron-schedule (cron-schedule database task-info))
      ;; if we miss a sync for one reason or another (such as system being down) do not try to run the sync again.
      ;; Just wait until the next sync cycle.
      ;;
      ;; See https://www.nurkiewicz.com/2012/04/quartz-scheduler-misfire-instructions.html for more info
      (cron/with-misfire-handling-instruction-do-nothing)))))

(s/defn ^:private schedule-tasks-for-db!
  "Schedule a new Quartz job for `database` and `task-info`."
  [database :- DatabaseInstance]
  (let [sync-trigger (trigger database sync-analyze-task-info)
        fv-trigger   (trigger database field-values-task-info)]
    ;; unschedule any tasks that might already be scheduled
    (unschedule-tasks-for-db! database)
    (log/debug
     (u/format-color 'green "Scheduling sync/analyze and field-values task for database %d: trigger: %s and trigger: %s"
                     (u/get-id database) (.getName (.getKey sync-trigger))
                     (u/get-id database) (.getName (.getKey fv-trigger))))
    ;; now (re)schedule all the tasks
    (task/add-trigger! sync-trigger)
    (task/add-trigger! fv-trigger)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              TASK INITIALIZATION                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- job-init
  "Separated from `task-init` primarily as it's useful in testing. Adds the sync and field-values job that all of the
  triggers will use"
  []
  (task/add-job! sync-analyze-job)
  (task/add-job! field-values-job))

(defmethod task/init! ::SyncDatabases
  [_]
  (job-init)
  (doseq [database (db/select Database)]
    (try
      ;; TODO -- shouldn't all the triggers be scheduled already?
      (schedule-tasks-for-db! database)
      (catch Throwable e
        (log/error e (trs "Failed to schedule tasks for Database {0}" (:id database)))))))
