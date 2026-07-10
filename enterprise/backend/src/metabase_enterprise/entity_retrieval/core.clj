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
  "True when a dedicated pgvector store is configured (MB_PGVECTOR_DB_URL).
  Deliberately excludes pgvector-on-the-app-db: entity retrieval's tables are not yet schema-isolated
  (bare `library_entity_index*` names, dropped and recreated on rebuild), so it stays dedicated-only
  until they are.
  The sync task gates scheduling on this rather than [[available?]], so the periodic safety net exists
  even when the library-retrieval feature is turned on after startup (a common onboarding flow).
  A plain URL check, not [[metabase-enterprise.semantic-search.db.datasource/pgvector-mode]]: mode
  resolution can probe the app db, which a dedicated-only scheduling gate has no business doing."
  []
  (semantic.db.datasource/dedicated-url-configured?))

(defn- licensed?
  "Both features retrieval needs: `:library-retrieval` entitles the tool; `:library` gives the index
  something to hold (a token granting `:library-retrieval` alone degrades to \"unavailable\" explicitly,
  not silently via an empty index)."
  []
  (and (premium-features/has-feature? :library)
       (premium-features/has-feature? :library-retrieval)))

(defn- embedder-configured?
  "Whether an embedding backend is configured (see [[embedding/embedding-supported?]]): without one, both
  reconcile and query embedding would throw, so callers gate rather than fail mid-run."
  []
  (embedding/embedding-supported? (embedding/get-configured-model)))

(defn available?
  "Whether the entity-retrieval mirror can run right now: a pgvector store is configured (somewhere to hold
  the index), the license includes `:library` and `:library-retrieval` ([[licensed?]]), and an embedding
  backend is configured ([[embedder-configured?]]).
  The feature and config checks can flip at runtime (token/settings entered post-boot), so callers
  re-evaluate per use."
  []
  (and (pgvector-configured?)
       (licensed?)
       (embedder-configured?)))

(defn- missing-table-error?
  "Whether `e` (or one of its causes) is Postgres undefined_table (42P01), i.e. the index tables don't exist
  yet -- expected before the first build or after a manual drop awaiting heal. The store answered, so this is
  index absence, not a connectivity fault."
  [e]
  (boolean (some #(and (instance? SQLException %)
                       (= "42P01" (.getSQLState ^SQLException %)))
                 (u/full-exception-chain e))))

(defn retrieval-status
  "Decomposed availability of the library entity index -- the single source of truth behind
  [[entity-retrieval-available?]] and the health check.
  Returns `{:pgvector? :licensed? :embedder-configured? :index-compatible? :populated? :probe-error}`:
  `:pgvector?` / `:licensed?` / `:embedder-configured?` are the enablement conditions ([[available?]] is
  their conjunction); `:index-compatible?` (meta row matches the configured model + schema version) and
  `:populated?` (>= 1 document) are the readiness conditions, probed against pgvector only when enabled.
  `:probe-error` is the message of a pgvector failure during that probe (else nil) -- it distinguishes a
  store that is unreachable (probe threw) from an index that is genuinely absent/incompatible (probe
  succeeded, answer negative), so a health check can name connectivity vs a pending rebuild. A missing
  index table (42P01: first build pending, or a manual drop) counts as absence, not a probe error.
  `probe-populated?` false skips the `:populated?` query for callers that only need compatibility (it then
  reads nil); a probe error still surfaces via `:probe-error`."
  ([] (retrieval-status true))
  ([probe-populated?]
   (let [pgvector? (pgvector-configured?)
         licensed? (licensed?)
         embedder? (embedder-configured?)]
     (if-not (and pgvector? licensed? embedder?)
       {:pgvector? pgvector? :licensed? licensed? :embedder-configured? embedder?
        :index-compatible? false :populated? false :probe-error nil}
       ;; An incompatible meta row is a model/dimension/format change whose rebuild hasn't run; the vectors
       ;; table would answer with nothing (or error), so such an index must not be offered. A thrown probe is
       ;; kept distinct (:probe-error) from a negative-but-successful one so pgvector-down isn't mislabelled.
       (let [{:keys [compatible? populated? probe-error]}
             (try
               (let [ds (semantic.db.datasource/ensure-initialized-data-source!)]
                 {:compatible? (boolean (index-table/index-compatible? ds (embedding/get-configured-model)))
                  :populated?  (when probe-populated?
                                 (boolean (seq (jdbc/execute! ds [(format "SELECT 1 FROM \"%s\" LIMIT 1"
                                                                          index-table/*vectors-table*)]))))})
               (catch Throwable e
                 ;; Missing index tables are the ordinary absent-index state, not a store fault: report
                 ;; incompatible with no :probe-error so the health check says "rebuild pending" rather
                 ;; than "pgvector unreachable".
                 (if (missing-table-error? e)
                   {:compatible? false :populated? false :probe-error nil}
                   {:compatible? false :populated? false :probe-error (ex-message e)})))]
         {:pgvector? true :licensed? true :embedder-configured? true
          :index-compatible? compatible? :populated? populated? :probe-error probe-error})))))

;; OSS-callable surface used to decide whether to OFFER the retrieve_library_entities tool: it must
;; be able to actually answer, so beyond config + license the index has to be built for the current model and
;; populated. (The write/reconcile path gates on the looser [[available?]] instead, so an empty or stale
;; index can still be rebuilt.) Runs unconditionally rather than gating on :feature — the OSS fallback
;; `false` already covers the unlicensed case.
(defenterprise entity-retrieval-available?
  "EE impl: pgvector configured + library-retrieval licensed + embedder configured AND the index is ready
  (built for the current model and populated) AND the embedder circuit isn't open, so the tool is offered
  only when it can serve a query -- otherwise the agent gets the general-search fallback rather than
  fast-failing on every `retrieve_library_entities` call while the embedder is down."
  :feature :none
  []
  (let [{:keys [pgvector? licensed? embedder-configured? index-compatible? populated?]} (retrieval-status)]
    (and pgvector? licensed? embedder-configured? index-compatible? populated?
         (not (embedding/embedder-circuit-open?)))))

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
  :feature :library-retrieval
  []
  (when (available?)
    (reconcile-full-coalesced!)))

(defenterprise request-entity-sync!
  "Mark one library entity dirty and ensure the targeted write path reconciles its index slice soon.
  Fire-and-forget: never blocks, throws, or does embedding/pgvector work on the calling (appdb-write)
  thread — the reconcile runs later on a future. Covers `osi_ai_context` edits; membership / name /
  description changes to the underlying entity are caught by the periodic full reconcile."
  :feature :library-retrieval
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
  :feature :library-retrieval
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
  :feature :library-retrieval
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
                           ;; library set is tiny.
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
