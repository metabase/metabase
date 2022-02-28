(ns metabase.task.refresh-slack-channel-user-cache
  (:require [metabase.integrations.slack :as slack]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite.jobs :as jobs]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clojurewerkz.quartzite.triggers :as triggers]
            [metabase.util.i18n :refer [trs]]
            [metabase.task :as task]
            [java-time :as t]))

(jobs/defjob RefreshCache [_]
  (log/fatalf "RefreshCache called at %s" (t/local-date-time))
  (if (slack/slack-configured?)
    (let [start-ms (System/currentTimeMillis)
          _ (log/debug "Starting Slack user/channel cache refresh...")
          _ (slack/refresh-channels-and-usernames!)]
      (log/debug (trs "Slack user/channel cache refreshed with ({0}) entries, took ({1})."
                      (count (slack/slack-cached-channels-and-usernames))
                      (- (System/currentTimeMillis) start-ms))))
    (log/debug (trs "Slack is not setup, not refreshing slack user/channel cache."))))

(def ^:private job-key "metabase.task.refresh-channel-cache.job")
(def ^:private trigger-key "metabase.task.refresh-channel-cache.trigger")
(def ^:private startup-trigger-key "metabase.task.on-startup-refresh-channel-cache.trigger")

(defmethod task/init! ::RefreshCache
  [_]
  (let [job             (jobs/build
                         (jobs/of-type RefreshCache)
                         (jobs/with-identity (jobs/key job-key)))
        trigger         (triggers/build
                         (triggers/with-identity (triggers/key trigger-key))
                         (triggers/start-now)
                         (triggers/with-schedule
                           (cron/cron-schedule
                            ;; run every 4 hours at a random minute
                            (format "0 %d 0/4 1/1 * ? *" (rand-int 60)))))
        startup-trigger (triggers/build
                         (triggers/with-identity (triggers/key startup-trigger-key))
                         (triggers/start-now))]
    (task/schedule-task! job startup-trigger)
    (task/schedule-task! job trigger)))

(comment

  (task/start-scheduler!)

  (task/init! "metabase.task.refresh-slack-channel-user-cache/RefreshCache")

  (#'task/jobs-info)

  (task/delete-task! (jobs/key job-key) (triggers/key trigger-key))
  (task/delete-task! (jobs/key job-key) (triggers/key startup-trigger-key))

  (jobs/defjob printHello [_this]
    (println " - hello. it is now: " (System/currentTimeMillis)))
  (let [job             (jobs/build
                         (jobs/of-type printHello)
                         (jobs/with-identity (jobs/key "metabase.task.print-hello.job")))
        cron-trigger    (triggers/build
                         (triggers/with-identity (triggers/key "metabase.task.print-hello.key"))
                         (triggers/start-now)
                         (triggers/with-schedule
                           (cron/cron-schedule "0 0/1 * 1/1 * ? *")))
        startup-trigger (triggers/build
                         (triggers/with-identity (triggers/key "metabase.task.print-hello-startup.key"))
                         (triggers/start-now))]
    (task/schedule-task! job startup-trigger)
    (task/schedule-task! job cron-trigger))

  

  )
