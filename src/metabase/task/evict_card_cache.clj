(ns metabase.task.evict-card-cache
  (:require [clj-time.core :as t]
            [clojure.tools.logging :as log]
            (clojurewerkz.quartzite [jobs :as jobs]
                                    [triggers :as triggers])
            [clojurewerkz.quartzite.schedule.cron :as cron]
            (metabase [task :as task])
            [metabase.models.card-cache :as card-cache]))

(def ^:private ^:const evict-card-cache-job-key     "metabase.task.evict-card-cache.job")
(def ^:private ^:const evict-card-cache-trigger-key "metabase.task.evict-card-cache.trigger")

(defonce ^:private evict-card-cache-job (atom nil))
(defonce ^:private evict-card-cache-trigger (atom nil))

;; simple job which looks up all databases and runs a sync on them
(jobs/defjob EvictCardCache [_]
  (try
   (card-cache/evict!)
   (catch Throwable e
     (log/error "Error evicting card cache " e))))

(defn task-init
  "Automatically called during startup; start the job for syncing databases."
  []
  ;; build our job
  (reset! evict-card-cache-job (jobs/build
                               (jobs/of-type EvictCardCache)
                               (jobs/with-identity (jobs/key evict-card-cache-job-key))))
  ;; build our trigger
  (reset! evict-card-cache-trigger (triggers/build
                                   (triggers/with-identity (triggers/key evict-card-cache-trigger-key))
                                   (triggers/start-now)
                                   (triggers/with-schedule
                                     ;; run every 15 minutes
                                     (cron/cron-schedule "0 * * * * ? *"))))
  ;; submit ourselves to the scheduler
  (task/schedule-task! @evict-card-cache-job @evict-card-cache-trigger))
