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
   [clojure.set :as set]
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase.entity-retrieval.core :as er]
   [metabase.health-inspector.core :as health-inspector]
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
  (let [{:keys [pgvector? licensed? index-compatible? populated?]} (entity-retrieval/retrieval-status)]
    (cond
      (not (and pgvector? licensed?))
      nil ;; not enabled — nothing to check (omitted rather than reported as healthy)

      (not index-compatible?)
      (degraded (str "NLQ curated index not built for the current embedding model (rebuild pending) — "
                     "agent on general-search fallback."))

      (not populated?)
      (degraded "NLQ curated index empty (first reconcile pending) — agent on general-search fallback.")

      :else
      ;; Probe even when the circuit is open, so a recovered-but-idle embedder isn't reported degraded
      ;; forever (the breaker only leaves :open on a real call).
      (let [circuit-open?              (semantic.embedding/embedder-circuit-open?)
            {:keys [reachable? error]} (semantic.health/embedding-service-reachable?)]
        (cond
          (and circuit-open? (not reachable?))
          (degraded "Embedding service unreachable; circuit open — NLQ curated retrieval unavailable.")

          circuit-open?
          (degraded (str "Embedder circuit open (probe reachable; awaiting half-open trial) — "
                         "NLQ curated retrieval unavailable."))

          (not reachable?)
          (degraded (str "Embedding service unreachable: " error " — NLQ curated retrieval unavailable."))

          :else
          (healthy "NLQ curated retrieval available and serving."))))))

(health-inspector/register-check! :nlq-retrieval nlq-retrieval-health-check)

;;; ------------------------------------------- AI index metrics --------------------------------------------
;;;
;;; Coverage / garbage / staleness for the library entity index, at the distinct-entity grain (rows are per
;;; (entity, doc)). Both sides are normalised through entity-class so a metric<->model relabel doesn't read as
;;; both missing and garbage. Registered through the shared framework in semantic-search.health, which owns the
;;; threshold/message/gauge shaping.

(def ^:private staleness-warn-seconds     (* 30 60))   ; 30m -- full reconcile runs every 15m; 30m = a missed cycle
(def ^:private staleness-critical-seconds (* 60 60))   ; 60m -- reconcile clearly stalled

(defn- library-datasource
  "pgvector datasource when NLQ library retrieval is licensed, configured, and the index is built for the
  current model; else nil (the metric skips -- availability is the `:nlq-retrieval` check's job). An
  empty-but-compatible index is still measured (coverage reads 0%), so this gates on compatibility, not
  population."
  []
  (let [{:keys [pgvector? licensed? index-compatible?]} (entity-retrieval/retrieval-status)]
    (when (and pgvector? licensed? index-compatible?)
      (try (semantic.datasource/ensure-initialized-data-source!)
           (catch Throwable _ nil)))))

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

(defn- nlq-coverage []
  (when-let [ds (library-datasource)]
    (let [library (entity-class-set (reconcile/library-entity-keys))
          indexed (indexed-entity-classes ds)]
      (semantic.health/coverage-result (count (set/intersection library indexed)) (count library)))))

(defn- nlq-garbage []
  (when-let [ds (library-datasource)]
    (let [library (entity-class-set (reconcile/library-entity-keys))
          indexed (indexed-entity-classes ds)]
      (semantic.health/garbage-result (count (set/difference indexed library)) (count indexed)))))

(defn- nlq-staleness []
  (when-let [ds (library-datasource)]
    ;; Reconcile-lag: seconds since the last full reconcile verified the index against the appdb. There's no
    ;; per-change gate here (unlike semantic search), so "time since known-fresh" is the honest bound on the
    ;; undetected membership/name drift that the osi_ai_context write hooks don't catch.
    (let [row (jdbc/execute-one! ds
                                 [(format "SELECT EXTRACT(EPOCH FROM (now() - updated_at)) AS age FROM \"%s\" WHERE id = 1"
                                          index-table/*meta-table*)]
                                 {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
      (semantic.health/staleness-result (:age row) staleness-warn-seconds staleness-critical-seconds
                                        "Membership/name changes not hooked are caught by the ~15m full reconcile."))))

(semantic.health/register-index-check! :nlq :coverage  nlq-coverage)
(semantic.health/register-index-check! :nlq :garbage   nlq-garbage)
(semantic.health/register-index-check! :nlq :staleness nlq-staleness)
