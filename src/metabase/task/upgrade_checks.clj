(ns metabase.task.upgrade-checks
  "Contains a Metabase task which periodically checks for the availability of new Metabase versions."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.tools.logging :as log]
            (clojurewerkz.quartzite [jobs :as jobs]
                                    [triggers :as triggers])
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [metabase.task :as task]
            [metabase.models.setting :as setting]))

(def ^:private ^:const upgrade-checks-job-key     "metabase.task.upgrade-checks.job")
(def ^:private ^:const upgrade-checks-trigger-key "metabase.task.upgrade-checks.trigger")

(defonce ^:private upgrade-checks-job (atom nil))
(defonce ^:private upgrade-checks-trigger (atom nil))

(defn- get-version-info []
  ;; TODO: determine the proper final url for our version-info file
  (let [{:keys [status body]} (http/get "http://localhost:4000/version-info.json" {:content-type "application/json"})]
    (when (not= status 200)
      (throw (Exception. (format "[%d]: %s" status body))))
    (json/parse-string body keyword)))

;; simple job which looks up all databases and runs a sync on them
(jobs/defjob CheckForNewVersions
  [ctx]
  (when (= "true" (setting/check-for-updates))
    (log/debug "Checking for new Metabase version info.")
    (try
      ;; TODO: add in additional request params if anonymous tracking is enabled
      (when-let [version-info (get-version-info)]
        (setting/version-info (json/generate-string version-info)))
      (catch Throwable e
        (log/error "Error fetching version info: " e)))))

(defn task-init
  "Job initialization"
  []
  ;; build our job
  (reset! upgrade-checks-job (jobs/build
                               (jobs/of-type CheckForNewVersions)
                               (jobs/with-identity (jobs/key upgrade-checks-job-key))))
  ;; build our trigger
  (reset! upgrade-checks-trigger (triggers/build
                                   (triggers/with-identity (triggers/key upgrade-checks-trigger-key))
                                   (triggers/start-now)
                                   (triggers/with-schedule
                                     ;; run twice a day
                                     ;(cron/cron-schedule "0 15 6,18 * * ? *")
                                     (cron/cron-schedule "15,45 * * * * ? *"))))
  ;; submit ourselves to the scheduler
  (task/schedule-task! @upgrade-checks-job @upgrade-checks-trigger))
