(ns metabase.product-notifications.task
  "Cluster-safe scheduled synchronization for product notifications."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.product-notifications.settings :as settings]
   [metabase.product-notifications.sync :as sync]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.task.product-notifications.sync.job")
(def ^:private trigger-key "metabase.task.product-notifications.sync.trigger")

(defn- sync-enabled?
  "Whether this instance is allowed to fetch remote product notifications."
  []
  (and (not config/is-dev?)
       (not (premium-features/airgap-enabled))))

(defn- stale?
  "Whether the instance has never synced or its last completed sync is older than twelve hours."
  []
  (if-let [last-synced (settings/product-notifications-last-synced-at)]
    (t/before? (t/offset-date-time last-synced)
               (t/minus (t/offset-date-time) (t/hours 12)))
    true))

(defn- run-sync!
  "Run one guarded product notification synchronization."
  []
  (when (sync-enabled?)
    (try
      (sync/sync-from-source!)
      (catch Exception e
        (log/warnf e
                   "Product notification synchronization failed during %s"
                   (name (:phase (ex-data e) :unknown)))))))

(task/defjob ^{:doc "Periodically fetch product notifications."
               DisallowConcurrentExecution true} SyncProductNotifications [_]
  (run-sync!))

(defn- sync-trigger
  [hour minute]
  (triggers/build
   (triggers/with-identity (triggers/key trigger-key))
   (triggers/start-now)
   (triggers/with-schedule
    (cron/schedule
     (cron/cron-schedule (format "0 %d %d/12 * * ? *" minute hour))
     (cron/with-misfire-handling-instruction-do-nothing)))))

(defmethod task/init! ::SyncProductNotifications [_]
  (let [job     (jobs/build
                 (jobs/of-type SyncProductNotifications)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (sync-trigger (rand-int 12) (rand-int 60))]
    (task/schedule-task! job trigger)
    (when (and (sync-enabled?) (stale?))
      (task/trigger-now! (jobs/key job-key)))))
