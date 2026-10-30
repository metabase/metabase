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

(def ^:private gauge-refresh-interval-s
  "How often a scrape may start a refresh of every registered measure."
  600)

(def ^:private stale-gauge-age-ms
  "How long a series survives without a refresh."
  ;; The deadline has to clear the longest gap between two publishes, and that gap is not the interval. A
  ;; scrape stamps its own throttle before calling a collector, and the collector declines while a refresh
  ;; is still running, so the gap is really the refresh duration rounded up to a whole interval. Three
  ;; intervals therefore tolerate a refresh of up to two of them, around twenty minutes. Anything slower
  ;; than that expires its own series and republishes it, which the warning in the sweep reports.
  (* 3 gauge-refresh-interval-s 1000))

(defonce ^:private live-gauge-series
  ;; [gauge-key labels] -> a u/start-timer from when this process last published a real value. Only series
  ;; that held one are ever removed; an inactive index should never create one.
  (atom {}))

;; Publishing and expiring race otherwise: a sweep can read a timer, watch a refresh replace it, and then
;; remove the series the refresh just exported. Neither side is hot -- the sweep runs once a minute, and a
;; publish comes from a background refresh, the clustered job's health rows or a repair push -- so a lock is
;; cheaper than getting a compare-and-set across the tracker and the registry right.
(defn publish-gauge!
  "Publish `value` for a search gauge, or stop exporting that series when `value` is nil.
  `labels` must name at least one label: an unlabelled collector has no series it can stop exporting."
  [gauge-key labels value]
  (locking live-gauge-series
    (let [series [gauge-key labels]]
      (if (some? value)
        (do
          (analytics/set-gauge! gauge-key labels value)
          (swap! live-gauge-series assoc series (u/start-timer)))
        ;; Removed rather than set to NaN, which keeps being scraped and poisons any avg or sum over it.
        (when (contains? @live-gauge-series series)
          (analytics/remove-series! gauge-key labels)
          (swap! live-gauge-series dissoc series))))))

(defn- expire-stale-gauges!
  "Stop exporting series this process hasn't refreshed within [[stale-gauge-age-ms]]."
  []
  ;; Every process measures its own series, so one goes stale only when this node's refresh stopped
  ;; happening -- and a reading nothing is renewing is worse than none.
  (locking live-gauge-series
    (doseq [[[gauge-key labels :as series] published] @live-gauge-series
            :when (>= (u/since-ms published) stale-gauge-age-ms)]
      ;; Per series, so that one failure cannot end the sweep for every series behind it in the map.
      (try
        (analytics/remove-series! gauge-key labels)
        (swap! live-gauge-series dissoc series)
        ;; The realistic cause is a refresh wedged in a database call: it holds its single-flight claim for
        ;; the life of the process, so this node would otherwise go quiet about a series that vanished.
        (log/warn "Stopped exporting a search gauge series this process had not refreshed"
                  {:gauge    gauge-key
                   :labels   labels
                   :age-ms   (u/since-ms published)
                   :limit-ms stale-gauge-age-ms})
        (catch InterruptedException e
          (throw e))
        (catch Exception e
          (log/error e "Could not stop exporting a stale search gauge series"
                     {:gauge gauge-key, :labels labels}))))))

(defmethod analytics.core/pull-collector ::expire-stale-gauges [_]
  {:min-interval-s 60
   :f              expire-stale-gauges!})

(defn background-refresh-collector
  "A [[metabase.analytics.core/background-refresh-collector]] on the search gauge cadence.
  Every search gauge family must use this rather than the generic constructor, so that no series outlives
  the deadline its staleness is judged against."
  [id refresh!]
  (analytics.core/background-refresh-collector id gauge-refresh-interval-s refresh!))

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
    (publish-gauge! gauge-key {:index (name index)} value)
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
    (swap! index-measures assoc (:check-name descriptor) descriptor)
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

(defn- refresh-index-gauge! [{:keys [check-name] :as descriptor}]
  (try
    (run-measure! descriptor)
    (catch InterruptedException e
      (throw e))
    (catch Exception e
      (log/error "Search index gauge refresh errored" {:check check-name :error (ex-message e)}))))

(defn- refresh-search-index-gauges! []
  (run! refresh-index-gauge! (vals @index-measures)))

(def ^:private index-gauge-collector
  (background-refresh-collector ::index-health-gauges refresh-search-index-gauges!))

(defmethod analytics.core/pull-collector ::index-health-gauges [_]
  index-gauge-collector)

(defn refresh-search-index-metrics!
  "Refresh every registered measure's gauge and, when enabled, its deduplicated health row."
  []
  (run! refresh-index-check! (vals @index-measures)))
