(ns metabase.task.session-cleanup
  (:require [clojurewerkz.quartzite.jobs :as jobs]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clojurewerkz.quartzite.triggers :as triggers]
            [metabase.task :as task]))

(def ^:private session-cleanup-job-key (jobs/key "metabase.task.session.cleanup.job"))
(def ^:private session-cleanup-trigger-key (triggers/key "metabase.task.follow-up-emails.trigger"))

(jobs/defjob ^{:doc "Triggers that cleans up outdated sessions."}
  SessionCleanup
  [context]
  (println ("Running session cleanup job!!!"))

(defmethod task/init! ::SessionCleanup [_]
  (let [job     (jobs/build
                  (jobs/of-type SessionCleanup)
                  (jobs/with-identity session-cleanup-job-key))
        trigger (triggers/build
                  (triggers/with-identity session-cleanup-trigger-key)
                  (triggers/start-now)
                  (triggers/with-schedule
                    ;; run once a day
                    (cron/cron-schedule "* * * * * ? *")))]
    (task/schedule-task! job trigger))))
