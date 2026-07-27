(ns metabase.search.index-health
  "Shared health-result and metric plumbing for search indexes. Index implementations register raw coverage,
  garbage, and staleness collectors here; this namespace publishes their Prometheus gauges and health-inspector rows."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.util :as u]
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
  ;; [gauge-key labels] -> a u/start-timer taken when this process last published a real value. Only series
  ;; that held a real value are ever cleared; inactive indexes should not create NaN-only series.
  (atom {}))

(defn set-cluster-gauge!
  "Publish `value` for a gauge this process measured on behalf of the whole cluster, or clear it when nil.

  These measurements describe the shared index, not this node, so exactly one node computes and exports
  them -- whichever the clustered scheduler picked. Recording when we last published lets
  [[expire-cluster-gauges!]] retire the series if this node stops being that one, rather than serving its
  final reading forever."
  [gauge-key labels value]
  (let [series [gauge-key labels]]
    (if (some? value)
      (do
        (analytics/set-gauge! gauge-key labels value)
        (swap! live-gauge-series assoc series (u/start-timer)))
      (when (contains? @live-gauge-series series)
        (analytics/set-gauge! gauge-key labels ##NaN)
        (swap! live-gauge-series dissoc series)))))

(defn expire-cluster-gauges!
  "Clear every [[set-cluster-gauge!]] series this process hasn't refreshed within `max-age-ms`.

  A node that loses the scheduled job simply stops refreshing, so without this its last reading would
  linger next to the new owner's and drift further from the truth with every scrape."
  [max-age-ms]
  (doseq [[[gauge-key labels :as series] published] @live-gauge-series
          :when (>= (u/since-ms published) max-age-ms)]
    (analytics/set-gauge! gauge-key labels ##NaN)
    (swap! live-gauge-series dissoc series)))

(def ^:private cluster-gauge-max-age-ms
  "How long a node keeps exporting a measurement it made. Three times the collectors' ten-minute interval,
  so an ordinary missed run doesn't blink the series."
  (* 30 60 1000))

;; Runs on every node, but only ever clears what this one published: whichever node the scheduler picks
;; keeps exporting, and a node that loses the job drops its readings instead of freezing them.
(defmethod analytics.core/pull-collector ::expire-cluster-gauges [_]
  {:min-interval-s 60
   :f              #(expire-cluster-gauges! cluster-gauge-max-age-ms)})

(defn- set-index-gauge!
  [gauge-key index value]
  (set-cluster-gauge! gauge-key {:index (name index)} value))

(defn- run-measure!
  "Run one collector and update its gauge. Returns nil for N/A or a health-inspector result."
  [{:keys [gauge-key index collect check-name]}]
  (let [{:keys [value health message]}
        (try
          (collect)
          (catch InterruptedException e
            (throw e))
          (catch Exception e
            (log/error "Search index metric collector errored" {:check check-name :error (ex-message e)})
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
      (log/error "Search index health-row persist errored" {:check check-name :error (ex-message e)}))))

(defonce ^:private gauge-refresh-running? (atom false))

(defn- submit-gauge-refresh! [f]
  (future-call f))

(defn- refresh-index-gauge! [{:keys [check-name] :as descriptor}]
  (try
    (run-measure! descriptor)
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      (log/error "Search index gauge refresh errored" {:check check-name :error (ex-message e)}))))

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
        (log/errorf "Could not schedule search index gauge refresh: %s" (ex-message e)))))
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
