(ns metabase.task.refresh-slack-channel-user-cache
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.integrations.slack :as slack]
   [metabase.task :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn ^:private job []
  (if (slack/slack-configured?)
    (let [_        (log/info "Starting Slack user/channel startup cache refresh...")
          start-ms (System/currentTimeMillis)
          _        (slack/refresh-channels-and-usernames!)]
      (log/infof "Slack user/channel startup cache refreshed with %s entries, took %sms."
                 (count (:channels (slack/slack-cached-channels-and-usernames)))
                 (- (System/currentTimeMillis) start-ms)))
    (log/info "Slack is not configured, not refreshing slack user/channel cache.")))

(def ^:private job-key "metabase.task.refresh-channel-cache.job")
(def ^:private trigger-key "metabase.task.refresh-channel-cache.trigger")
(def ^:private startup-job-key "metabase.task.on-startup-refresh-channel-cache.job")
(def ^:private startup-trigger-key "metabase.task.on-startup-refresh-channel-cache.trigger")

(jobs/defjob ^{:doc "General slack cache refresh job"} RefreshCache [_] (job))

(jobs/defjob ^{:doc "Startup cache refresh, with cleanup on failure."} RefreshCacheOnStartup [_]
  (try (job)
       (finally
         (task/delete-task! (jobs/key startup-job-key)
                            (triggers/key startup-trigger-key)))))

(defmethod task/init! ::RefreshSlackChannelsAndUsers
  [_]
  (let [job     (jobs/build
                 (jobs/of-type RefreshCache)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/with-schedule
                   (cron/schedule
                    (cron/cron-schedule
                     ;; run every 4 hours at a random minute:
                     (format "0 %d 0/4 1/1 * ? *" (rand-int 60)))
                    (cron/with-misfire-handling-instruction-do-nothing)))

                 (triggers/start-now))
        startup-job     (jobs/build
                         (jobs/of-type RefreshCacheOnStartup)
                         (jobs/with-identity (jobs/key startup-job-key)))
        startup-trigger (triggers/build
                         (triggers/with-identity (triggers/key startup-trigger-key))
                         (triggers/with-schedule
                           (simple/schedule (simple/with-interval-in-seconds 60)))
                         (triggers/start-now))]
    (task/schedule-task! job trigger)
    (task/schedule-task! startup-job startup-trigger)))
