(ns metabase-enterprise.entity-retrieval.health
  "Health-inspector check for NLQ (natural-language-query) curated retrieval.

  The `:nlq` Metabot profile normally discovers data through the curated `retrieve_library_entities` tool,
  but when the library index can't serve, `get-profile` silently swaps in the `:nlq-fallback` profile
  (general keyword/fulltext search) -- answers keep coming, so the degradation is invisible; this check
  makes it visible.
  Health is status-style: 100 = curated tool serving, 0 = enabled but on the fallback (the `:message`
  names why).
  A not-enabled instance returns nil, so the check is omitted rather than reported as a misleading 100.

  Reuses the embedding-service probe and circuit-breaker state from
  [[metabase-enterprise.semantic-search.health]] / [[metabase-enterprise.semantic-search.embedding]]."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase.entity-retrieval.core :as er]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.util :as u]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(defn- healthy [message] {:health 100 :message message})
(defn- degraded [message] {:health 0 :message message})

(defn nlq-retrieval-health-check
  "Health-inspector check for NLQ curated retrieval, registered as `:nlq-retrieval`.
  Returns nil when the feature isn't enabled (so the check is omitted), otherwise a `{:health :message}`
  map: healthy when the curated index can serve queries and the embedding service is reachable; degraded
  (naming the cause) whenever the agent would silently fall back to general search."
  []
  (let [{:keys [pgvector? licensed? embedder-configured? index-compatible? populated? probe-error]}
        (entity-retrieval/retrieval-status)]
    (cond
      (not (and pgvector? licensed? embedder-configured?))
      nil ;; not enabled — nothing to check (omitted rather than reported as healthy)

      ;; A thrown probe is a pgvector-connectivity fault, not a model mismatch: report it as such rather than
      ;; misdirecting the operator to a rebuild (mirrors the semantic-search check's "pgvector unreachable").
      probe-error
      (degraded (str "pgvector store unreachable: " probe-error " — NLQ curated retrieval unavailable."))

      (not index-compatible?)
      (degraded (str "NLQ curated index not built for the current embedding model (rebuild pending) — "
                     "agent on general-search fallback."))

      (not populated?)
      (degraded "NLQ curated index empty (first reconcile pending) — agent on general-search fallback.")

      :else
      (if-let [problem (semantic.health/embedding-problem)]
        (degraded (str (u/capitalize-first-char problem) " — NLQ curated retrieval unavailable."))
        (healthy "NLQ curated retrieval available and serving.")))))

(health-inspector/register-check! :nlq-retrieval nlq-retrieval-health-check)

;; Re-persist the check the moment the embedder breaker changes state, so an outage or its recovery shows
;; up within minutes instead of at the next daily report. The shared probe cache is cleared by the
;; semantic-search hook, which registers (and so runs) before this one -- this namespace requires that one.
(swap! semantic.embedding/embedder-circuit-state-change-hooks conj
       (fn [_state] (health-inspector/run-and-save-check! :nlq-retrieval)))

;;; ------------------------------------------- AI index metrics --------------------------------------------
;;;
;;; Coverage / garbage / staleness for the library entity index, at the distinct-entity grain (rows are per
;;; (entity, doc)). Both sides are normalised through entity-class so a metric<->model relabel doesn't read
;;; as both missing and garbage. Registered through the shared framework in semantic-search.health, which
;;; owns the threshold/message/gauge shaping.

(def ^:private staleness-warn-seconds     (* 30 60))   ; 30m -- one missed ~15m full-reconcile cycle
(def ^:private staleness-critical-seconds (* 60 60))   ; 60m -- reconcile clearly stalled
;; Absolute orphan counts. The curated library is a bounded, small tier, so tolerances are much lower than
;; semantic search; reconcile GCs orphans every ~15m. Tunable (promotable to settings).
(def ^:private garbage-warn-count     5)
(def ^:private garbage-critical-count 100)

(defn- library-datasource*
  "pgvector datasource when NLQ library retrieval is licensed, configured (pgvector + embedder), and the
  index is built for the current model; else nil (the metric skips -- availability is the `:nlq-retrieval`
  check's job). An empty-but-compatible index is still measured (coverage reads 0%), so this gates on
  compatibility, not population -- and passes `probe-populated? false` so it doesn't run the population
  query it would discard."
  []
  (let [{:keys [pgvector? licensed? embedder-configured? index-compatible?]}
        (entity-retrieval/retrieval-status false)]
    (when (and pgvector? licensed? embedder-configured? index-compatible?)
      (try (semantic.datasource/ensure-initialized-data-source!)
           (catch Throwable _ nil)))))

(def ^:private library-datasource
  "TTL-memoized so coverage, garbage, and staleness share one retrieval-status probe + datasource resolve per
  refresh cycle rather than each re-running it (staleness previously called this on its own path)."
  (memoize/ttl library-datasource* :ttl/threshold (* 30 1000)))

(defn- entity-class-set
  "Set of entity classes for `pairs` of `[entity_type entity_local_id]`, normalised so a relabelled entity
  collapses to one class on both the library and index sides."
  [pairs]
  (into #{} (map (fn [[t id]] (er/entity-class t id))) pairs))

(defn- indexed-entity-classes [ds]
  (entity-class-set
   (map (juxt :entity_type :entity_local_id)
        (jdbc/execute! ds
                       [(format "SELECT DISTINCT entity_type, entity_local_id FROM \"%s\"" index-table/*vectors-table*)]
                       {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- library-and-indexed-classes*
  "The `{:library <classes> :indexed <classes>}` sets coverage and garbage both need, or nil when N/A."
  []
  (when-let [ds (library-datasource)]
    {:library (entity-class-set (reconcile/library-entity-keys))
     :indexed (indexed-entity-classes ds)}))

(def ^:private library-and-indexed-classes
  "TTL-memoized so coverage and garbage share one library scan + DISTINCT index scan per refresh cycle rather
  than each recomputing the identical two sets."
  (memoize/ttl library-and-indexed-classes* :ttl/threshold (* 30 1000)))

(defn- nlq-coverage []
  (when-let [{:keys [library indexed]} (library-and-indexed-classes)]
    (semantic.health/coverage-result (count (set/intersection library indexed)) (count library))))

(defn- nlq-garbage []
  (when-let [{:keys [library indexed]} (library-and-indexed-classes)]
    (semantic.health/garbage-result (count (set/difference indexed library))
                                    garbage-warn-count garbage-critical-count)))

(defn- nlq-staleness []
  (when-let [ds (library-datasource)]
    ;; Reconcile-lag: seconds since the last full reconcile verified the index against the appdb. There's no
    ;; per-change gate here (unlike semantic search), so "time since known-fresh" is the honest bound on the
    ;; undetected membership/name drift that the osi_ai_context write hooks don't catch. reconciled_at is null
    ;; until the first reconcile after a (re)build, so an empty rebuilt index reads N/A (omitted) rather than
    ;; falsely fresh -- coverage carries the "index empty" signal in that window.
    (let [{:keys [age]} (jdbc/execute-one! ds
                                           [(format "SELECT EXTRACT(EPOCH FROM (now() - reconciled_at)) AS age FROM \"%s\" WHERE id = 1"
                                                    index-table/*meta-table*)]
                                           {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
      (when age
        (semantic.health/staleness-result
         age staleness-warn-seconds staleness-critical-seconds
         "Membership/name changes not hooked are caught by the ~15m full reconcile.")))))

(semantic.health/register-index-check! :nlq :coverage  nlq-coverage)
(semantic.health/register-index-check! :nlq :garbage   nlq-garbage)
(semantic.health/register-index-check! :nlq :staleness nlq-staleness)
