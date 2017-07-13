(ns metabase.task.sync
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [conversion :as qc]
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [metabase
             [driver :as driver]
             [task :as task]
             [util :as u]]
            [metabase.models.database :refer [Database]]
            [metabase.sfc
             [analyze :as analyze]
             [classify :as classify]
             [fingerprint :as fingerprint]
             [sync :as sync]]
            [toucan.db :as db]))

;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                    TASK DEFINITIONS                                                    |
;;; +------------------------------------------------------------------------------------------------------------------------+

(defn- do-with-job-logging-and-error-handling [job-name {database-name :name, :as database} f]
  (let [driver-name (str (name (driver/database-id->driver (u/get-id database))))]
    (try
      (log/debug (u/format-color 'green "Running scheduled %s for %s database '%s'" job-name driver-name database-name))
      (f)
      (catch Throwable e
        (log/error (format "Error running scheduled %s for %s database '%s'" job-name driver-name database-name)
                   e)))))

(defmacro ^:private with-job-logging-and-error-handling {:style/indent 2} [job-name database & body]
  `(do-with-job-logging-and-error-handling ~job-name ~database (fn [] ~@body)))

(defn- job-context->database [job-context]
  (Database (u/get-id (get (qc/from-job-data job-context) "db-id"))))


(defmacro def-sfc-job [job-name sfc-fn & additional-args]
  `(jobs/defjob ~job-name [job-context#]
     (let [database# (job-context->database job-context#)]
       (with-job-logging-and-error-handling ~(name job-name) database#
         (~sfc-fn database# ~@additional-args)))))


;; (1) Sync: fetches the schema of a database and then saves/updates corresponding Metabase objects.
;; TODO - I think this is supposed to be a not-full sync because `full-sync?` runs the Analyze step, which is a separate job
(def-sfc-job SyncDatabase sync/sync-database! :full-sync false)

;; (2) Analyze: gets stats about tables/fields and stores them as FieldFingerprint/TableFingerprint objects <--+ Due to me (@camsaul) not fully understanding the refactor PR I inherited these both
(def-sfc-job AnalyzeDatabase analyze/analyze-database!)                                                      ; | are considered part of the 'Fingerprint' stage in SFC. That may be subject to change
                                                                                                             ; | in the future (SFFC (Sync-Fingerprint-FieldValues-Classify)?)
;; (3) CacheFieldValues: gets DISTINCT values for fields and records them as FieldValues                    <--+ Or perhaps not since they are fundamentally similar operations and could be combined-ish
(def-sfc-job CacheFieldValuesForDatabase fingerprint/cache-field-values-for-database!)

;; (4) Classify: Looks at the FieldFingerprints and updates special types for fields based on them.
(def-sfc-job ClassifyDatabase classify/classify-database!)


(def ^:private sfc-job-definitions
  [{:action "classify",     :schedule-key :classify_schedule,           :job-type ClassifyDatabase}
   {:action "cache-values", :schedule-key :cache_field_values_schedule, :job-type CacheFieldValuesForDatabase}
   {:action "analyze",      :schedule-key :analyze_schedule,            :job-type AnalyzeDatabase}
   {:action "sync",         :schedule-key :sync_schedule,               :job-type SyncDatabase}])


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                           SCHEDULING/UNSCHEDULING THE TASKS                                            |
;;; +------------------------------------------------------------------------------------------------------------------------+

(def ^:private ^:const classify-databases-job-key     "metabase.task.%s-databases.job-%s")
(def ^:private ^:const classify-databases-trigger-key "metabase.task.%s-databases.trigger-%s")


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

(defonce ^:private classify-databases-job (atom nil))

(defn task-init
  "classify called during startup; start the job for classify databases."
  []
  ;; build one job and one trigger for each database.
  (doseq [database (db/select Database, :is_sample false)]
    (schedule-db-sync-actions! database)))
