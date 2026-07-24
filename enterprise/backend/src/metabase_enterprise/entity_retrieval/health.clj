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
   [metabase-enterprise.semantic-search.embedding-health :as embedding-health]
   [metabase.entity-retrieval.core :as er]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.search.index-health :as search.index-health]
   [metabase.util :as u]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(defn nlq-retrieval-health-check
  "Health-inspector check for NLQ curated retrieval, registered as `:nlq-retrieval`.
  Returns nil when a dependency is unmet (the feature is off, so the check is omitted), otherwise a
  `{:health :message}` map describing the index's own state and the embedding service it depends on."
  []
  ;; :index is present only when every dependency holds -- absence is the not-applicable signal.
  (when-let [index (:index (entity-retrieval/retrieval-status))]
    (case (:status index)
      :unreachable  (search.index-health/degraded "Index unreachable")
      :missing      (search.index-health/degraded "Index not found")
      :incompatible (search.index-health/degraded "Index not compatible")
      :empty        (if-let [problem (embedding-health/embedding-problem)]
                      (search.index-health/degraded (u/capitalize-first-char problem))
                      (search.index-health/warning "Index empty"))
      :populated    (if-let [problem (embedding-health/embedding-problem)]
                      (search.index-health/degraded (u/capitalize-first-char problem))
                      (search.index-health/healthy "Healthy")))))

(health-inspector/register-check! :nlq-retrieval nlq-retrieval-health-check)

(defn- persist-nlq-check-on-breaker-change!
  "Re-run and persist the NLQ retrieval check."
  [_state]
  (health-inspector/run-and-save-check! :nlq-retrieval))

(swap! semantic.embedding/embedder-circuit-state-change-hooks conj #'persist-nlq-check-on-breaker-change!)

;;; ----------------------------------------- Search index metrics ------------------------------------------
;;;
;;; Coverage / garbage / staleness for the index, at the distinct-entity grain (rows are per (entity, doc)).
;;; Both sides are normalised through entity-class so a metric<->model relabel doesn't read as both missing
;;; and garbage. The shared search-index health framework owns threshold, message, and gauge shaping.

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
  ;; probe-populated? false stops the probe at :compatible, so :empty/:populated never appear here.
  (when (= :compatible (get-in (entity-retrieval/retrieval-status false) [:index :status]))
    (try (semantic.datasource/ensure-initialized-data-source!)
         (catch InterruptedException e
           (throw e))
         (catch Exception _ nil))))

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
    (search.index-health/coverage-result (count (set/intersection library indexed)) (count library))))

(defn- nlq-garbage []
  (when-let [{:keys [library indexed]} (library-and-indexed-classes)]
    (search.index-health/garbage-result (count (set/difference indexed library))
                                        garbage-warn-count garbage-critical-count)))

(defn- nlq-staleness []
  (when-let [ds (library-datasource)]
    ;; Reconcile-lag: seconds since the last successful full reconcile began reading the appdb. Capturing the
    ;; watermark before that read conservatively includes changes made during a long run. There's no per-change
    ;; gate here (unlike semantic search), so this is the honest bound on undetected membership/name drift that
    ;; the osi_ai_context write hooks don't catch. A null means no full reconcile has completed.
    ;;
    ;; ensure-tables! adds reconciled_at to legacy metadata when the database role owns the table. A grant-only
    ;; role can still reconcile but cannot record freshness, which is degraded rather than silently omitted.
    (try
      (let [sql (format (str "WITH observed AS (SELECT clock_timestamp() AS at) "
                             "SELECT EXTRACT(EPOCH FROM ((SELECT at FROM observed) - reconciled_at)) AS age "
                             "FROM \"%s\" WHERE id = 1")
                        index-table/*meta-table*)
            {:keys [age]} (jdbc/execute-one! ds [sql] {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
        (cond
          (nil? age)
          (search.index-health/degraded "No full index reconcile has completed.")

          (neg? (double age))
          (search.index-health/degraded
           "Index reconcile freshness unavailable: database clock precedes the last reconcile.")

          :else
          (search.index-health/staleness-result
           age staleness-warn-seconds staleness-critical-seconds
           "Changes missed by the write hooks are picked up by the ~15m full reconcile.")))
      (catch java.sql.SQLException e
        ;; 42703 = undefined_column
        (if (= "42703" (.getSQLState e))
          (search.index-health/degraded "Index reconcile freshness unavailable: metadata column missing.")
          (throw e))))))

(search.index-health/register-index-check! :nlq-retrieval :coverage  nlq-coverage)
(search.index-health/register-index-check! :nlq-retrieval :garbage   nlq-garbage)
(search.index-health/register-index-check! :nlq-retrieval :staleness nlq-staleness)
