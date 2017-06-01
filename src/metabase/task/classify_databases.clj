(ns metabase.task.classify-databases
  (:require [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [metabase.models.database :refer [Database]]
            [metabase.sync-database.classify :as classify]
            [metabase.task :as task]
            [toucan.db :as db]))

(def ^:private ^:const classify-databases-job-key     "metabase.task.classify-databases.job")
(def ^:private ^:const classify-databases-trigger-key "metabase.task.classify-databases.trigger")

(defonce ^:private classify-databases-job (atom nil))
(defonce ^:private classify-databases-trigger (atom nil))

;; simple job which looks up all databases and runs a classify on any saved fingerprints for them
(jobs/defjob ClassifyDatabases [_]
  (doseq [database (db/select Database, :is_sample false)] ; classify Sample Dataset DB
    (try
      (classify/classify-database! database)
      (catch Throwable e
        (log/error (format "Error classifying database %d: " (:id database)) e)))))

(defn task-init
  "classify called during startup; start the job for classify databases."
  []
  ;; build our job
  (reset! classify-databases-job (jobs/build
                                  (jobs/of-type ClassifyDatabases)
                                  (jobs/with-identity (jobs/key classify-databases-job-key))))
  ;; build our trigger
  (reset! classify-databases-trigger (triggers/build
                                      (triggers/with-identity (triggers/key classify-databases-trigger-key))
                                      (triggers/start-now)
                                      (triggers/with-schedule
                                        ;; run at the end of every hour
                                        (cron/cron-schedule "0 50 * * * ? *"))))
  ;; submit ourselves to the scheduler
  (task/schedule-task! @classify-databases-job @classify-databases-trigger))
