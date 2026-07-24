(ns metabase.search.index-health
  "Shared health-result and metric plumbing for search indexes. Index implementations register raw coverage,
  garbage, and staleness collectors here; this namespace publishes their Prometheus gauges and health-inspector rows."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn healthy
  "A healthy (100) check result with `message`."
  [message]
  {:health 100, :message message})

(defn warning
  "A partially healthy check result. `health` defaults to 50 and must be strictly between 0 and 100; use
  [[healthy]] or [[degraded]] for the endpoints."
  ([message]
   (warning 50 message))
  ([health message]
   {:pre [(< 0 health 100)]}
   {:health health, :message message}))

(defn degraded
  "A degraded (0) check result with `message`."
  [message]
  {:health 0, :message message})

(def ^:private measure->gauge
  {:coverage  :metabase-search/index-coverage-ratio
   :garbage   :metabase-search/index-garbage-count
   :staleness :metabase-search/index-staleness-seconds})

(defn- percentage
  [ratio]
  (cond
    (<= ratio 0) 0
    (>= ratio 1) 100
    :else         (-> (* 100.0 (double ratio)) Math/round (max 1) (min 99))))

(defn- threshold-health
  "Health from an absolute `value`: 100 at or below `warn`, 0 at or above `critical`, and linear between."
  [value warn critical]
  (cond
    (<= value warn)     100
    (>= value critical) 0
    :else               (-> (* 100.0 (/ (double (- critical value)) (- critical warn)))
                            Math/round
                            (max 1)
                            (min 99))))

(defn coverage-result
  "Result for `indexed` out of `expected` items. The ratio feeds Prometheus; its percentage is the health,
  with 0 and 100 reserved for exact endpoints."
  [indexed expected]
  (let [ratio  (if (pos? expected) (min 1.0 (/ (double indexed) expected)) 1.0)
        health (percentage ratio)]
    {:value   ratio
     :health  health
     :message (format "%d of %d expected items indexed (%d%%)." indexed expected health)}))

(defn garbage-result
  "Result for an absolute `orphans` count, scored against `warn` and `critical` thresholds."
  [orphans warn critical]
  {:value   orphans
   :health  (threshold-health orphans warn critical)
   :message (if (zero? orphans)
              "No orphaned items in the index."
              (format "%d orphaned item(s) in the index." orphans))})

(defn- describe-age [seconds]
  (let [seconds (long seconds)]
    (cond
      (>= seconds 3600) (format "%.1fh" (/ seconds 3600.0))
      (>= seconds 60)   (format "%dm" (quot seconds 60))
      :else             (format "%ds" seconds))))

(defn staleness-result
  "Result for the oldest pending change. `warn` and `critical` are seconds; `detail` is an optional clause."
  [age-seconds warn critical detail]
  (let [age  (long (or age-seconds 0))
        base (if (zero? age)
               "Index current."
               (format "Oldest pending change is %s old." (describe-age age)))]
    {:value   age
     :health  (threshold-health age warn critical)
     :message (if detail (str base " " detail) base)}))

(defonce ^:private index-measures
  ;; Keying by check name makes namespace reloads replace descriptors instead of duplicating collectors.
  (atom {}))

(defonce ^:private live-gauge-series
  ;; Only clear series that previously held a real value; inactive indexes should not create NaN-only series.
  (atom #{}))

(defn- set-index-gauge!
  [gauge-key index value]
  (if (some? value)
    (do
      (analytics/set-gauge! gauge-key {:index (name index)} value)
      (swap! live-gauge-series conj [gauge-key index]))
    (when (contains? @live-gauge-series [gauge-key index])
      (analytics/set-gauge! gauge-key {:index (name index)} ##NaN))))

(defn- run-measure!
  "Run one collector and update its gauge. Returns nil for N/A or a health-inspector result."
  [{:keys [gauge-key index collect check-name]}]
  (let [{:keys [value health message]}
        (try
          (collect)
          (catch InterruptedException e
            (throw e))
          (catch Exception e
            (log/error e "Search index metric collector errored" {:check check-name})
            {:health 0, :message (str "Metric collector errored: " (ex-message e))}))]
    (set-index-gauge! gauge-key index value)
    (when health
      {:health health, :message message})))

(defn register-index-check!
  "Register a collector for logical `index` and `measure`. The collector returns nil for N/A or
  `{:value :health :message}`. Returns a descriptor accepted by [[refresh-index-check!]]."
  [index measure collect]
  (let [descriptor {:check-name (keyword (str (name index) "-" (name measure)))
                    :gauge-key  (measure->gauge measure)
                    :index      index
                    :measure    measure
                    :collect    collect}]
    (health-inspector/register-check! (:check-name descriptor) #(run-measure! descriptor))
    ;; A live upgrade may leave the defonce'd registry in its former vector representation.
    (swap! index-measures (fn [measures]
                            (let [keyed (if (map? measures)
                                          measures
                                          (into {} (map (juxt :check-name identity)) measures))]
                              (assoc keyed (:check-name descriptor) descriptor))))
    descriptor))

(defn refresh-index-check!
  "Refresh one registered descriptor. Updates its gauge and, when enabled, its deduplicated health row."
  [{:keys [check-name] :as descriptor}]
  (try
    (when-let [result (run-measure! descriptor)]
      (when (health-inspector/enabled?)
        (health-inspector/save-check-result! check-name result)))
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      (log/error e "Search index health-row persist errored" {:check check-name}))))

(defonce ^:private gauge-refresh-running? (atom false))

(defn- submit-gauge-refresh! [f]
  (future-call f))

(defn- refresh-index-gauge! [{:keys [check-name] :as descriptor}]
  (try
    (run-measure! descriptor)
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      (log/error e "Search index gauge refresh errored" {:check check-name}))))

(defn- refresh-search-index-gauges!
  []
  (try
    (run! refresh-index-gauge! (vals @index-measures))
    (finally
      (reset! gauge-refresh-running? false))))

(defn- request-search-index-gauge-refresh!
  []
  (when (compare-and-set! gauge-refresh-running? false true)
    (try
      (submit-gauge-refresh! refresh-search-index-gauges!)
      (catch Exception e
        (reset! gauge-refresh-running? false)
        (log/error e "Could not schedule search index gauge refresh"))))
  nil)

;; Prometheus scrapes every Metabase process, whereas the scheduled metric job may run on only one member of
;; a Quartz cluster. A scrape starts a local, single-flight background refresh so every process updates its
;; series without putting index scans on the synchronous scrape path.
(defmethod analytics.core/pull-collector ::index-health-gauges [_]
  {:min-interval-s 600
   :f              request-search-index-gauge-refresh!})

(defn refresh-search-index-metrics!
  "Refresh every registered measure's gauge and, when enabled, its deduplicated health row."
  []
  (run! refresh-index-check! (vals @index-measures)))
