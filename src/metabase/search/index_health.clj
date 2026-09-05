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
  "How long a series survives without a refresh. Three intervals, so a missed run doesn't drop it."
  (* 3 gauge-refresh-interval-s 1000))

(defonce ^:private live-gauge-series
  ;; [gauge-key labels] -> a u/start-timer from when this process last published a real value. Only series
  ;; that held one are ever removed; an inactive index should never create one.
  (atom {}))

(defn- tracked-entry
  "One tracker entry as `[[gauge-key labels] timer]`, or nil for anything unreadable.
  Two shapes survive a reload: the set this tracker used to be, and an entry a refresh still running that
  older code conj'd onto the migrated map, which arrives as a `gauge-key -> index` MapEntry. Both name a
  series that is still exported, so give them a key and timer this code can act on rather than losing the
  ability to remove them."
  [entry]
  (cond
    (and (vector? entry) (= 2 (count entry)) (vector? (first entry)))
    entry

    ;; a set element, [gauge-key index]
    (and (vector? entry) (= 2 (count entry)) (keyword? (first entry)) (keyword? (second entry)))
    [[(first entry) {:index (name (second entry))}] (u/start-timer)]))

(defn- normalize-tracker
  [tracked]
  (into {} (keep tracked-entry) tracked))

(defn- normalize-tracker!
  "Bring anything a reload left behind into the current shape and return it. Callers iterate what they get
  back rather than dereferencing again: the pre-reload writer doesn't take the lock, so it can land another
  malformed entry between the two."
  []
  (swap! live-gauge-series
         (fn [tracked]
           (if (and (map? tracked) (every? vector? (keys tracked)))
             tracked
             (normalize-tracker tracked)))))

(normalize-tracker!)

;; Publishing and expiring race otherwise: a sweep can read a timer, watch a refresh replace it, and then
;; remove the series the refresh just exported. Both sides are rare (one refresh per interval, one sweep a
;; minute), so a lock is cheaper than getting the compare-and-set right.
(defn publish-gauge!
  "Publish `value` for a search gauge, or stop exporting that series when `value` is nil.
  Removed rather than set to NaN: a NaN is still scraped, and poisons any `avg` or `sum` over the series."
  [gauge-key labels value]
  (locking live-gauge-series
    (normalize-tracker!)
    (let [series [gauge-key labels]]
      (if (some? value)
        (do
          (analytics/set-gauge! gauge-key labels value)
          (swap! live-gauge-series assoc series (u/start-timer)))
        (when (contains? @live-gauge-series series)
          (analytics/remove-series! gauge-key labels)
          (swap! live-gauge-series dissoc series))))))

(defn- expire-stale-gauges!
  "Stop exporting series this process hasn't refreshed within [[stale-gauge-age-ms]].
  Every process measures its own series, so one goes stale only when this node's refresh stopped happening
  -- and a reading nothing is renewing is worse than none."
  []
  (locking live-gauge-series
    (doseq [[[gauge-key labels :as series] published] (normalize-tracker!)
            :when (>= (u/since-ms published) stale-gauge-age-ms)]
      (analytics/remove-series! gauge-key labels)
      (swap! live-gauge-series dissoc series))))

(defmethod analytics.core/pull-collector ::expire-stale-gauges [_]
  {:min-interval-s 60
   :f              expire-stale-gauges!})

(defonce ^:private refreshes-in-flight
  ;; ids of the background refreshes currently running here, so a burst of scrapes shares one of each
  (atom #{}))

(defn- submit-gauge-refresh! [f]
  (future-call f))

(defn- claim-refresh!
  "Mark `id` in flight, returning false when it already was."
  [id]
  (let [[before _] (swap-vals! refreshes-in-flight conj id)]
    (not (contains? before id))))

(defn background-refresh-collector
  "A [[metabase.analytics.core/pull-collector]] map running `refresh!` on a local single-flight background
  thread, at most once per [[gauge-refresh-interval-s]].
  Prometheus scrapes every process while the scheduled job runs on one member of a Quartz cluster, so each
  process measures its own series this way instead of republishing another node's. The scrape itself never
  waits on an index scan."
  [id refresh!]
  {:min-interval-s gauge-refresh-interval-s
   :f              (fn []
                     (when (claim-refresh! id)
                       (try
                         (submit-gauge-refresh! (fn []
                                                  (try
                                                    (refresh!)
                                                    (finally
                                                      (swap! refreshes-in-flight disj id)))))
                         (catch Exception e
                           (swap! refreshes-in-flight disj id)
                           (log/error "Could not schedule a search gauge refresh" {:id id :error (ex-message e)}))))
                     nil)})

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
