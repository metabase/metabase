(ns metabase.product-notifications.task
  "Periodically fetches the in-app product notifications feed from static.metabase.com, mirroring the version-info
  upgrade check. Runs twice a day (and once at startup)."
  (:require
   [clj-http.client :as http]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.product-notifications.settings :as product-notifications.settings]
   [metabase.task.core :as task]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.version.core :as version]))

(set! *warn-on-reflection* true)

(defn- get-notifications
  "Fetch and parse the product notifications feed. It is a static CDN file, so unlike the version-info check we
  send no instance-identifying query params."
  []
  (let [url                   (config/config-str :mb-product-notifications-url)
        {:keys [status body]} (http/get url {:content-type "application/json"})]
    (when (not= status 200)
      (throw (Exception. (format "[%d]: %s" status body))))
    (json/decode+kw body)))

(task/defjob ^{:doc "Fetches the in-app product notifications feed from static.metabase.com."}
  FetchProductNotifications [_]
  (when (version/check-for-updates)
    (log/debug "Fetching in-app product notifications.")
    (try
      (product-notifications.settings/product-notifications-last-checked! (t/zoned-date-time))
      (when-let [feed (get-notifications)]
        (product-notifications.settings/product-notifications-info! feed))
      (catch Throwable e
        (log/error e "Error fetching product notifications; clearing cached feed")
        (product-notifications.settings/product-notifications-info! nil)))))

(def ^:private job-key     "metabase.task.product-notifications.job")
(def ^:private trigger-key "metabase.task.product-notifications.trigger")

(defn- rand-hours
  "Give a random hour plus the hour 12 hours away, i.e. one of [0 12], [1 13], [2 14], etc."
  []
  (let [hour-1 (rand-int 24)]
    [hour-1 (mod (+ hour-1 12) 24)]))

(defmethod task/init! ::FetchProductNotifications [_]
  (let [[rand-hour-1 rand-hour-2] (rand-hours)
        rand-minute (rand-int 60)
        job     (jobs/build
                 (jobs/of-type FetchProductNotifications)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; run twice a day, mirroring the version-info upgrade check
                  (cron/cron-schedule (format "0 %d %d,%d * * ? *" rand-minute rand-hour-1 rand-hour-2))))]
    (task/schedule-task! job trigger)
    ;; also fetch once on startup so a freshly-started instance has the current feed without
    ;; waiting for the next scheduled run (a cron trigger does not fire immediately)
    (task/trigger-now! (jobs/key job-key))))
