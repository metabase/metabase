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
   [metabase.analytics-interface.core :as analytics]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def sync-job-key
  "Quartz job key of the periodic full-reconcile backstop, scheduled by
  [[metabase-enterprise.entity-retrieval.task.sync]]."
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

(defn- index-ready?
  "Whether the library entity index can serve a query right now: its meta row matches the configured
  embedding model and schema version, and it holds at least one document.
  A mismatched meta row (a model/dimension/format change whose rebuild hasn't run yet), a missing or empty
  vectors table, or any query error all read as not-ready.
  The compatibility check is what keeps a stale index from being offered: querying a vectors table built for
  a different model returns nothing (or errors) rather than answering, so the agent must get the
  general-search fallback instead."
  []
  (boolean
   (try
     (let [ds (semantic.db.datasource/ensure-initialized-data-source!)]
       (and (index-table/index-compatible? ds (embedding/get-configured-model))
            (seq (jdbc/execute! ds [(format "SELECT 1 FROM \"%s\" LIMIT 1" index-table/*vectors-table*)]))))
     (catch Throwable _ false))))

;; OSS-callable surface used to decide whether to OFFER the curated retrieve_library_entities tool: it must
;; be able to actually answer, so beyond config + license the index has to be built for the current model and
;; populated. (The write/reconcile path gates on the looser [[available?]] instead, so an empty or stale
;; index can still be rebuilt.) Runs unconditionally rather than gating on :feature — the OSS fallback
;; `false` already covers the unlicensed case.
(defenterprise entity-retrieval-available?
  "EE impl: pgvector configured + semantic-search licensed AND the index is ready (built for the current
  model and populated), so the curated tool is offered only when it can serve a query (otherwise the agent
  gets the general-search fallback)."
  :feature :none
  []
  (and (available?) (index-ready?)))

;;; ----------------------------------------- Reconcile scheduling -----------------------------------------
;;;
;;; Two independent two-slot coalescing schedules, both mutated only under run-lock and both serialized on
;;; the appdb side by reconcile's pg advisory lock so they never race on the index:
;;;   - full-*     drives full reconciles (force-reconcile API, periodic backstop, startup); blocking.
;;;   - targeted-* drives the per-entity write path; fire-and-forget, draining `dirty-entities`.
;;; Each is the "current run + one queued follow-up" pattern: a caller never joins the in-flight run (it may
;;; predate the caller's write); it starts a run when idle, or queues (or joins) the single follow-up, which
;;; begins only after the in-flight run finishes. So every write is covered by a run that starts after it,
;;; and a burst collapses to one extra run. Keeping the schedules separate (rather than one with a
;;; full-vs-targeted flag) means a blocking full caller always derefs a run that did a full reconcile.

(defonce ^:private run-lock (Object.))
(defonce ^:private full-current (atom nil))
(defonce ^:private full-next (atom nil))
(defonce ^:private targeted-current (atom nil))
(defonce ^:private targeted-next (atom nil))
(defonce ^:private dirty-entities (atom #{}))

(defn- record-run!
  "Emit metrics and a log line for one completed reconcile. `scope` is \"full\" or \"targeted\"; the index
  size gauges come only from a full run, which counts the whole index."
  [scope {:keys [inserted deleted unchanged rebuilt? documents entities]} ran-ms]
  (analytics/observe! :metabase-entity-retrieval/reconcile-duration-ms {:scope scope} ran-ms)
  (when (pos? (long (or inserted 0))) (analytics/inc! :metabase-entity-retrieval/docs-inserted (long inserted)))
  (when (pos? (long (or deleted 0)))  (analytics/inc! :metabase-entity-retrieval/docs-deleted  (long deleted)))
  (when documents (analytics/set-gauge! :metabase-entity-retrieval/index-documents documents))
  (when entities  (analytics/set-gauge! :metabase-entity-retrieval/index-entities  entities))
  (when (or (pos? (long (or inserted 0))) (pos? (long (or deleted 0))) rebuilt?)
    (log/info "library entity index reconciled"
              {:scope scope :inserted inserted :deleted deleted :unchanged unchanged
               :rebuilt? rebuilt? :documents documents :entities entities :ran_ms ran-ms})))

(defn- run-loop
  "Future for the two-slot schedule held in `cur`/`nxt`: await `predecessor` (nil to start now), call
  `(work scheduled-timer)`, then promote the queued follow-up. Returns `work`'s value (the full path's
  result map; nil for the targeted path)."
  [cur nxt predecessor work]
  (future
    (let [scheduled (u/start-timer)]
      (when predecessor
        ;; A failed predecessor must not block the follow-up — its writes still need reconciling.
        (try @predecessor (catch Throwable _ nil)))
      (try
        (work scheduled)
        (finally
          (locking run-lock
            (reset! cur @nxt)
            (reset! nxt nil)))))))

(defn- schedule!
  "Schedule (or join) a run of `work` on the `cur`/`nxt` two-slot schedule, returning its future. Must be
  called holding run-lock; deref the future outside the lock."
  [cur nxt work]
  (cond
    (nil? @cur) (let [f (run-loop cur nxt nil work)]  (reset! cur f) f)
    (nil? @nxt) (let [f (run-loop cur nxt @cur work)] (reset! nxt f) f)
    :else       @nxt))

(defn- elapsed-ms ^long [timer]
  (Math/round ^double (u/since-ms timer)))

(defn- do-full-run
  "Run a full reconcile, record its metrics, and return {:index {...} :execution {...}}. The model is
  resolved under the reconcile lock (see [[reconcile/reconcile!]]), so a run that waited out a concurrent
  node uses the current model rather than one captured before the wait."
  [scheduled]
  (let [ds        (semantic.db.datasource/ensure-initialized-data-source!)
        waited-ms (elapsed-ms scheduled)
        started   (u/start-timer)
        diff      (reconcile/reconcile! ds embedding/get-configured-model)
        ran-ms    (elapsed-ms started)]
    (record-run! "full" diff ran-ms)
    {:index     (select-keys diff [:inserted :deleted :unchanged])
     :execution {:waited_ms waited-ms :ran_ms ran-ms}}))

(defn- do-targeted-run
  "Targeted-reconcile each currently-dirty entity, recording per-entity metrics.
  The datasource is resolved *before* the dirty set is snapshot-and-cleared, so a datasource failure leaves
  the entries in place for the next run rather than dropping them. Clearing the set up front (vs after the
  loop) means a write arriving mid-run re-dirties and is picked up by the next run. A per-entity reconcile
  failure re-dirties that entity, so a later run (or the periodic backstop) retries it instead of losing
  the write to the slow backstop."
  [_scheduled]
  (let [ds    (semantic.db.datasource/ensure-initialized-data-source!)
        dirty (locking run-lock (let [d @dirty-entities] (reset! dirty-entities #{}) d))]
    (doseq [[entity-type entity-local-id :as entity-key] dirty]
      (try
        (let [started (u/start-timer)
              diff    (reconcile/reconcile-entity! ds embedding/get-configured-model entity-type entity-local-id)]
          (record-run! "targeted" diff (elapsed-ms started)))
        (catch Throwable e
          (log/error e "library entity index: targeted reconcile failed; re-queuing"
                     entity-type entity-local-id)
          (locking run-lock (swap! dirty-entities conj entity-key)))))))

(defn reconcile-full-coalesced!
  "Run a full reconcile through the full-reconcile schedule, blocking until a run covering this call
  finishes; returns {:index {:inserted n :deleted n :unchanged n} :execution {:waited_ms _ :ran_ms _}}.
  Used by the force-reconcile API and the periodic backstop job. Callers must have checked [[available?]]."
  []
  @(locking run-lock (schedule! full-current full-next do-full-run)))

(defenterprise force-reconcile!
  "Force a full reconcile of the `library_entity_index` against the appdb, blocking until a run covering
  this call finishes. Returns {:index {:inserted n :deleted n :unchanged n} :execution {:waited_ms _
  :ran_ms _}}, or nil when entity retrieval isn't available (no pgvector store configured).
  See [[reconcile-full-coalesced!]] for the coalescing semantics it shares with the periodic backstop."
  :feature :semantic-search
  []
  (when (available?)
    (reconcile-full-coalesced!)))

(defenterprise request-entity-sync!
  "Mark one library entity dirty and ensure the targeted write path reconciles its index slice soon.
  Fire-and-forget: never blocks, throws, or does embedding/pgvector work on the calling (appdb-write)
  thread — the reconcile runs later on a future. Covers `osi_ai_context` edits; membership / name /
  description changes to the underlying entity are caught by the periodic full reconcile."
  :feature :semantic-search
  [entity-type entity-local-id]
  (when (available?)
    (try
      (locking run-lock
        (swap! dirty-entities conj [entity-type entity-local-id])
        (schedule! targeted-current targeted-next do-targeted-run))
      (catch Throwable _ nil))
    nil))

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
                      (catch SQLException e
                        ;; Only the index-not-ready states degrade to no results — the index, not the agent,
                        ;; is at fault and the next reconcile heals it:
                        ;;   42P01  vectors table doesn't exist yet (pre-first-build; expected at boot, stay quiet)
                        ;;   22000  stored vectors incompatible with the query vector (a dimension/format change
                        ;;          awaiting rebuild — e.g. a vector(OLD) column vs a vector(NEW) literal)
                        ;; Any other SQL error — a connection loss or pgvector outage — propagates so the tool
                        ;; reports the search as unavailable rather than as an empty library.
                        (case (.getSQLState e)
                          "42P01" []
                          "22000" (do (log/warn e "library entity index incompatible with the query vector; returning no results")
                                      [])
                          (do (analytics/inc! :metabase-entity-retrieval/search-failed)
                              (throw e)))))]
      (->> rows
           (map (fn [row]
                  {:entity   {:model (:entity_type row) :id (:entity_local_id row)}
                   :doc_type (:doc_type row)
                   :doc_text (:doc_text row)
                   :score    (score row)}))
           (sort-by (comp :total_score :score) >)
           vec))))
