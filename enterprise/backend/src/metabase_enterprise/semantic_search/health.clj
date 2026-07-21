(ns metabase-enterprise.semantic-search.health
  "Health-inspector checks and index metrics for semantic search.

  Semantic search degrades silently -- a missing index, stalled indexer, or unreachable embedder just falls
  back to appdb search, unnoticed. This check surfaces that.

  :health can take the following values:
  - nil = not enabled (check omitted)
  -   0 = enabled but degraded (`:message` names the cause)
  - 100 = serving"
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [metabase-enterprise.ai-index-health.core :as ai-index-health]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.embedding-health :as embedding-health]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(defn- active-index-queryable?
  "Whether a trivial `SELECT ... LIMIT 1` against the active index table succeeds -- i.e. pgvector is
  reachable and the table exists and is queryable."
  [pgvector table-name]
  (try
    (jdbc/execute-one! pgvector [(format "SELECT 1 FROM %s LIMIT 1" (semantic.util/quote-table table-name))])
    true
    (catch Throwable _ false)))

(defn index-health-check
  "Health-inspector check for semantic search, registered as `:semantic-search-index`.
  Returns nil when the semantic engine isn't active on this instance (so the check is omitted), otherwise a
  `{:health :message}` map: healthy when an active index is present, queryable, un-stalled, and the
  embedding service is reachable; degraded (naming the failing conditions) otherwise."
  []
  ;; Active, not merely available: an available-but-inactive engine (another engine selected) has no index
  ;; by design, and must not read as a standing "No active semantic search index" incident. Active folds in
  ;; the license and kill switch, so a disabled instance neither records runs nor probes the embedder.
  (when (semantic.util/semantic-search-active?)
    ;; Acquire the datasource inside the try, so a malformed MB_PGVECTOR_DB_URL reads as degraded instead of
    ;; throwing out of the check.
    (let [active (try
                   (let [pgvector       (semantic.env/get-pgvector-datasource!)
                         index-metadata (semantic.env/get-index-metadata)]
                     {:pgvector pgvector
                      :state    (semantic.index-metadata/get-active-index-state pgvector index-metadata)})
                   (catch Throwable e {:error e}))]
      (cond
        (:error active)
        (ai-index-health/degraded (str "pgvector store unreachable: " (ex-message (:error active)) "."))

        (nil? (:state active))
        (ai-index-health/degraded "No active semantic search index.")

        :else
        (let [{:keys [pgvector state]} active
              table-name       (-> state :index :table-name)
              stalled-at       (-> state :metadata-row :indexer_stalled_at)
              embedder-problem (embedding-health/embedding-problem)
              problems         (cond-> []
                                 (not (active-index-queryable? pgvector table-name))
                                 (conj "active index table not queryable")

                                 (some? stalled-at)
                                 (conj (str "indexer stalled since " stalled-at))

                                 embedder-problem
                                 (conj embedder-problem))]
          (if (seq problems)
            (ai-index-health/degraded (str "Semantic search degraded: " (str/join "; " problems) "."))
            (ai-index-health/healthy "Semantic search index active and serving.")))))))

(health-inspector/register-check! :semantic-search-index index-health-check)

(defn- persist-index-check-on-breaker-change!
  "Re-run and persist the semantic-search index check."
  [_state]
  (health-inspector/run-and-save-check! :semantic-search-index))

(swap! semantic.embedding/embedder-circuit-state-change-hooks conj #'persist-index-check-on-breaker-change!)

;;; ------------------------------------- semantic-search collectors ----------------------------------------

(def ^:private staleness-warn-seconds     (* 60 60))       ; 1h -- indexer backlog under an hour reads healthy
(def ^:private staleness-critical-seconds (* 6 60 60))     ; 6h -- a backlog this old = the indexer is stuck
;; Absolute orphan counts. Repair clears garbage hourly, so a handful of in-flight orphans is normal; a large
;; count means repair isn't keeping up. Tunable (promotable to settings alongside the staleness thresholds).
(def ^:private garbage-warn-count     50)
(def ^:private garbage-critical-count 5000)

(defn- active-index*
  "The active semantic index and pgvector datasource, or nil when there is nothing applicable to measure."
  []
  (when (semantic.util/semantic-search-active?)
    (try
      (let [pgvector (semantic.env/get-pgvector-datasource!)
            state    (semantic.index-metadata/get-active-index-state pgvector (semantic.env/get-index-metadata))]
        (when state {:pgvector pgvector, :state state}))
      (catch Throwable e
        (log/debug e "semantic active-index lookup failed for a metric collector")
        nil))))

(def ^:private active-index
  "Cached [[active-index*]] so we can share the calculation between the coverage + staleness collectors, and
  the repair reporter."
  (memoize/ttl active-index* :ttl/threshold (* 30 1000)))

(defn- scalar-row [pgvector sql]
  (jdbc/execute-one! pgvector sql {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- row-count [pgvector sql] (or (:n (scalar-row pgvector sql)) 0))

(defn- semantic-coverage []
  (when-let [{:keys [pgvector state]} (active-index)]
    (let [table    (semantic.util/quote-table (-> state :index :table-name))
          gate     (semantic.util/quote-table (:gate-table-name (semantic.env/get-index-metadata)))
          ;; Numerator: index rows that are *expected* -- present in the live gate. Counting raw index rows
          ;; instead would let orphans (garbage) inflate the numerator and mask missing docs (M missing + G>=M
          ;; orphans reads 100%); coverage must measure the should-be-indexed set only. Garbage is its own
          ;; measure. Same (model,model_id) grain on both sides.
          indexed  (row-count pgvector
                              [(format (str "SELECT count(*) AS n FROM %s i "
                                            "WHERE EXISTS (SELECT 1 FROM %s g "
                                            "WHERE g.model = i.model AND g.model_id = i.model_id "
                                            "AND g.document_hash IS NOT NULL)")
                                       table gate)])
          ;; Denominator: distinct live gate rows (one per should-be-indexed doc; tombstones excluded). That's
          ;; the indexer's own deduped candidate set, sharing the index's (model,model_id) grain -- unlike
          ;; search.ingestion/search-items-count, whose per-spec COUNT(*) double-counts join fan-out (a card
          ;; with several revisions, etc.) and so never reaches 100% on a fully-indexed instance.
          expected (row-count pgvector [(format "SELECT count(*) AS n FROM %s WHERE document_hash IS NOT NULL" gate)])]
      (ai-index-health/coverage-result indexed expected))))

(defn- semantic-staleness []
  (when-let [{:keys [pgvector state]} (active-index)]
    (let [gate    (semantic.util/quote-table (:gate-table-name (semantic.env/get-index-metadata)))
          {:keys [indexer_last_seen indexer_last_seen_id]} (:metadata-row state)
          ;; Oldest gate change past the indexer watermark. Content-hash-based: the gate suppresses no-op
          ;; updated_at bumps, so this is real pending work, not spurious timestamp drift. Age is computed on
          ;; the pgvector clock to match gated_at (set via clock_timestamp).
          ;; Composite (gated_at, id) comparison, matching the gate poll's consumption order -- a
          ;; timestamp-only bound would hide pending rows that share the watermark timestamp. A nil watermark
          ;; (indexer never ran) reads everything as pending; a nil id treats same-timestamp rows as pending
          ;; ('' sorts before every real gate id).
          row     (scalar-row pgvector
                              [(format "SELECT count(*) AS pending,
                                               EXTRACT(EPOCH FROM (now() - min(gated_at))) AS age
                                        FROM %s
                                        WHERE (gated_at, id) > (COALESCE(?, '-infinity'::timestamptz), COALESCE(?, ''))"
                                       gate)
                               indexer_last_seen indexer_last_seen_id])
          pending (or (:pending row) 0)
          detail  (when (pos? pending) (format "%d change(s) in the indexer backlog." pending))]
      (ai-index-health/staleness-result
       (:age row) staleness-warn-seconds staleness-critical-seconds detail))))

(defonce ^:private last-repair-orphans
  ;; Latest stale-orphan count pushed by the hourly repair job ([[report-repair-orphans!]]); nil until the
  ;; first repair of the process, or when the last count query failed (no reading beats a bogus one).
  (atom nil))

(defn- semantic-garbage
  ;; Serves the repair job's pushed count through the same measure machinery as the pull collectors, so gauge
  ;; clearing and health-row persistence need no separate push-only path. Gated on active-index (available? +
  ;; an active index) because last-repair-orphans lingers from the last push -- without the gate a
  ;; since-disabled instance would keep serving a stale garbage reading.
  []
  (when (active-index)
    (when-let [orphans @last-repair-orphans]
      (ai-index-health/garbage-result orphans garbage-warn-count garbage-critical-count))))

(ai-index-health/register-index-check! :semantic :coverage  semantic-coverage)
(ai-index-health/register-index-check! :semantic :staleness semantic-staleness)

(def ^:private semantic-garbage-measure
  "The :semantic :garbage descriptor, held so [[report-repair-orphans!]] can refresh it the moment a repair
  pushes a new count instead of waiting for the next collector cycle."
  (ai-index-health/register-index-check! :semantic :garbage semantic-garbage))

(defn report-repair-orphans!
  "Feed the semantic-search garbage measure from the hourly repair job's stale-orphan count. Repair already
  computes the orphan set as part of its normal work, so this is a push -- far cheaper than the standalone
  anti-join a from-scratch pull collector would need, and correct for compound-id models. `orphans` is an
  absolute count, or nil when the count query failed (the measure then reads N/A and its gauge clears rather
  than leaving a stale count standing -- gauges never age out while the process is scraped).
  Never throws: this is a metric side-channel of the active-engine repair job, so a reporting failure must
  not make a successful repair look failed."
  [orphans]
  (try
    (reset! last-repair-orphans orphans)
    (ai-index-health/refresh-index-check! semantic-garbage-measure)
    (catch Exception e
      (log/warn e "Failed to report semantic garbage metric"))))
