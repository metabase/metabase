(ns metabase.sync.task.sync-databases-trigger
  "Quartz trigger lifecycle for the per-Database sync-and-analyze and field-values tasks.

  Separate from [[metabase.sync.task.sync-databases]] so that :model/Database lifecycle hooks can (un)schedule
  triggers: the job bodies over there pull in the sync machinery, which reads the Database model."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.audit-app.core :as audit]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (org.quartz
    CronTrigger
    JobKey
    TriggerKey)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         TASK INFO AND GETTER FUNCTIONS                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def TaskInfo
  "One-off schema for information about the various sync tasks we run for a DB."
  [:map
   [:key                :keyword]
   [:db-schedule-column :keyword]
   [:name               :string]])

(def sync-analyze-task-info
  "Task info for the sync-and-analyze task."
  {:key                :sync-and-analyze
   :db-schedule-column :metadata_sync_schedule
   :name               "Sync and Analyze"})

(assert (mr/validate TaskInfo sync-analyze-task-info))

(def field-values-task-info
  "Task info for the Field values caching task."
  {:key                :update-field-values
   :db-schedule-column :cache_field_values_schedule
   :name               "Scan Field Values"})

(assert (mr/validate TaskInfo field-values-task-info))

(def ^:private all-tasks
  [sync-analyze-task-info field-values-task-info])

;; These getter functions are not strictly necessary but are provided primarily so we can get some extra validation by
;; using them

(mu/defn job-key :- (ms/InstanceOfClass JobKey)
  "Return an appropriate string key for the job described by `task-info` for `database-or-id`."
  ^JobKey [task-info :- TaskInfo]
  (jobs/key (format "metabase.task.%s.job" (name (:key task-info)))))

(mu/defn- trigger-key :- (ms/InstanceOfClass TriggerKey)
  "Return an appropriate string key for the trigger for `task-info` and `database-or-id`."
  ^TriggerKey [database  :- (ms/InstanceOf :model/Database)
               task-info :- TaskInfo]
  (triggers/key (format "metabase.task.%s.trigger.%d" (name (:key task-info)) (u/the-id database))))

(mu/defn- cron-schedule :- [:maybe u.cron/CronScheduleString]
  "Fetch the appropriate cron schedule string for `database` and `task-info`."
  [database  :- (ms/InstanceOf :model/Database)
   task-info :- TaskInfo]
  (get database (:db-schedule-column task-info)))

(mu/defn- trigger-description :- :string
  "Return an appropriate description string for a job/trigger for Database described by `task-info`."
  [database  :- (ms/InstanceOf :model/Database)
   task-info :- TaskInfo]
  (format "%s Database %d" (name (:key task-info)) (u/the-id database)))

(mu/defn job-description :- :string
  "Return an appropriate description string for a job"
  [task-info :- TaskInfo]
  (format "%s for all databases" (name (:key task-info))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            DELETING TASKS FOR A DB                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- delete-trigger!
  "Cancel a single sync trigger for `database-or-id` and `task-info`."
  [database  :- (ms/InstanceOf :model/Database)
   task-info :- TaskInfo]
  (let [trigger-key (trigger-key database task-info)]
    (log/debug (u/format-color 'red
                               (format "Unscheduling task for Database %d: trigger: %s" (u/the-id database) (.getName trigger-key))))
    (task/delete-trigger! trigger-key)))

(mu/defn unschedule-tasks-for-db!
  "Cancel *all* scheduled sync and FieldValues caching tasks for `database-or-id`."
  [database :- (ms/InstanceOf :model/Database)]
  (doseq [task all-tasks]
    (delete-trigger! database task)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         (RE)SCHEDULING TASKS FOR A DB                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- trigger :- [:maybe (ms/InstanceOfClass CronTrigger)]
  "Build a Quartz Trigger for `database` and `task-info` if a schedule exists."
  ^CronTrigger [database  :- (ms/InstanceOf :model/Database)
                task-info :- TaskInfo]
  (when-let [task-schedule (cron-schedule database task-info)]
    (triggers/build
     (triggers/with-description (trigger-description database task-info))
     (triggers/with-identity (trigger-key database task-info))
     (triggers/using-job-data {"db-id" (u/the-id database)})
     (triggers/for-job (job-key task-info))
     (triggers/start-now)
     (triggers/with-schedule
      (cron/schedule
       (cron/cron-schedule task-schedule)
       ;; if we miss a sync for one reason or another (such as system being down) do not try to run the sync again.
       ;; Just wait until the next sync cycle.
       ;;
       ;; See https://www.nurkiewicz.com/2012/04/quartz-scheduler-misfire-instructions.html for more info
       (cron/with-misfire-handling-instruction-do-nothing))))))

(defn- update-db-trigger-if-needed!
  "Replace or remove the existing trigger if the schedule changes, do nothing if schedule is the same."
  [database task-info]
  (let [job                                 (task/job-info (job-key task-info))
        new-trigger                         (trigger database task-info)
        ;; there should be only one schedule per task per DB
        existing-trigger-with-same-schedule (when new-trigger
                                              (let [trigger-key   (.. new-trigger getKey getName)
                                                    task-schedule (cron-schedule database task-info)]
                                                (some #(when (and (= (:key %) trigger-key)
                                                                  (= (:schedule %) task-schedule))
                                                         %)
                                                      (:triggers job))))]
    (cond
      ;; no new schedule
      ;; delete the existing trigger
      (nil? new-trigger)
      (do
        (log/infof "Trigger for \"%s\" of Database %d has been removed. It will no longer run on a schedule."
                   (:name task-info)
                   (u/the-id database))
        (delete-trigger! database task-info))

      ;; need to recreate the new trigger
      (and (some? new-trigger)
           (nil? existing-trigger-with-same-schedule))
      (do
        (if (delete-trigger! database task-info)
          (log/infof "Trigger for \"%s\" of Database %d has been updated. The new schedule is: \"%s\""
                     (:name task-info)
                     (u/the-id database)
                     (cron-schedule database task-info))
          (log/infof "A trigger for \"%s\" of Database %d has been enabled with schedule: \"%s\""
                     (:name task-info)
                     (u/the-id database)
                     (cron-schedule database task-info)))
        (task/add-trigger! new-trigger))

      ;; don't need to do anything as the existing trigger matches the new schedule
      :else
      nil)))

;; called [[from metabase.warehouses.models.database/schedule-tasks!]] from the post-insert and the pre-update
(mu/defn check-and-schedule-tasks-for-db!
  "Schedule a new Quartz job for `database` and `task-info` if it doesn't already exist or is incorrect."
  [database :- (ms/InstanceOf :model/Database)]
  (doseq [task all-tasks]
    (cond
      (:is_stub database)
      (log/info (u/format-color :red "Not scheduling sync task for stub database"))

      (and (= audit/audit-db-id (:id database))
           (= task sync-analyze-task-info))
      (log/info (u/format-color :red "Not scheduling sync task for audit database"))

      :else
      (update-db-trigger-if-needed! database task))))
