(ns metabase.task.sync-databases
  (:require [clojure.tools.logging :as log]
            (clojurewerkz.quartzite [jobs :as jobs]
                                    [triggers :as triggers])
            [clojurewerkz.quartzite.schedule.cron :as cron]
            (metabase [config :as config]
                      [db :as db]
                      [driver :as driver]
                      [task :as task])
            [metabase.models.database :refer [Database]]))

(def ^:private ^:const sync-databases-job-key     "metabase.task.sync-databases.job")
(def ^:private ^:const sync-databases-trigger-key "metabase.task.sync-databases.trigger")

(defonce ^:private sync-databases-job (atom nil))
(defonce ^:private sync-databases-trigger (atom nil))

;; simple job which looks up all databases and runs a sync on them
(jobs/defjob SyncDatabases
  [ctx]
  (dorun
    (for [database (db/sel :many Database :is_sample false)] ; skip Sample Dataset DB
      (try
        ;; NOTE: this happens synchronously for now to avoid excessive load if there are lots of databases
        (driver/sync-database! database)
        (catch Throwable e
          (log/error "Error syncing database: " (:id database) e))))))

(defn task-init
  "Automatically called during startup; start the job for syncing databases."
  []
  ;; build our job
  (reset! sync-databases-job (jobs/build
                               (jobs/of-type SyncDatabases)
                               (jobs/with-identity (jobs/key sync-databases-job-key))))
  ;; build our trigger
  (reset! sync-databases-trigger (triggers/build
                                   (triggers/with-identity (triggers/key sync-databases-trigger-key))
                                   (triggers/start-now)
                                   (triggers/with-schedule
                                     ;; run at midnight daily
                                     (cron/schedule (cron/cron-schedule "0 0 0 * * ? *")))))
  ;; submit ourselves to the scheduler
  (task/schedule-task! @sync-databases-job @sync-databases-trigger))
