(ns metabase.task.sync
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
            [metabase.sfc
             [analyze :as analyze]
             [classify :as classify]
             [fingerprint :as fingerprint]]
            [toucan.db :as db]))

(def ^:private ^:const classify-databases-job-key     "metabase.task.%s-databases.job-%s")
(def ^:private ^:const classify-databases-trigger-key "metabase.task.%s-databases.trigger-%s")

(defonce ^:private classify-databases-job (atom nil))

;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                    TASK DEFINITIONS                                                    |
;;; +------------------------------------------------------------------------------------------------------------------------+

;; simple job which looks up all databases and runs a classify on any saved fingerprints for them
(jobs/defjob ClassifyDatabase [job-context]
  (let [db-id    (get (qc/from-job-data job-context) "db-id")
        database (Database db-id)]
    (try
      (log/debug (u/format-color 'green "running scheduled classification for database-id: %s: %s" db-id database))
      (classify/classify-database! database)
      (catch Throwable e
        (log/error (format "Error classifying database %d: (%s)" db-id (:name database)) e)))))

(jobs/defjob AnalyzeDatabase [job-context]
  (let [db-id    (get (qc/from-job-data job-context) "db-id")
        database (Database db-id)]
    (try
      (log/debug (u/format-color 'green "running scheduled analysis for database-id: %s: %s" db-id database))
      (analyze/analyze-database! database)
      (catch Throwable e
        (log/error (format "Error analyzing database %d: (%s)" db-id (:name database)) e)))))

(jobs/defjob CacheFieldValuesForDatabase [job-context]
  (let [db-id    (get (qc/from-job-data job-context) "db-id")
        database (Database db-id)]
    (try
      (log/debug (u/format-color 'green "running scheduled caching of field values for database-id: %s: %s" db-id database))
      (fingerprint/cache-field-values-for-database! database)
      (catch Throwable e
        (log/error (format "Error fetching field values for database %d: (%s)" db-id (:name database)) e)))))

(jobs/defjob SyncDatabase [job-context]
  (let [db-id    (get (qc/from-job-data job-context) "db-id")
        database (Database db-id)]
    (try
      (log/debug (u/format-color 'green "running scheduled caching of field values for database-id: %s: %s" db-id database))
      (fingerprint/cache-database-field-values! database :full-sync? true)
      (catch Throwable e
        (log/error (format "Error fetching field values for database %d: (%s)" db-id (:name database)) e)))))


(def ^:private sfc-job-definitions
  [{:action "classify",     :schedule-key :classify_schedule,           :job-type ClassifyDatabase}
   {:action "cache-values", :schedule-key :cache_field_values_schedule, :job-type CacheFieldValuesForDatabase}
   {:action "analyze",      :schedule-key :analyze_schedule,            :job-type AnalyzeDatabase}
   {:action "sync",         :schedule-key :sync_schedule,               :job-type SyncDatabase}])


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                           SCHEDULING/UNSCHEDULING THE TASKS                                            |
;;; +------------------------------------------------------------------------------------------------------------------------+

(defn- db-task-names
  "makes DB task and trigger names based on DB id."
  [database-or-id action]
  [(format classify-databases-trigger-key action (u/get-id database-or-id))
   (format classify-databases-job-key action (u/get-id database-or-id))])

(defn- db-task-keys
  "make tack and trigger keys from job and trigger names"
  [job-name trigger-name]
  [(jobs/key job-name) (triggers/key trigger-name)])


(defn unschedule-all-tasks-for-db!
  "Stop all scheduled sync tasks for this database. Called when a DB is deleted."
  [database]
  (doseq [{:keys [action]} sfc-job-definitions]
    (let [[trigger-name job-name] (db-task-names database action)
          [job-key trigger-key] (db-task-keys trigger-name job-name)]
      (log/info (u/format-color 'cyan "unscheduling %s for database-id: '%s' named %s"
                  action
                  (:name database)
                  job-name))
      (task/delete-task! job-key trigger-key))))


(defn- sfc-job [db-id job-type job-key]
  (jobs/build
   (jobs/of-type job-type)
   (jobs/using-job-data {"db-id" db-id})
   (jobs/with-identity job-key)))

(defn- trigger-with-cron-schedule [trigger-key cron-schedule]
  (triggers/build
   (triggers/with-identity trigger-key)
   (triggers/start-now)
   (triggers/with-schedule
     (cron/schedule
      (cron/cron-schedule cron-schedule)
      ;; drop tasks if they start to back up
      (cron/with-misfire-handling-instruction-do-nothing)))))

(defn- sfc-job-and-trigger [database {:keys [action schedule-key job-type]}]
  (let [cron-schedule           (get database schedule-key)
        [trigger-name job-name] (db-task-names (u/get-id database) action)
        [job-key trigger-key]   (db-task-keys trigger-name job-name)]
    {:job      (sfc-job (u/get-id database) job-type job-key)
     :job-name job-name
     :trigger  (trigger-with-cron-schedule trigger-key cron-schedule)
     :schedule cron-schedule}))

(defn schedule-db-sync-actions!
  "Schedule the Sync, Analyze, Cache-field-values, and classify jobs for a database
   Deletes and replaces any existing schedules"
  [database]
  (unschedule-all-tasks-for-db! database)
  (doseq [job-def sfc-job-definitions]
    (let [{:keys [job job-name trigger schedule]} (sfc-job-and-trigger database job-def)]
      (log/info (u/format-color 'green "scheduling %s for database: '%s' at %s named %s" (:action job-def) (:name database) schedule job-name))
      ;; submit a new job to the scheduler, but only if it still exists. this function is called when a DB is deleted. (TODO - huh?)
      (task/schedule-task! job trigger)
      job-name)))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                       TASK INIT                                                        |
;;; +------------------------------------------------------------------------------------------------------------------------+

(defn task-init
  "classify called during startup; start the job for classify databases."
  []
  ;; build one job and one trigger for each database.
  (let [triggers (doseq [database (db/select Database, :is_sample false)]
                   (schedule-db-sync-actions! database))] ;; we're building a sequence of these jobs so they can be stopped later
    (reset! classify-databases-job triggers)))
