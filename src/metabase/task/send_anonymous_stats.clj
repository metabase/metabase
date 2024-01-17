(ns metabase.task.send-anonymous-stats
  "Contains a Metabase task which periodically sends anonymous usage information to the Metabase team."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics.stats :as stats]
   [metabase.public-settings :as public-settings]
   [metabase.task :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(jobs/defjob ^{:doc "If we can collect usage data, do so and send it home"} SendAnonymousUsageStats [_]
  (when (public-settings/anon-tracking-enabled)
    (log/debug "Sending anonymous usage stats.")
    (try
      ;; TODO: add in additional request params if anonymous tracking is enabled
      (stats/phone-home-stats!)
      (catch Throwable e
        (log/error e "Error sending anonymous usage stats")))))

(def ^:private job-key     "metabase.task.anonymous-stats.job")
(def ^:private trigger-key "metabase.task.anonymous-stats.trigger")

(defmethod task/init! ::SendAnonymousUsageStats
  [_]
  (let [job      (jobs/build
                  (jobs/of-type SendAnonymousUsageStats)
                  (jobs/with-identity (jobs/key job-key)))
        ;; run at a random hour/minute
        schedule (cron/cron-schedule
                  (format "0 %d %d * * ? *"
                          (rand-int 60)
                          (rand-int 24)))
        trigger  (triggers/build
                  (triggers/with-identity (triggers/key trigger-key))
                  (triggers/start-now)
                  (triggers/with-schedule schedule))]
    (task/schedule-task! job trigger)))
