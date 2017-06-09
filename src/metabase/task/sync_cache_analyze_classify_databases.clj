(ns metabase.task.sync-cache-analyze-classify-databases
  (:require [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clojurewerkz.quartzite.conversion :as qc]
            [clojurewerkz.quartzite.jobs :as jobs]
            [metabase.models.database :refer [Database]]
            [metabase.sync-database.classify :as classify]
            [metabase.task :as task]
            [toucan.db :as db]
            [metabase.util :as u]
            [metabase.sync-database.analyze :as analyze]
            [metabase.sync-database.cached-values :as cached-values]
            [metabase.cache-database :as cache-database]))

(def ^:private ^:const classify-databases-job-key     "metabase.task.%s-databases.job-%s")
(def ^:private ^:const classify-databases-trigger-key "metabase.task.%s-databases.trigger-%s")

(defonce ^:private classify-databases-job (atom nil))
(defonce ^:private classify-databases-trigger (atom nil))

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
      (analyze/analyze-database database)
      (catch Throwable e
        (log/error (format "Error analyzing database %d: (%s)" db-id (:name database)) e)))))

(jobs/defjob CacheFieldValuesForDatabase [job-context]
  (let [db-id    (get (qc/from-job-data job-context) "db-id")
        database (Database db-id)]
    (try
      (log/debug (u/format-color 'green "running scheduled caching of field values for database-id: %s: %s" db-id database))
      (cached-values/cache-field-values-for-database! database)
      (catch Throwable e
        (log/error (format "Error fetching field values for database %d: (%s)" db-id (:name database)) e)))))

(jobs/defjob SyncDatabase [job-context]
  (let [db-id    (get (qc/from-job-data job-context) "db-id")
        database (Database db-id)]
    (try
      (log/debug (u/format-color 'green "running scheduled caching of field values for database-id: %s: %s" db-id database))
      (cache-database/cache-database-field-values! database :full-sync? true)
      (catch Throwable e
        (log/error (format "Error fetching field values for database %d: (%s)" db-id (:name database)) e)))))


(defn- schedule-db-sync-actions
  "Schedule the Sync, Analyze, Cache-field-values, and classify jobs for a database"
  [database]
  (doseq [[action db-keyword job-type] [["classify"     :classify_schedule           ClassifyDatabase]
                                        ["cache-values" :cache_field_values_schedule CacheFieldValuesForDatabase]
                                        ["analyze"      :analyze_schedule            AnalyzeDatabase]
                                        ["sync"         :sync_schedule SyncDatabase]]]
    (let [db-id (:id database)
          trigger-name (format classify-databases-trigger-key action db-id)
          job-name     (format classify-databases-job-key action db-id)
          schedule (or (db-keyword database) "0 50 * * * ? *")
          job     (jobs/build
                   (jobs/of-type job-type)
                   (jobs/using-job-data {"db-id" db-id})
                   (jobs/with-identity (jobs/key job-name)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key trigger-name))
                   (triggers/start-now)
                   (triggers/with-schedule
                     (cron/schedule
                      (cron/cron-schedule schedule)
                      (cron/with-misfire-handling-instruction-do-nothing))))] ;; drop tasks if they start to back up
      (log/error (u/format-color 'green "scheduling %s for database-id: %d (%s) at %s named %s" action db-id (:name database) schedule job-name))
      ;; submit ourselves to the scheduler
      (task/schedule-task! job trigger)
      job-name)))

(defn task-init
  "classify called during startup; start the job for classify databases."
  []
  ;; build one job and one trigger for each database.
  (let [triggers (doseq [database (db/select Database, #_:is_sample #_false)] ;; TODO: UN-COMMENT THESE
                   (schedule-db-sync-actions database))] ;; we're building a sequence of these jobs so they can be stopped later
    (reset! classify-databases-job triggers)))
