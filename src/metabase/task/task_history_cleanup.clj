(ns metabase.task.task-history-cleanup
  (:require [clj-time.core :as time]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [metabase.models.task-history :as thist :refer [TaskHistory]]
            [metabase.task :as task]
            [metabase.util.date :as du]
            [puppetlabs.i18n.core :refer [trs]]
            [toucan.db :as db]))

(def ^:private job-name    "task-history-cleanup")
(def ^:private job-key     (format "metabase.task.%s.job" job-name))
(def ^:private trigger-key (format "metabase.task.%s.trigger" job-name))

(defonce ^:private job     (atom nil))
(defonce ^:private trigger (atom nil))

(def ^:private history-rows-to-keep
  "Maximum number of TaskHistory rows. This is not a `const` so that we can redef it in tests"
  100000)

(defn- task-history-cleanup!
  []
  (log/debug "Cleaning up task history")
  (let [before-cleanup (time/now)
        result         (thist/cleanup-task-history! history-rows-to-keep)
        after-cleanup  (time/now)]
    (db/insert! TaskHistory {:task       job-name
                             :started_at (du/->Timestamp before-cleanup)
                             :ended_at   (du/->Timestamp after-cleanup)
                             :duration   (du/calculate-duration before-cleanup after-cleanup)})
    (log/debug (trs "Task history cleanup successful, rows were {0}deleted"
                    (when-not result (str (trs "not")
                                          " "))))))

(jobs/defjob TaskHistoryCleanup
  [_]
  (task-history-cleanup!))

(defn task-init
  "Job initialization"
  []
  ;; build our job
  (reset! job (jobs/build
               (jobs/of-type TaskHistoryCleanup)
               (jobs/with-identity (jobs/key job-key))))
  ;; build our trigger
  (reset! trigger (triggers/build
                   (triggers/with-identity (triggers/key trigger-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                     ;; run every day at midnight
                     (cron/cron-schedule "0 0 * * * ? *"))))
  ;; submit ourselves to the scheduler
  (task/schedule-task! @job @trigger))
