(ns metabase.task.send-anonymous-stats
  "Contains a Metabase task which periodically sends anonymous usage information to the Metabase team."
  (:require [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [metabase
             [public-settings :as public-settings]
             [task :as task]]
            [metabase.util
             [i18n :refer [trs]]
             [stats :as stats]]))

;; if we can collect usage data, do so and send it home
(jobs/defjob SendAnonymousUsageStats [_]
  (when (public-settings/anon-tracking-enabled)
    (log/debug (trs "Sending anonymous usage stats."))
    (try
      ;; TODO: add in additional request params if anonymous tracking is enabled
      (stats/phone-home-stats!)
      (catch Throwable e
        (log/error e (trs "Error sending anonymous usage stats"))))))

(def ^:private job-key     "metabase.task.anonymous-stats.job")
(def ^:private trigger-key "metabase.task.anonymous-stats.trigger")

(defmethod task/init! ::SendAnonymousUsageStats
  [_]
  (let [job     (jobs/build
                 (jobs/of-type SendAnonymousUsageStats)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; run twice a day
                   (cron/cron-schedule "0 15 7 * * ? *")))]
    (task/schedule-task! job trigger)))
