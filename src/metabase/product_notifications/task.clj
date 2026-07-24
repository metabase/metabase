(ns metabase.product-notifications.task
  "Cluster-safe scheduled synchronization for product notifications."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.premium-features.core :as premium-features]
   [metabase.product-notifications.settings :as settings]
   [metabase.product-notifications.sync :as sync]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.version.settings :as version.settings])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.task.product-notifications.sync.job")
(def ^:private trigger-key "metabase.task.product-notifications.sync.trigger")

(defn sync-enabled?
  "Whether this instance is allowed to fetch remote product notifications."
  []
  (and (version.settings/check-for-updates)
       (not (premium-features/airgap-enabled))))

(defn stale?
  "Whether the instance has never synced or its last successful sync is older than twelve hours."
  []
  (if-let [last-synced (settings/product-notifications-last-synced-at)]
    (t/before? (t/offset-date-time last-synced)
               (t/minus (t/offset-date-time) (t/hours 12)))
    true))

(defn run-sync!
  "Run one guarded product notification synchronization."
  []
  (when (sync-enabled?)
    (try
      (sync/sync-from-source!)
      (catch Exception e
        (log/warn e "Product notification synchronization failed")))))

(task/defjob ^{:doc "Periodically fetch product notifications."
               DisallowConcurrentExecution true} SyncProductNotifications [_]
  (run-sync!))

(defmethod task/init! ::SyncProductNotifications [_]
  (let [hour     (rand-int 12)
        minute   (rand-int 60)
        cron-str (format "0 %d %d/12 * * ? *" minute hour)
        job      (jobs/build
                  (jobs/of-type SyncProductNotifications)
                  (jobs/with-identity (jobs/key job-key)))
        trigger  (triggers/build
                  (triggers/with-identity (triggers/key trigger-key))
                  (triggers/start-now)
                  (triggers/with-schedule
                   (cron/schedule
                    (cron/cron-schedule cron-str)
                    (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)
    (when (and (sync-enabled?) (stale?))
      (task/trigger-now! (jobs/key job-key)))))
