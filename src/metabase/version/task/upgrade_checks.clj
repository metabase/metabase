(ns metabase.version.task.upgrade-checks
  "Contains a Metabase task which periodically checks for the availability of new Metabase versions."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.task.core :as task]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.version.settings :as version.settings]))

(set! *warn-on-reflection* true)

(defn- get-version-info []
  (let [version-info-url-key  (if config/ee-available? :mb-version-info-ee-url :mb-version-info-url)
        version-info-url      (config/config-str version-info-url-key)
        {:keys [status body]} (http/get version-info-url (merge
                                                          {:content-type "application/json"}
                                                          (when config/is-prod?
                                                            {:query-params (m/remove-vals
                                                                            str/blank?
                                                                            {"instance" (version.settings/site-uuid-for-version-info-fetching)
                                                                             "current-version" (:tag config/mb-version-info)})})))]
    (when (not= status 200)
      (throw (Exception. (format "[%d]: %s" status body))))
    (json/decode+kw body)))

(task/defjob ^{:doc "Simple job which looks up all databases and runs a sync on them"} CheckForNewVersions [_]
  (when (version.settings/check-for-updates)
    (log/debug "Checking for new Metabase version info.")
    (try
      ;; TODO: add in additional request params if anonymous tracking is enabled
      (version.settings/version-info-last-checked! (t/zoned-date-time))
      (when-let [version-info (get-version-info)]
        (version.settings/version-info! version-info))
      (catch Throwable e
        (log/errorf "Error fetching version info; setting version-info value to nil: %s" (ex-message e))
        (version.settings/version-info! nil)))))

(def ^:private job-key     "metabase.task.upgrade-checks.job")
(def ^:private trigger-key "metabase.task.upgrade-checks.trigger")

(defn- rand-hours
  "Give a random hour plus the hours 6, 12, and 18 hours away, i.e. one of [0 6 12 18], [1 7 13 19], etc"
  []
  (let [hour-1 (rand-int 24)]
    (mapv #(mod (+ hour-1 %) 24) [0 6 12 18])))

(defmethod task/init! ::CheckForNewVersions [_]
  (let [[h1 h2 h3 h4] (rand-hours)
        rand-minute (rand-int 60)
        job     (jobs/build
                 (jobs/of-type CheckForNewVersions)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; run every 6 hours, at a random hour/minute offset to spread load
                  (cron/cron-schedule (format "0 %d %d,%d,%d,%d * * ? *" rand-minute h1 h2 h3 h4))))]
    (task/schedule-task! job trigger)))
