(ns metabase.task.upgrade-checks
  "Contains a Metabase task which periodically checks for the availability of new Metabase versions."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [metabase
             [config :as config]
             [public-settings :as public-settings]
             [task :as task]]
            [metabase.util.i18n :refer [trs]]))

(defn- get-version-info []
  (let [version-info-url      (config/config-str :mb-version-info-url)
        {:keys [status body]} (http/get version-info-url {:content-type "application/json"})]
    (when (not= status 200)
      (throw (Exception. (format "[%d]: %s" status body))))
    (json/parse-string body keyword)))

;; simple job which looks up all databases and runs a sync on them
(jobs/defjob CheckForNewVersions [_]
  (when (public-settings/check-for-updates)
    (log/debug (trs "Checking for new Metabase version info."))
    (try
      ;; TODO: add in additional request params if anonymous tracking is enabled
      (when-let [version-info (get-version-info)]
        (public-settings/version-info version-info))
      (catch Throwable e
        (log/error e (trs "Error fetching version info"))))))

(def ^:private job-key     "metabase.task.upgrade-checks.job")
(def ^:private trigger-key "metabase.task.upgrade-checks.trigger")

(defmethod task/init! ::CheckForNewVersions [_]
  (let [job     (jobs/build
                 (jobs/of-type CheckForNewVersions)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; run twice a day
                   (cron/cron-schedule "0 15 6,18 * * ? *")))]
    (task/schedule-task! job trigger)))
