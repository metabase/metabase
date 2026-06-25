(ns metabase-enterprise.entity-retrieval.core
  "Enterprise implementation of the library entity index: pgvector-backed similarity search over the
  per-value `library_entity_index` documents, and the write-path nudge that keeps the index fresh.

  OSS shims live in [[metabase.entity-retrieval.mirror]]; the background sync they nudge is the
  [[metabase-enterprise.entity-retrieval.task.sync]] Quartz job."
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.task.core :as task]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def sync-job-key
  "Quartz job key of the background sync; [[request-sync!]] triggers it and
  [[metabase-enterprise.entity-retrieval.task.sync]] schedules it."
  (jobs/key "metabase-enterprise.entity-retrieval.sync.job"))

(defn pgvector-configured?
  "True when a pgvector store is configured (read once at boot from MB_PGVECTOR_DB_URL).
  The sync task gates scheduling on this rather than [[available?]], so the periodic safety net exists
  even when the semantic-search feature is turned on after startup (a common onboarding flow)."
  []
  (string? (not-empty semantic.db.datasource/db-url)))

(defn available?
  "Whether the entity-retrieval mirror can run right now: a pgvector store is configured and the license
  includes semantic search.
  The feature check can flip at runtime (token entered post-boot), so callers re-evaluate per use."
  []
  (and (pgvector-configured?)
       (premium-features/has-feature? :semantic-search)))

(defenterprise request-sync!
  "Trigger the background sync job to reconcile the mirror soon.
  Fire-and-forget: [[metabase.task.core/trigger-now!]] swallows scheduler errors, and the job's periodic
  schedule covers anything a lost trigger misses."
  :feature :semantic-search
  []
  (when (available?)
    (task/trigger-now! sync-job-key)))

(defonce ^:private run-lock (Object.))

;; The reconcile schedule, shared by the force-reconcile API and the background sync job, both mutated only
;; under run-lock. `current-run` is the in-flight run (nil when idle); `next-run` is the single follow-up
;; queued behind it (nil when none). A caller never joins the in-flight run — it may have begun before the
;; caller's write — so it starts a run when idle, or queues (or joins) the one follow-up, which begins only
;; once the in-flight run finishes. Every caller's write is thus covered by a run that starts after it, a
;; burst of callers collapses to a single extra run, and the API and the periodic job never run two
;; reconciles at once on a node.
(defonce ^:private current-run (atom nil))
(defonce ^:private next-run (atom nil))

(defn- elapsed-ms
  "Whole milliseconds between two System/nanoTime readings."
  ^long [^long from ^long to]
  (Math/round (/ (double (- to from)) 1e6)))

(defn- start-reconcile!
  "Spawn the reconcile future, first awaiting `predecessor` (nil to begin at once) so a queued follow-up
  reflects writes made after the predecessor began.
  The datasource and embedding model are resolved inside the future just before the run, so a follow-up
  that executes after a config change reconciles with the current model, not a stale one captured at queue
  time.
  Its value is {:index <diff> :execution {:waited_ms _ :ran_ms _}} — index mutations alongside how long the
  run sat queued and then ran.
  On completion it promotes the queued follow-up, if any, to the current run under the lock."
  [predecessor]
  (future
    (let [scheduled (System/nanoTime)]
      (when predecessor
        ;; A failed predecessor must not block the follow-up — its writes still need reconciling.
        (try @predecessor (catch Throwable _ nil)))
      (try
        (let [ds      (semantic.db.datasource/ensure-initialized-data-source!)
              model   (embedding/get-configured-model)
              started (System/nanoTime)
              diff    (reconcile/reconcile! ds model)]
          {:index     diff
           :execution {:waited_ms (elapsed-ms scheduled started)
                       :ran_ms    (elapsed-ms started (System/nanoTime))}})
        (finally
          (locking run-lock
            (reset! current-run @next-run)
            (reset! next-run nil)))))))

(defn reconcile-coalesced!
  "Run a reconcile through the shared queue-and-coalesce schedule, blocking until a run covering this call
  finishes.
  Returns {:index {:inserted n :deleted n :unchanged n} :execution {:waited_ms _ :ran_ms _}} — the index
  mutations separated from how long the run waited to start and then ran.
  A call never joins a run already in flight, which may predate its write; it starts a run when idle, or
  queues a single follow-up behind the in-flight run that concurrent callers coalesce onto.
  Across nodes the run waits for the reconcile advisory lock (see [[reconcile/reconcile!]]).
  Callers must have checked [[available?]]."
  []
  ;; Claim under the lock (creation and the slot write are one atomic step); block on the deref outside it
  ;; so a joiner never holds the lock while a reconcile runs.
  (let [run (locking run-lock
              (cond
                (nil? @current-run) (let [f (start-reconcile! nil)]
                                      (reset! current-run f)
                                      f)
                (nil? @next-run)    (let [f (start-reconcile! @current-run)]
                                      (reset! next-run f)
                                      f)
                :else               @next-run))]
    @run))

(defenterprise force-reconcile!
  "Reconcile the `library_entity_index` against the appdb, blocking until a run covering this call finishes.
  Returns {:index {:inserted n :deleted n :unchanged n} :execution {:waited_ms _ :ran_ms _}}, or nil when
  entity retrieval isn't available (no pgvector store configured).
  See [[reconcile-coalesced!]] for the queue-and-coalesce semantics it shares with the background sync."
  :feature :semantic-search
  []
  (when (available?)
    (reconcile-coalesced!)))

(defenterprise library-entity-keys
  "Live set of `[entity_type entity_local_id]` for entities currently in the library (see the OSS shim)."
  :feature :semantic-search
  []
  (reconcile/library-entity-keys))

(def ^:private default-limit 10)

(def ^:private weights
  "Blended-score weights, keyed like regular search's scorer weights (a namespaced keyword per variant).
  Similarity is the base; the slight per-doc_type bump lets a name match edge out a synonym on a tie."
  {:similarity       1.0
   :doc-type/name    0.02
   :doc-type/synonym 0.01})

(defn- doc-type-boost ^double [doc-type]
  (double (get weights (keyword "doc-type" doc-type) 0.0)))

(defn- scorer [nm score weight]
  (let [score (double score) weight (double weight)]
    {:name nm :score score :weight weight :contribution (* score weight)}))

(defn- score
  "Weighted-scorer breakdown for one row: a `:scores` vector of `{:name :score :weight :contribution}`
  plus the weighted-sum `:total_score`."
  [{:keys [distance doc_type]}]
  (let [scores [(scorer :similarity (- 1.0 (double distance)) (:similarity weights))
                (scorer :doc-type 1.0 (doc-type-boost doc_type))]]
    {:scores      scores
     :total_score (reduce + (map :contribution scores))}))

(defn- ranking-sql
  "`distance - doc_type_boost`: a boosted doc_type sorts earlier even when slightly farther."
  [distance-expr]
  (let [cases (str/join " " (for [[k w] weights :when (= "doc-type" (namespace k))]
                              (format "WHEN doc_type = '%s' THEN %s" (name k) w)))]
    (format "(%s) - (CASE %s ELSE 0.0 END)" distance-expr cases)))

(defenterprise search
  "Find the library-entity documents best matching `user-search-prompt`, up to `limit`, ranked by a
  blended score (cosine similarity plus a slight doc_type bump).
  Each result is shaped `{:entity {:model :id} :doc_type :doc_text :score}`, best score first; the caller
  dedupes the (many-per-entity) docs down to distinct entities.
  Returns [] when the pgvector store is unconfigured."
  :feature :semantic-search
  [user-search-prompt limit]
  (if-not (available?)
    []
    (let [pgvector  (semantic.db.datasource/ensure-initialized-data-source!)
          limit     (or limit default-limit)
          model     (embedding/get-configured-model)
          embedding (embedding/get-embedding model user-search-prompt
                                             {:type :query :record-tokens? true})
          lit       (index-table/format-embedding embedding)
          distance  (str "doc_embedding <=> " lit)
          rows      (try
                      (jdbc/execute!
                       pgvector
                       (-> (sql.helpers/select :entity_type :entity_local_id :doc_type :doc_text
                                               [[:raw distance] :distance])
                           (sql.helpers/from (keyword index-table/*vectors-table*))
                           ;; Exact scan, no HNSW: the blended order-by can't use an ANN index, and the
                           ;; curated set is tiny.
                           (sql.helpers/order-by [[:raw (ranking-sql distance)] :asc])
                           (sql.helpers/limit limit)
                           (sql/format {:quoted true}))
                       {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                      ;; 42P01 = undefined table: the background sync hasn't created the index yet.
                      (catch SQLException e
                        (if (= "42P01" (.getSQLState e)) [] (throw e))))]
      (->> rows
           (map (fn [row]
                  {:entity   {:model (:entity_type row) :id (:entity_local_id row)}
                   :doc_type (:doc_type row)
                   :doc_text (:doc_text row)
                   :score    (score row)}))
           (sort-by (comp :total_score :score) >)
           vec))))
