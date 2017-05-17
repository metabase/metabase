(ns metabase.task.cache-databases
  (:require [clj-time.core :as t]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [metabase
             [cache-database :as cache-database]
             [driver :as driver]
             [task :as task]]
            [metabase.models.database :refer [Database]]
            [toucan.db :as db]))

(def ^:private ^:const sync-databases-job-key     "metabase.task.cache-databases.job")
(def ^:private ^:const sync-databases-trigger-key "metabase.task.cache-databases.trigger")

(defonce ^:private sync-databases-job (atom nil))
(defonce ^:private sync-databases-trigger (atom nil))

;; simple job which looks up all databases and caches field_values from them
(jobs/defjob CacheFieldValues [_]
  (doseq [database (db/select Database, :is_sample false)] ; skip Sample Dataset DB
    (try
      ;; NOTE: this happens synchronously for now to avoid excessive load if there are lots of databases
      #_(if-not (and (zero? (t/hour (t/now))) ;; re used to not analyze dynamic schema DBs in these cases, why?
                   (driver/driver-supports? (driver/engine->driver (:engine database)) :dynamic-schema)))
      (cache-database/cache-database-field-values! database :full-sync? true)
      (catch Throwable e
        (log/error (format "Error caching FieldValues for database %d: " (:id database)) e)))))

(defn task-init
  "Automatically called during startup; start the job for syncing databases."
  []
  ;; build our job
  (reset! sync-databases-job (jobs/build
                               (jobs/of-type CacheFieldValues)
                               (jobs/with-identity (jobs/key sync-databases-job-key))))
  ;; build our trigger
  (reset! sync-databases-trigger (triggers/build
                                   (triggers/with-identity (triggers/key sync-databases-trigger-key))
                                   (triggers/start-now)
                                   (triggers/with-schedule
                                     ;; run at the end of every hour
                                     (cron/cron-schedule "0 50 * * * ? *"))))
  ;; submit ourselves to the scheduler
  (task/schedule-task! @sync-databases-job @sync-databases-trigger))
