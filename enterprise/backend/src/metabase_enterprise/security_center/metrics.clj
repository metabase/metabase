(ns metabase-enterprise.security-center.metrics
  "Prometheus metrics for the Security Center: advisory feed freshness,
   vulnerability counts and the status of each health check. Exposed so operators
   can alert when advisories stop syncing, when vulnerabilities are present, or
   when a health check fails."
  (:require
   [metabase-enterprise.security-center.db :as security-center.db]
   [metabase-enterprise.security-center.health-checks :as health-checks]
   [metabase-enterprise.security-center.settings :as settings]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.util.log :as log])
  (:import
   (java.time.temporal Temporal ChronoField)))

(set! *warn-on-reflection* true)

(def ^:private vulnerable-statuses #{:active :error})

(defn- label-of [severity ack?]
  {:severity     (name severity)
   :acknowledged (str ack?)})

(def ^:private vulnerable-advisory-labels
  (vec (for [severity security-center.schema/severities
             ack?     [true false]]
         (label-of severity ack?))))

(defmethod analytics.core/known-labels :metabase-security-center/vulnerable-advisories
  [_]
  vulnerable-advisory-labels)

(defn- last-sync-epoch-seconds
  "Read the last-synced-at setting and convert to Unix epoch seconds, or nil if
   no sync has ever completed."
  []
  (when-let [^Temporal t (settings/security-center-last-synced-at)]
    (.getLong t ChronoField/INSTANT_SECONDS)))

(defn- vulnerable-counts
  "Return a map of [severity acknowledged?] → count for advisories whose
   match_status places them in the vulnerable bucket."
  []
  (->> (security-center.db/advisories-with-statuses-reducible vulnerable-statuses)
       (reduce (fn [acc {:keys [severity acknowledged_at]}]
                 (update acc (label-of severity (some? acknowledged_at)) (fnil inc 0)))
               {})))

(defn refresh-metrics!
  "Recompute and set Security Center Prometheus gauges from the appdb."
  []
  (try
    (when-let [epoch (last-sync-epoch-seconds)]
      (analytics/set-gauge! :metabase-security-center/last-sync-timestamp-seconds epoch))
    (catch Exception e
      (log/warnf "Failed to set :metabase-security-center/last-sync-timestamp-seconds metric: %s" (ex-message e))))
  (try
    (let [counts (vulnerable-counts)]
      (doseq [label vulnerable-advisory-labels]
        (analytics/set-gauge! :metabase-security-center/vulnerable-advisories
                              label
                              (get counts label 0))))
    (catch Exception e
      (log/warnf "Failed to set :metabase-security-center/vulnerable-advisories metric: %s" (ex-message e)))))

;;; Health checks

(defn- health-check-label
  [{:keys [id severity]} status]
  {:check_id (name id)
   :severity (name severity)
   :status   (name status)})

(defmethod analytics.core/known-labels :metabase-security-center/health-checks
  [_]
  (vec (for [check  (health-checks/all-checks)
             status security-center.schema/health-check-statuses]
         (health-check-label check status))))

(defn set-health-check-gauges!
  "Sets the health-checks gauge from `checks`, the responses of a full run: 1 for the status each check has, 0 for the
  other two. A registered check that is not in `checks` gets 0 on all three statuses, so a check that stops applying
  reads as cleared."
  [checks]
  (try
    (let [status-of-id (into {} (map (juxt :id :status)) checks)]
      (doseq [check  (health-checks/all-checks)
              status security-center.schema/health-check-statuses]
        (analytics/set-gauge! :metabase-security-center/health-checks
                              (health-check-label check status)
                              (if (= status (status-of-id (:id check))) 1 0))))
    (catch Exception e
      (log/warnf "Failed to set :metabase-security-center/health-checks metric: %s" (ex-message e)))))

(defn set-health-checks-last-run!
  "Sets the last-run gauge of the health checks to `time`."
  [^Temporal time]
  (try
    (analytics/set-gauge! :metabase-security-center/health-checks-last-run-timestamp-seconds
                          (.getLong time ChronoField/INSTANT_SECONDS))
    (catch Exception e
      (log/warnf "Failed to set :metabase-security-center/health-checks-last-run-timestamp-seconds metric: %s"
                 (ex-message e)))))
