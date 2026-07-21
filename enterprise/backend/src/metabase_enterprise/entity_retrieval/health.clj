(ns metabase-enterprise.entity-retrieval.health
  "Health-inspector check for NLQ (natural-language-query) curated retrieval.

  The `:nlq` Metabot profile uses this tool; when the tool is unavailable we swap the profile out for
  `:nlq-fallback`, which uses the regular search tool.

  The swap is silent, so a broken index would otherwise go unnoticed -- this check surfaces it.

  :health can take the following values:
  -     nil = not enabled
  -       0 = enabled, but not available (`:message` tells why)
  - 0<h<100 = partially available (e.g. a built but empty index)
  -     100 = fully operational

  Shares the embedding-service probe and circuit-breaker with semantic-search."
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
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(defn nlq-retrieval-health-check
  "Health-inspector check for NLQ curated retrieval, registered as `:nlq-retrieval`.
  Returns nil when a dependency is unmet (the feature is off, so the check is omitted), otherwise a
  `{:health :message}` map describing the index's own state and the embedding service it depends on."
  []
  (let [status (entity-retrieval/retrieval-status)]
    (when (entity-retrieval/all-dependencies-met? status)
      (case (get-in status [:index :status])
        :unreachable  (semantic.health/degraded "Index unreachable")
        :missing      (semantic.health/degraded "Index not found")
        :incompatible (semantic.health/degraded "Index not compatible")
        :empty        (semantic.health/warning  "Index empty")
        :populated    (if-let [problem (semantic.health/embedding-problem)]
                        (semantic.health/degraded (u/capitalize-first-char problem))
                        (semantic.health/healthy "Healthy"))))))

(health-inspector/register-check! :nlq-retrieval nlq-retrieval-health-check)

(defn- persist-nlq-check-on-breaker-change!
  "Re-run and persist the NLQ retrieval check."
  [_state]
  ;; No cache clear: the semantic-search hook runs first (this ns requires it) and already refreshed the probe.
  (health-inspector/run-and-save-check! :nlq-retrieval))

(swap! semantic.embedding/embedder-circuit-state-change-hooks conj #'persist-nlq-check-on-breaker-change!)

;;; ------------------------------------------- AI index metrics --------------------------------------------
;;;
;;; Coverage / garbage / staleness for the index, at the distinct-entity grain (rows are per (entity, doc)).
;;; Both sides are normalised through entity-class so a metric<->model relabel doesn't read as both missing
;;; and garbage. Registered through the shared framework in semantic-search.health, which owns the
;;; threshold/message/gauge shaping.

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
  (when (contains? #{:compatible :empty :populated}
                   (get-in (entity-retrieval/retrieval-status false) [:index :status]))
    (try (semantic.datasource/ensure-initialized-data-source!)
         (catch Throwable _ nil))))

(def ^:private library-datasource
  "TTL-memoized so coverage, garbage, and staleness share one retrieval-status probe + datasource resolve per
  refresh cycle rather than each re-running it."
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
    ;;
    ;; reconciled_at is added lazily -- ensure-tables! ALTERs it in on the first reconcile -- so an index
    ;; built before the column existed lacks it until then, and only that case reads as N/A (skip). Any other
    ;; SQL error propagates to run-measure!'s error path instead of hiding as N/A.
    (try
      (let [{:keys [age]} (jdbc/execute-one! ds
                                             [(format "SELECT EXTRACT(EPOCH FROM (now() - reconciled_at)) AS age FROM \"%s\" WHERE id = 1"
                                                      index-table/*meta-table*)]
                                             {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
        (when age
          (semantic.health/staleness-result
           age staleness-warn-seconds staleness-critical-seconds
           "Membership/name changes not hooked are caught by the ~15m full reconcile.")))
      (catch java.sql.SQLException e
        ;; 42703 = undefined_column
        (if (= "42703" (.getSQLState e))
          (log/debug e "NLQ staleness metric skipped (reconciled_at not yet added)")
          (throw e))))))

(semantic.health/register-index-check! :nlq :coverage  nlq-coverage)
(semantic.health/register-index-check! :nlq :garbage   nlq-garbage)
(semantic.health/register-index-check! :nlq :staleness nlq-staleness)
