(ns metabase-enterprise.security-center.metrics
  "Prometheus metrics for the Security Center: advisory feed freshness and
   vulnerability counts. Exposed so operators can alert when advisories stop
   syncing or when vulnerabilities are present."
  (:require
   [metabase-enterprise.security-center.settings :as settings]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
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
  (->> (t2/reducible-select [:model/SecurityAdvisory :severity :acknowledged_at]
                            :match_status [:in vulnerable-statuses])
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
      (log/warn e "Failed to set :metabase-security-center/last-sync-timestamp-seconds metric")))
  (try
    (let [counts (vulnerable-counts)]
      (doseq [label vulnerable-advisory-labels]
        (analytics/set-gauge! :metabase-security-center/vulnerable-advisories
                              label
                              (get counts label 0))))
    (catch Exception e
      (log/warn e "Failed to set :metabase-security-center/vulnerable-advisories metric"))))
