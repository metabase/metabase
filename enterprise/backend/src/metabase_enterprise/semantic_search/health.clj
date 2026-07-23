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
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.embedding-health :as embedding-health]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.search.config :as search.config]
   [metabase.search.index-health :as search.index-health]
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
    (catch InterruptedException e
      (throw e))
    (catch Exception _ false)))

(defn- required-hnsw-index-present?
  "Whether the active index satisfies the configured default vector strategy."
  [pgvector index]
  (try
    (or (not (contains? search.config/hnsw-index-backed-strategies
                        (semantic.settings/semantic-search-vector-strategy)))
        (semantic.util/index-ready?
         pgvector
         (semantic.index/schema-qualified-index-name index (semantic.index/hnsw-index-name index))))
    (catch InterruptedException e
      (throw e))
    (catch Exception _ false)))

(defn index-health-check
  "Health-inspector check for semantic search, registered as `:semantic-search-index`.
  Returns nil when the semantic engine isn't active on this instance (so the check is omitted), otherwise a
  `{:health :message}` map: healthy when the active index matches the configured model and is queryable,
  un-stalled, strategy-ready, and backed by a reachable embedder; degraded otherwise."
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
                   (catch InterruptedException e
                     (throw e))
                   (catch Exception e
                     {:error e}))]
      (cond
        (:error active)
        (search.index-health/degraded (str "pgvector store unreachable: " (ex-message (:error active)) "."))

        (nil? (:state active))
        (search.index-health/degraded "No active semantic search index.")

        :else
        (let [{:keys [pgvector state]} active
              index            (:index state)
              table-name       (:table-name index)
              stalled-at       (-> state :metadata-row :indexer_stalled_at)
              model-mismatch?  (not= (:embedding-model index) (semantic.env/get-configured-embedding-model))
              embedder-problem (when-not model-mismatch? (embedding-health/embedding-problem))
              problems         (cond-> []
                                 (not (active-index-queryable? pgvector table-name))
                                 (conj "active index table not queryable")

                                 (not (required-hnsw-index-present? pgvector index))
                                 (conj "required HNSW index is missing")

                                 (some? stalled-at)
                                 (conj (str "indexer stalled since " stalled-at))

                                 model-mismatch?
                                 (conj "active index embedding model does not match configured model")

                                 embedder-problem
                                 (conj embedder-problem))]
          (if (seq problems)
            (search.index-health/degraded (str "Semantic search degraded: " (str/join "; " problems) "."))
            (search.index-health/healthy "Semantic search index active and serving.")))))))

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
;; Repair runs hourly. Stop publishing its last snapshot after three missed runs, so an abandoned Quartz
;; owner cannot leave a plausible-looking value behind indefinitely.
(def ^:private repair-snapshot-max-age-seconds (* 3 60 60))

(defn- active-index*
  "The active semantic index and pgvector datasource, or nil when there is nothing applicable to measure."
  []
  (when (semantic.util/semantic-search-active?)
    (try
      (let [pgvector (semantic.env/get-pgvector-datasource!)
            state    (semantic.index-metadata/get-active-index-state pgvector (semantic.env/get-index-metadata))]
        (when (and state
                   (active-index-queryable? pgvector (-> state :index :table-name)))
          {:pgvector pgvector, :state state}))
      (catch InterruptedException e
        (throw e))
      (catch Exception e
        (log/debug e "semantic active-index lookup failed for a metric collector")
        nil))))

(def ^:private active-index
  "Cached [[active-index*]] so collectors and the repair reporter can share the lookup."
  (memoize/ttl active-index* :ttl/threshold (* 30 1000)))

(defn- scalar-row [pgvector sql]
  (jdbc/execute-one! pgvector sql {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- fresh-repair-age?
  [age]
  (and (number? age)
       (<= 0.0 (double age) repair-snapshot-max-age-seconds)))

(defn- repair-snapshot-age
  "Age of `snapshot-at` in seconds, measured exclusively on the pgvector clock."
  [pgvector snapshot-at]
  (:repair_age
   (scalar-row pgvector
               ["SELECT EXTRACT(EPOCH FROM (clock_timestamp() - CAST(? AS timestamptz))) AS repair_age"
                snapshot-at])))

(defn- semantic-coverage []
  (when-let [{:keys [pgvector state]} (active-index)]
    (when-let [snapshot-at (-> state :metadata-row :repair_snapshot_at)]
      (let [table (semantic.util/quote-table (-> state :index :table-name))
            gate  (semantic.util/quote-table (:gate-table-name (semantic.env/get-index-metadata)))
            ;; The repair age and both populations share one pgvector statement snapshot. Tombstones leave
            ;; the expected population immediately; stale index rows remain garbage's responsibility.
            {:keys [indexed expected repair_age]}
            (scalar-row pgvector
                        [(format (str "WITH observed AS (SELECT clock_timestamp() AS at) "
                                      "SELECT count(*) FILTER (WHERE EXISTS "
                                      "(SELECT 1 FROM %s i "
                                      "WHERE i.model = g.model AND i.model_id = g.model_id)) AS indexed, "
                                      "count(*) AS expected, "
                                      "EXTRACT(EPOCH FROM ((SELECT at FROM observed) - "
                                      "CAST(? AS timestamptz))) AS repair_age "
                                      "FROM %s g WHERE g.document_hash IS NOT NULL")
                                 table gate)
                         snapshot-at])]
        (when (fresh-repair-age? repair_age)
          (search.index-health/coverage-result (or indexed 0) (or expected 0)))))))

(defn- semantic-staleness []
  (when-let [{:keys [pgvector state]} (active-index)]
    (let [index-metadata (semantic.env/get-index-metadata)
          gate           (semantic.util/quote-table (:gate-table-name index-metadata))
          {:keys [id indexer_last_seen indexer_last_seen_id]} (:metadata-row state)
          ;; Oldest gate change past the indexer watermark. Content-hash-based: the gate suppresses no-op
          ;; updated_at bumps, so this is real pending work, not spurious timestamp drift. Age is computed on
          ;; the pgvector clock to match gated_at (set via clock_timestamp).
          ;; Composite (gated_at, id) comparison, matching the gate poll's consumption order -- a
          ;; timestamp-only bound would hide pending rows that share the watermark timestamp. A nil watermark
          ;; (indexer never ran) reads everything as pending; a nil id treats same-timestamp rows as pending
          ;; ('' sorts before every real gate id).
          gate-row       (scalar-row pgvector
                                     [(format "WITH observed AS (SELECT clock_timestamp() AS at)
                                               SELECT count(*) AS pending,
                                                      EXTRACT(EPOCH FROM ((SELECT at FROM observed) - min(gated_at))) AS age,
                                                      (SELECT at FROM observed) AS observed_at
                                               FROM %s
                                               WHERE (gated_at, id) > (COALESCE(?, '-infinity'::timestamptz), COALESCE(?, ''))"
                                              gate)
                                      indexer_last_seen indexer_last_seen_id])
          dlq-row        (if (semantic.dlq/dlq-table-exists? pgvector index-metadata id)
                           (let [table (semantic.util/quote-table
                                        (name (semantic.dlq/dlq-table-name-kw index-metadata id)))]
                             (scalar-row pgvector
                                         [(format "SELECT count(*) AS pending,
                                                          EXTRACT(EPOCH FROM (CAST(? AS timestamptz) - min(d.error_gated_at))) AS age
                                                   FROM %s d
                                                   JOIN %s g ON g.id = d.gate_id
                                                                AND g.gated_at = d.error_gated_at"
                                                  table gate)
                                          (:observed_at gate-row)]))
                           {:pending 0, :age nil})
          gate-pending   (or (:pending gate-row) 0)
          dlq-pending    (or (:pending dlq-row) 0)
          ages           (keep :age [gate-row dlq-row])
          age            (when (seq ages) (apply max (map double ages)))
          detail         (cond
                           (and (pos? gate-pending) (pos? dlq-pending))
                           (format "%d change(s) in the indexer backlog; %d failed change(s) awaiting DLQ retry."
                                   gate-pending dlq-pending)

                           (pos? gate-pending)
                           (format "%d change(s) in the indexer backlog." gate-pending)

                           (pos? dlq-pending)
                           (format "%d failed change(s) awaiting DLQ retry." dlq-pending))]
      (if (some #(neg? (double %)) ages)
        (search.index-health/degraded "Index staleness unavailable: database clock precedes a pending change.")
        (search.index-health/staleness-result
         age staleness-warn-seconds staleness-critical-seconds detail)))))

(defn- semantic-garbage
  ;; The repair job writes a time-bounded snapshot to shared index metadata. Every node therefore publishes
  ;; the same value even when Quartz moves the job between nodes.
  []
  (when-let [{:keys [pgvector state]} (active-index)]
    (let [{:keys [repair_orphan_count repair_snapshot_at]} (:metadata-row state)]
      (when (and (some? repair_orphan_count)
                 repair_snapshot_at
                 (fresh-repair-age? (repair-snapshot-age pgvector repair_snapshot_at)))
        (search.index-health/garbage-result
         repair_orphan_count garbage-warn-count garbage-critical-count)))))

(search.index-health/register-index-check! :semantic-search :coverage semantic-coverage)

(search.index-health/register-index-check! :semantic-search :staleness semantic-staleness)

(def ^:private semantic-garbage-measure
  "The semantic-search garbage descriptor. Holding it lets [[report-repair-metrics!]] refresh the metric
  when a repair pushes a new count instead of waiting for the next collector cycle."
  (search.index-health/register-index-check! :semantic-search :garbage semantic-garbage))

(defn- clear-active-index-cache! []
  (memoize/memo-clear! active-index))

(defn- store-repair-metrics!
  [index-id {:keys [orphan-count snapshot-at]}]
  (let [pgvector        (semantic.env/get-pgvector-datasource!)
        index-metadata  (semantic.env/get-index-metadata)
        index-id        (or index-id
                            (-> (semantic.index-metadata/get-active-index-state pgvector index-metadata)
                                :metadata-row
                                :id))
        metadata-table  (-> index-metadata :metadata-table-name semantic.util/quote-table)]
    (when index-id
      (jdbc/execute-one!
       pgvector
       [(format (str "UPDATE %s SET "
                     "repair_orphan_count = ?, "
                     "repair_snapshot_at = ? "
                     "WHERE id = ?")
                metadata-table)
        orphan-count snapshot-at index-id])
      (clear-active-index-cache!))))

(defn report-repair-metrics!
  "Publish the repair job's stale-orphan count through shared index metadata.
  `index-id` pins the snapshot to the index that repair measured; `:snapshot-at` is the time captured before
  reading the canonical document stream. Nil counts invalidate the measure. Reporting failures do not fail
  repair; interruption still propagates."
  ([counts]
   (report-repair-metrics! nil counts))
  ([index-id counts]
   (try
     (store-repair-metrics! index-id counts)
     (search.index-health/refresh-index-check! semantic-garbage-measure)
     (catch InterruptedException e
       (throw e))
     (catch Exception e
       (log/warn e "Failed to report semantic repair metrics")))))
