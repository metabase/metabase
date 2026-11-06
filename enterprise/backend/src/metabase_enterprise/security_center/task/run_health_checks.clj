(ns metabase-enterprise.security-center.task.run-health-checks
  "Quartz task that refreshes the background health checks, runs every health check and sets the health check
  gauges."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.security-center.health-checks :as health-checks]
   [metabase-enterprise.security-center.metrics :as metrics]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.task.security-center.run-health-checks.job")
(def ^:private trigger-key "metabase.task.security-center.run-health-checks.trigger")

(defn run-health-checks!
  "Refreshes every background health check, runs every health check and sets the gauges. Does nothing when Security
  Center is off."
  []
  (when (premium-features/security-center-enabled?)
    (let [timer  (u/start-timer)
          checks (health-checks/refresh-and-run-checks)]
      (metrics/set-health-check-gauges! checks)
      (metrics/set-health-checks-last-run! (t/offset-date-time))
      (log/infof "Ran %d health checks in %sms: %s"
                 (count checks) (u/since-ms timer) (frequencies (map :status checks))))))

(task/defjob RunHealthChecks
  "Periodically refresh the background health checks and set the health check gauges."
  {:saved-class "metabase_enterprise.security_center.task.run_health_checks.RunHealthChecks"
   :concurrent? false}
  [_]
  (run-health-checks!))

(defmethod task/init! ::RunHealthChecks [_]
  (when (premium-features/security-center-enabled?)
    (let [minute   (rand-int 60)
          ;; Run at a random minute past 0:00, 6:00, 12:00, 18:00 UTC
          cron-str (format "0 %d 0/6 * * ? *" minute)
          job      (jobs/build
                    (jobs/of-type RunHealthChecks)
                    (jobs/with-identity (jobs/key job-key)))
          trigger  (triggers/build
                    (triggers/with-identity (triggers/key trigger-key))
                    (triggers/start-now)
                    (triggers/with-schedule
                     (cron/schedule
                      (cron/cron-schedule cron-str)
                      (cron/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger)
      ;; a background check shows "Not checked yet" until its first refresh, so do not wait up to six hours for it
      (when (health-checks/background-check-without-result?)
        (task/trigger-now! (jobs/key job-key))))))
