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
   [metabase.util.log :as log])
  (:import
   (java.time.temporal Temporal ChronoField)))

(set! *warn-on-reflection* true)

(def ^:private severities [:critical :high :medium :low])

(def ^:private vulnerable-statuses #{:active :error})

(defn- label-of [severity ack?]
  {:severity     (name severity)
   :acknowledged (str ack?)})

(def ^:private vulnerable-advisory-labels
  (vec (for [severity severities
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

(def ^:private health-check-statuses [:pass :fail :unknown])

(defn- health-check-label
  [{:keys [id severity]} status]
  {:check_id (name id)
   :severity (name severity)
   :status   (name status)})

(defmethod analytics.core/known-labels :metabase-security-center/health-checks
  [_]
  (vec (for [check  (health-checks/all-checks)
             status health-check-statuses]
         (health-check-label check status))))

(defn set-health-check-gauges!
  "Sets the health-checks gauge from `checks`, the responses of a run: 1 for the status each check has, 0 for the other
  two. A check that is not in `checks` keeps its last value."
  [checks]
  (try
    (doseq [check  checks
            status health-check-statuses]
      (analytics/set-gauge! :metabase-security-center/health-checks
                            (health-check-label check status)
                            (if (= status (:status check)) 1 0)))
    (catch Exception e
      (log/warnf "Failed to set :metabase-security-center/health-checks metric: %s" (ex-message e)))))
