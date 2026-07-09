(ns metabase-enterprise.semantic-search.health
  "Health-inspector check for semantic search, plus the embedding-service probe shared with the NLQ
  retrieval check ([[metabase-enterprise.entity-retrieval.health]]).

  Semantic search degrades silently -- no active index, a stalled indexer, or an unreachable embedding
  service just falls back to appdb search, and nobody notices; this check surfaces that.
  Health is status-style: 100 = serving the good path, 0 = enabled but degraded (the `:message` names the
  failing condition).
  A not-enabled instance returns nil, so the check is omitted rather than reported as a misleading 100."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.analytics-interface.core :as analytics]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(defn- healthy [message] {:health 100 :message message})
(defn- degraded [message] {:health 0 :message message})

(defn- probe-embedding-service
  "Raw embedding-service probe; see [[embedding-service-reachable?]] for the memoized entry point."
  []
  (try
    ;; Bypass the breaker so the probe is an independent signal and can't itself trip or reset it.
    ;; snowplow? false: don't emit a phantom token_usage event for this synthetic call.
    (binding [semantic.embedding/*bypass-circuit-breaker* true]
      (semantic.embedding/get-embedding (semantic.embedding/get-configured-model)
                                        "health check"
                                        {:type :query :record-tokens? false :snowplow? false}))
    {:reachable? true :error nil}
    (catch Throwable e
      (log/debug e "Embedding service health probe failed")
      {:reachable? false :error (ex-message e)})))

(def embedding-service-reachable?
  "Probe the embedding service by embedding a trivial string; returns `{:reachable? <bool> :error <msg>}`.
  TTL-memoized so the two health checks share one probe per report run, and a flapping breaker (which
  re-runs the checks on every state change) can't drive a probe storm."
  (memoize/ttl probe-embedding-service :ttl/threshold (* 10 1000)))

(defn embedding-problem
  "Human-readable embedding-service problem, or nil when it looks healthy. Shared by the semantic-search
  check below and the NLQ retrieval check ([[metabase-enterprise.entity-retrieval.health]]).
  The wording deliberately does NOT vary with the breaker's open/half-open state: the state-change hooks
  re-persist the checks on every transition, and only an identical (health, message) pair dedups in
  [[metabase.health-inspector.core/save-check-result!]], so state-dependent wording would let a flapping
  breaker (open <-> half-open each delay window) flood health_inspector_runs for the whole outage."
  []
  ;; Probe even when the circuit is open: on a quiet instance the breaker only leaves :open on a real call,
  ;; so without this a recovered-but-idle embedder would read degraded until traffic.
  (let [{:keys [reachable? error]} (embedding-service-reachable?)]
    (cond
      (not reachable?)
      (str "embedding service unreachable: " error)

      (semantic.embedding/embedder-circuit-open?)
      "embedder circuit open (probe reachable; awaiting half-open trial)")))

(defn- active-index-queryable?
  "Whether a trivial `SELECT ... LIMIT 1` against the active index table succeeds -- i.e. pgvector is
  reachable and the table exists and is queryable."
  [pgvector table-name]
  (try
    (jdbc/execute-one! pgvector [(format "SELECT 1 FROM \"%s\" LIMIT 1" table-name)])
    true
    (catch Throwable _ false)))

(defn index-health-check
  "Health-inspector check for semantic search, registered as `:semantic-search-index`.
  Returns nil when semantic search isn't enabled (so the check is omitted), otherwise a `{:health :message}`
  map: healthy when an active index is present, queryable, un-stalled, and the embedding service is
  reachable; degraded (naming the failing conditions) otherwise."
  []
  ;; Mirror the engine's own gate (semantic-search core/supported?): beyond pgvector + license this respects
  ;; the semantic-search-enabled kill switch, so a disabled instance neither records runs nor probes the
  ;; embedder.
  (when (and (semantic.util/semantic-search-available?)
             (semantic-settings/semantic-search-enabled))
    ;; Datasource acquisition is inside the try: ensure-initialized-data-source! throws on a malformed
    ;; MB_PGVECTOR_DB_URL, and that must read as degraded, not throw out of the check.
    (let [active (try
                   (let [pgvector       (semantic.env/get-pgvector-datasource!)
                         index-metadata (semantic.env/get-index-metadata)]
                     {:pgvector pgvector
                      :state    (semantic.index-metadata/get-active-index-state pgvector index-metadata)})
                   (catch Throwable e {:error e}))]
      (cond
        (:error active)
        (degraded (str "pgvector store unreachable: " (ex-message (:error active)) "."))

        (nil? (:state active))
        (degraded "No active semantic search index.")

        :else
        (let [{:keys [pgvector state]} active
              table-name       (-> state :index :table-name)
              stalled-at       (-> state :metadata-row :indexer_stalled_at)
              embedder-problem (embedding-problem)
              problems         (cond-> []
                                 (not (active-index-queryable? pgvector table-name))
                                 (conj "active index table not queryable")

                                 (some? stalled-at)
                                 (conj (str "indexer stalled since " stalled-at))

                                 embedder-problem
                                 (conj embedder-problem))]
          (if (seq problems)
            (degraded (str "Semantic search degraded: " (str/join "; " problems) "."))
            (healthy "Semantic search index active, fresh, and serving.")))))))

(health-inspector/register-check! :semantic-search-index index-health-check)

;; Re-persist the check the moment the breaker changes state, so an outage or its recovery shows up within
;; minutes instead of at the next daily report. The probe cache is cleared first: the transition is fresher
;; evidence than a probe from up to 10s ago -- on :closed (two real trial successes) a cached failure would
;; otherwise persist a false "unreachable" row that nothing revisits until the daily report. Clearing here
;; also covers the NLQ hook: this hook registers first (the NLQ health namespace requires this one), so
;; every embedder-dependent check re-runs against a fresh probe.
(swap! semantic.embedding/embedder-circuit-state-change-hooks conj
       (fn [_state]
         (memoize/memo-clear! embedding-service-reachable?)
         (health-inspector/run-and-save-check! :semantic-search-index)))

;;; ------------------------------------------- AI index metrics --------------------------------------------
;;;
;;; Coverage / garbage / staleness for the AI-search indexes, each computed once per engine and fed to BOTH a
;;; labelled Prometheus gauge (engine = "semantic" | "nlq") and a health-inspector row. The gauge, threshold,
;;; and message shaping live here so each engine supplies only raw collectors; the NLQ engine
;;; ([[metabase-enterprise.entity-retrieval.health]]) registers through the same entry point.

(def ^:private measure->gauge
  {:coverage  :metabase-ai-index/coverage-ratio
   :garbage   :metabase-ai-index/garbage-count
   :staleness :metabase-ai-index/staleness-seconds})

(defn- pct [ratio] (Math/round (* 100.0 (double ratio))))

(defn- threshold-health
  "Map an absolute `value` to 0-100 health against a `warn`/`crit` band: 100 at/under warn, 0 at/over crit,
  linear between. Shared by the garbage-count and staleness-age measures."
  [value warn crit]
  (cond
    (<= value warn) 100
    (>= value crit) 0
    :else           (Math/round (* 100.0 (/ (double (- crit value)) (- crit warn))))))

(defn coverage-result
  "Uniform `{:value :health :message}` for a coverage measure over `indexed`/`expected` item counts.
  Health is the coverage percentage; the ratio (0-1) feeds the Prometheus gauge."
  [indexed expected]
  (let [ratio (if (pos? expected) (min 1.0 (/ (double indexed) expected)) 1.0)]
    {:value   ratio
     :health  (pct ratio)
     :message (format "%d of %d expected items indexed (%d%%)." indexed expected (pct ratio))}))

(defn garbage-result
  "Uniform result for a garbage measure. `orphans` is the ABSOLUTE number of indexed items that should not be
  (an absolute count, not a fraction of the index -- a raw orphan count is what's actionable). Health
  thresholds on the count via `warn`/`crit`; the count itself feeds the Prometheus gauge."
  [orphans warn crit]
  {:value   orphans
   :health  (threshold-health orphans warn crit)
   :message (if (zero? orphans)
              "No orphaned items in the index."
              (format "%d orphaned item(s) in the index." orphans))})

(defn- describe-age [seconds]
  (let [s (long seconds)]
    (cond
      (>= s 3600) (format "%.1fh" (/ s 3600.0))
      (>= s 60)   (format "%dm" (quot s 60))
      :else       (format "%ds" s))))

(defn staleness-result
  "Uniform result for a staleness measure. `age-seconds` is the age of the oldest pending change (0/nil =
  current). `warn`/`crit` (seconds) bound the health scale: 100 at/under warn, 0 at/over crit, linear between.
  `detail` optionally appends a clause (e.g. a backlog size or a detection-bound caveat)."
  [age-seconds warn crit detail]
  (let [age  (long (or age-seconds 0))
        base (if (zero? age)
               "Index current."
               (format "Oldest pending change is %s old." (describe-age age)))]
    {:value   age
     :health  (threshold-health age warn crit)
     :message (if detail (str base " " detail) base)}))

(defonce ^:private index-measures
  ;; descriptors for refresh-ai-index-metrics!, populated by register-index-check! at load time
  (atom []))

(defonce ^:private live-gauge-series
  ;; [gauge-key engine] pairs that have emitted a real value in this process. NaN-clearing is restricted to
  ;; these: NaN-ing an unemitted series would CREATE it, growing engine-labelled NaN series on instances
  ;; where the feature was never on (e.g. pgvector configured but unlicensed -- the collector job still runs
  ;; there, with every measure N/A).
  (atom #{}))

(defn- set-index-gauge!
  "Write `value` to `engine`'s labelled series of `gauge-key`; nil clears it with NaN so a previously-emitted
  series doesn't keep exposing a stale healthy value after its feature turns off or its collector starts
  failing (PromQL treats NaN as no-data, so it won't false-alert). A never-emitted series is left uncreated
  (see [[live-gauge-series]])."
  [gauge-key engine value]
  (if (some? value)
    (do (analytics/set-gauge! gauge-key {:engine (name engine)} value)
        ;; marked live only after the write succeeds: a throwing first write must not license later N/A
        ;; clears to CREATE the series as NaN-only
        (swap! live-gauge-series conj [gauge-key engine]))
    (when (contains? @live-gauge-series [gauge-key engine])
      (analytics/set-gauge! gauge-key {:engine (name engine)} ##NaN))))

(defn- run-measure!
  "Run one measure's collector and write its labelled Prometheus gauge (Prometheus is independent of the
  inspector setting); an N/A collector (nil) clears the gauge instead of leaving a stale value standing.
  Returns the `{:health :message}` result, or nil when N/A (so the health row is omitted)."
  [{:keys [gauge-key engine collect]}]
  (let [{:keys [value health message]} (collect)]
    (set-index-gauge! gauge-key engine value)
    (when health {:health health :message message})))

(defn register-index-check!
  "Register an AI-index measure. `engine` is :semantic | :nlq, `measure` is :coverage | :garbage | :staleness,
  and `collect` is a 0-arg fn returning nil (N/A) or a `{:value :health :message}` map (see
  [[coverage-result]] et al.). Registers a health-inspector check `<engine>-<measure>` and records the
  measure so its Prometheus gauge is refreshed alongside. Returns the measure descriptor."
  [engine measure collect]
  (let [descriptor {:check-name (keyword (str (name engine) "-" (name measure)))
                    :gauge-key  (measure->gauge measure)
                    :engine     engine
                    :measure    measure
                    :collect    collect}]
    (health-inspector/register-check! (:check-name descriptor) #(run-measure! descriptor))
    (swap! index-measures conj descriptor)
    descriptor))

(defn- refresh-measure!
  "Refresh one measure: run its collector (writing the gauge) and, when the inspector is enabled, persist the
  (deduplicated) health row. Never throws, and each failure mode is contained: a throwing collector clears
  its gauge -- run-measure! writes the gauge only after a successful collect, so the series would otherwise
  freeze at its last (healthy) value for as long as the collector keeps failing -- and a failed appdb persist
  can't undo the gauge write or affect other measures."
  [{:keys [check-name gauge-key engine] :as descriptor}]
  (try
    (let [result (try
                   (run-measure! descriptor)
                   (catch Throwable e
                     (log/error e "AI index metric refresh errored" {:check check-name})
                     (set-index-gauge! gauge-key engine nil)
                     nil))]
      (when (and result (health-inspector/enabled?))
        (health-inspector/save-check-result! check-name result)))
    (catch Throwable e
      (log/error e "AI index health-row persist errored" {:check check-name}))))

(defn refresh-ai-index-metrics!
  "Recompute every registered AI-index measure once: set its Prometheus gauge, and -- when the health
  inspector is enabled -- persist the (deduplicated) health row. A measure whose feature is off is a cheap
  no-op (its collector returns nil). Measures are isolated: one failing can't freeze or skip the others.
  Driven by the periodic task so gauges stay fresh between daily reports."
  []
  (run! refresh-measure! @index-measures))

;;; ------------------------------------- semantic-search collectors ----------------------------------------

(def ^:private staleness-warn-seconds     (* 60 60))       ; 1h -- indexer backlog under an hour reads healthy
(def ^:private staleness-critical-seconds (* 6 60 60))     ; 6h -- a backlog this old = the indexer is stuck
;; Absolute orphan counts. Repair clears garbage hourly, so a handful of in-flight orphans is normal; a large
;; count means repair isn't keeping up. Tunable (promotable to settings alongside the staleness thresholds).
(def ^:private garbage-warn-count     50)
(def ^:private garbage-critical-count 5000)

(defn- active-index*
  "Return `{:pgvector :state}` for the active semantic index, or nil when semantic search is unavailable/
  disabled, there's no active index, or pgvector is unreachable. Never throws -- availability is the
  `:semantic-search-index` check's job; the metrics just skip when there's nothing to measure."
  []
  (when (and (semantic.util/semantic-search-available?)
             (semantic-settings/semantic-search-enabled))
    (try
      (let [pgvector (semantic.env/get-pgvector-datasource!)
            state    (semantic.index-metadata/get-active-index-state pgvector (semantic.env/get-index-metadata))]
        (when state {:pgvector pgvector :state state}))
      (catch Throwable e
        (log/debug e "semantic active-index lookup failed for a metric collector")
        nil))))

(def ^:private active-index
  "TTL-memoized [[active-index*]] so the semantic coverage + staleness collectors (and the repair reporter)
  share one get-active-index-state per refresh cycle instead of each issuing their own pgvector round-trip."
  (memoize/ttl active-index* :ttl/threshold (* 30 1000)))

(defn- scalar-row [pgvector sql]
  (jdbc/execute-one! pgvector sql {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- row-count [pgvector sql] (or (:n (scalar-row pgvector sql)) 0))

(defn- semantic-coverage []
  (when-let [{:keys [pgvector state]} (active-index)]
    (let [table    (-> state :index :table-name)
          gate     (:gate-table-name (semantic.env/get-index-metadata))
          ;; Numerator: index rows that are *expected* -- present in the live gate. Counting raw index rows
          ;; instead would let orphans (garbage) inflate the numerator and mask missing docs (M missing + G>=M
          ;; orphans reads 100%); coverage must measure the should-be-indexed set only. Garbage is its own
          ;; measure. Same (model,model_id) grain on both sides.
          indexed  (row-count pgvector
                              [(format (str "SELECT count(*) AS n FROM \"%s\" i "
                                            "WHERE EXISTS (SELECT 1 FROM \"%s\" g "
                                            "WHERE g.model = i.model AND g.model_id = i.model_id "
                                            "AND g.document_hash IS NOT NULL)")
                                       table gate)])
          ;; Denominator: distinct live gate rows (one per should-be-indexed doc; tombstones excluded). That's
          ;; the indexer's own deduped candidate set, sharing the index's (model,model_id) grain -- unlike
          ;; search.ingestion/search-items-count, whose per-spec COUNT(*) double-counts join fan-out (a card
          ;; with several revisions, etc.) and so never reaches 100% on a fully-indexed instance.
          expected (row-count pgvector [(format "SELECT count(*) AS n FROM \"%s\" WHERE document_hash IS NOT NULL" gate)])]
      (coverage-result indexed expected))))

(defn- semantic-staleness []
  (when-let [{:keys [pgvector state]} (active-index)]
    (let [gate      (:gate-table-name (semantic.env/get-index-metadata))
          watermark (-> state :metadata-row :indexer_last_seen)
          ;; Oldest gate change past the indexer watermark. Content-hash-based: the gate suppresses no-op
          ;; updated_at bumps, so this is real pending work, not spurious timestamp drift. Age is computed on
          ;; the pgvector clock to match gated_at (set via clock_timestamp).
          row       (scalar-row pgvector
                                [(format "SELECT count(*) AS pending,
                                                 EXTRACT(EPOCH FROM (now() - min(gated_at))) AS age
                                          FROM \"%s\"
                                          WHERE gated_at > COALESCE(?, '-infinity'::timestamptz)" gate)
                                 watermark])
          pending   (or (:pending row) 0)
          detail    (when (pos? pending) (format "%d change(s) in the indexer backlog." pending))]
      (staleness-result (:age row) staleness-warn-seconds staleness-critical-seconds detail))))

(defonce ^:private last-repair-orphans
  ;; Latest stale-orphan count pushed by the hourly repair job ([[report-repair-orphans!]]); nil until the
  ;; first repair of the process, or when the last count query failed (no reading beats a bogus one).
  (atom nil))

(defn- semantic-garbage
  ;; Serves the repair job's pushed count through the same measure machinery as the pull collectors, so
  ;; gauge clearing (feature off, count failed) and health-row persistence need no parallel push-only path.
  ;; Gated on active-index (available? + the semantic-search-enabled kill switch + an actual active index):
  ;; the repair job only checks semantic-search-available?, which ignores the kill switch, so serving the
  ;; last pushed count with the feature disabled would keep a dead instance's garbage reading alive.
  []
  (when (active-index)
    (when-let [orphans @last-repair-orphans]
      (garbage-result orphans garbage-warn-count garbage-critical-count))))

(register-index-check! :semantic :coverage  semantic-coverage)
(register-index-check! :semantic :staleness semantic-staleness)

(def ^:private semantic-garbage-measure
  "The :semantic :garbage descriptor, held so [[report-repair-orphans!]] can refresh it the moment a repair
  pushes a new count instead of waiting for the next collector cycle."
  (register-index-check! :semantic :garbage semantic-garbage))

(defn report-repair-orphans!
  "Feed the semantic-search garbage measure from the hourly repair job's stale-orphan count. Repair already
  computes the orphan set as part of its normal work, so this is a push -- far cheaper than the standalone
  anti-join a from-scratch pull collector would need, and correct for compound-id models. `orphans` is an
  absolute count, or nil when the count query failed (the measure then reads N/A and its gauge clears rather
  than leaving a stale count standing -- gauges never age out while the process is scraped).
  Never throws: this is a metric side-channel of the repair job (which gates on semantic-search-available?),
  so a blip here must not make a successful repair look failed."
  [orphans]
  (try
    (reset! last-repair-orphans orphans)
    (refresh-measure! semantic-garbage-measure)
    (catch Throwable e
      (log/warn e "Failed to report semantic garbage metric"))))
