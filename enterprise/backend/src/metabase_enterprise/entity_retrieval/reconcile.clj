(ns metabase-enterprise.entity-retrieval.reconcile
  "Reconciles the pgvector `library_entity_index` with the authoritative appdb.

  The index holds one embedded document per library-entity value — the entity's name, its description, and
  each `ai_context` synonym/example.
  The primary key `doc_id` is content-addressed over `entity_type|entity_local_id|doc_type|doc_text`, so
  editing text mints a new row.
  Curator `instructions` are not stored here — the tool reads them live from `osi_ai_context` at query time.

  Two reconcile entry points, both run via the coalescing schedule in
  [[metabase-enterprise.entity-retrieval.core]] and serialized across nodes by one advisory lock:

  - [[reconcile!]] — a full diff: derive the full desired doc set from library membership (published
    Tables, library metric/model Cards, and the Measures/Segments on those Tables) plus `osi_ai_context`,
    insert the docs whose `doc_id` is absent (embedding them), and delete the docs with no desired
    counterpart. That delete is the GC, and re-deriving from the appdb every run self-heals any missed
    write. Runs on a schedule as the backstop and from the force-reconcile API.
  - [[reconcile-entity!]] — the same diff scoped to one entity's doc slice, driven by the
    `osi_ai_context` write hooks so a curator edit becomes searchable without a full scan.

  Library membership and the doc derivation are declared per model in [[metabase.entity-retrieval.spec]];
  this namespace consumes them and owns only the pgvector diff/write half.

  Callers pass the datasource and a model resolver, so this namespace reads no settings."
  (:require
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(def ^:private embed-batch-size
  "Documents embedded per embedding-service request while backfilling new index rows.
  Larger than semantic-search's indexer default (150): our docs are short (names, single
  synonyms/examples), so item count, not the per-request token budget, is the binding constraint."
  512)

;; Advisory lock serializing whole reconcile runs across cluster nodes (insert-vs-orphan-delete races).
;; Arbitrary app-wide-unique constant, distinct from index-table's ensure lock (20011) and
;; semantic-search's migration lock (19991).
(def ^:private reconcile-lock-id 20012)

(defn- with-index-lock
  [pgvector lock-function unlock-function f]
  (with-open [^Connection conn (jdbc/get-connection pgvector)]
    (let [autocommit (.getAutoCommit conn)]
      (.setAutoCommit conn true)
      (try
        (jdbc/execute! conn [(format "SELECT %s(%d)" lock-function reconcile-lock-id)])
        (try
          (f conn)
          (finally
            (jdbc/execute! conn [(format "SELECT %s(%d)" unlock-function reconcile-lock-id)])))
        (finally
          (.setAutoCommit conn autocommit))))))

(defn with-index-read-lock
  "Run `(f connection)` under a shared cluster-wide library-index lock, returning nil immediately when a
  reconcile holds the matching exclusive lock.

  Concurrent searches share this lock. The non-blocking acquisition prevents waiting searches from exhausting
  the pgvector connection pool during a long reconcile. A successful search's compatibility check and vector
  query cannot straddle a rebuild into another embedding space."
  [pgvector f]
  (with-open [^Connection conn (jdbc/get-connection pgvector)]
    (let [autocommit (.getAutoCommit conn)]
      (.setAutoCommit conn true)
      (try
        (when (:acquired (jdbc/execute-one!
                          conn
                          [(format "SELECT pg_try_advisory_lock_shared(%d) AS acquired" reconcile-lock-id)]
                          {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
          (try
            (f conn)
            (finally
              (jdbc/execute! conn [(format "SELECT pg_advisory_unlock_shared(%d)" reconcile-lock-id)]))))
        (finally
          (.setAutoCommit conn autocommit))))))

(defn- with-index-write-lock
  [pgvector f]
  (with-index-lock pgvector "pg_advisory_lock" "pg_advisory_unlock" f))
;;; ------------------------------------------- Library membership ------------------------------------------------
;;;
;;; Membership truth and the doc derivation live in the OSS declaration layer: per-model
;;; `define-source`/`define-projection` calls next to the models, consumed here through
;;; [[spec/member-entities]] / [[spec/member-entity]] / [[spec/hydrate]] / [[spec/project]].
;;; Those selects are headless by construction (no permission filtering) — see the spec namespace.

(defn library-entity
  "The `{:entity_type :entity_local_id :name :description}` map for one entity if it is currently a library
  member, else nil. Shares [[library-entity-keys]]' membership truth via the per-model spec declarations.
  The hook may pass either Card label; the returned map carries the entity's *stored* type, so a
  metric↔model relabel keeps `doc_id`s stable."
  [entity-type entity-local-id]
  (some-> (spec/member-entity :library-index entity-type entity-local-id)
          spec/entity-summary))

(defn library-entity-keys
  "Set of `[entity_type entity_local_id]` for every entity currently in the library.
  The tool post-filters its index hits against this so a stale index never surfaces an entity that has
  since left the library, the same way it post-filters on read permissions."
  []
  (into #{} (map (juxt :entity_type :entity_local_id)) (spec/member-entities :library-index)))

;;; ------------------------------------------------- Desired docs ------------------------------------------------

(defn- entity-class
  "Map-taking adapter over [[entity-retrieval/entity-class]] for the `{:entity_type :entity_local_id}` maps
  this namespace passes around (rows, docs, library entities).
  Card labels collapse to one class so a card's desired docs, stored docs, and curated `ai_context` stay
  matched across a relabel; table/measure/segment stay distinct."
  [{:keys [entity_type entity_local_id]}]
  (entity-retrieval/entity-class entity_type entity_local_id))

(defn- dedup-by-doc-id [docs]
  ;; distinct-by doc_id so an exact duplicate (same doc_type and text, e.g. a synonym listed twice)
  ;; collapses; a synonym equal to the name does NOT collapse — different doc_type, different doc_id.
  (into [] (m/distinct-by :doc_id) docs))

(defn- desired-docs
  "The full desired document set plus entity classes whose projection failed. Projection is isolated per
  entity: healthy entities continue reconciling, while failed classes are returned so their existing index
  rows can be retained rather than mistaken for orphans."
  []
  (let [entities (spec/hydrate :library-index (spec/member-entities :library-index))
        result   (reduce (fn [acc entity]
                           (try
                             (update acc :docs into (spec/project :library-index entity))
                             (catch Throwable e
                               ;; TODO (Chris 2026-07-24) -- Retention protects an entity's EXISTING docs,
                               ;; but on a first build or full rebuild there are none, so a projection
                               ;; failure drops the entity entirely — including its name/description docs,
                               ;; which don't depend on ai_context. The tolerance filter (usable-index-value?)
                               ;; keeps malformed ai_context from reaching here, so this is the
                               ;; unforeseen-error path; hardening is to project the base name/description
                               ;; docs independently of the ai_context enrichment so they survive a failure.
                               (log/error e "library entity index: projection failed; retaining existing docs"
                                          (select-keys entity [:entity_type :entity_local_id]))
                               (update acc :failed conj (entity-class entity)))))
                         {:docs [] :failed #{}}
                         entities)]
    (update result :docs dedup-by-doc-id)))

(defn- entity-desired-docs
  "Desired docs for one entity: its `ai_context` synonym/example docs plus name/description, but only if
  it is still a library member. A non-member (left the library) yields no docs, so its stored docs all
  GC. `entity-type` may be either Card label; membership resolves the canonical stored type."
  [entity-type entity-local-id]
  (if-let [member (spec/member-entity :library-index entity-type entity-local-id)]
    (dedup-by-doc-id (spec/project :library-index (first (spec/hydrate :library-index [member]))))
    []))

;;; ------------------------------------------------- Index writes -------------------------------------------------
;;;
;;; All pgvector reads/writes take the locked connection (see [[with-reconcile-lock]]) so a whole run uses
;;; one connection — a pgvector pool of size 1 can't deadlock checking out a second.

(defn- stored-docs
  "Map of `doc_id -> {:entity_type :entity_local_id}` for every row in the index."
  [conn]
  (u/index-by :doc_id #(select-keys % [:entity_type :entity_local_id])
              (jdbc/execute! conn
                             [(format "SELECT doc_id, entity_type, entity_local_id FROM %s"
                                      (index-table/vectors-table-sql))]
                             {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

(defn- stored-docs-for-entity
  "Map of `doc_id -> {:entity_type :entity_local_id}` for one entity's rows. Reads by `entity_local_id`
  then keeps rows of the target's [[entity-class]], so a metric↔model relabel's stale half is included
  while a same-id entity of another type is left untouched."
  [conn entity-type entity-local-id]
  (let [target-class (entity-class {:entity_type entity-type :entity_local_id entity-local-id})]
    (into {}
          (comp (filter #(= target-class (entity-class %)))
                (map (juxt :doc_id #(select-keys % [:entity_type :entity_local_id]))))
          (jdbc/execute! conn
                         [(format "SELECT doc_id, entity_type, entity_local_id FROM %s WHERE entity_local_id = ?"
                                  (index-table/vectors-table-sql))
                          entity-local-id]
                         {:builder-fn jdbc.rs/as-unqualified-lower-maps}))))

(defn- doc->record [doc embedding]
  {:doc_id          (:doc_id doc)
   :entity_type     (:entity_type doc)
   :entity_local_id (:entity_local_id doc)
   :doc_type        (:doc_type doc)
   :doc_text        (:doc_text doc)
   :doc_embedding   [:raw (index-table/format-embedding embedding)]})

(defn- insert-batch!
  "Embed one batch of new docs and insert them, returning the number inserted.
  Embeds via [[embedding/process-embeddings-streaming]] so a long value can't push a request over the
  provider's per-batch token limit — it splits into token-aware sub-batches (single batch off OpenAI).
  Its own fn so the failed-insert test can mock it to simulate an embed/insert failure."
  [conn embedding-model docs]
  (let [text->embedding (volatile! {})]
    ;; the callback must be purely side-effecting: process-embeddings-streaming merges callback *return*
    ;; values with `merge-with +` across sub-batches, which would try to add embedding vectors.
    (embedding/process-embeddings-streaming embedding-model (map :doc_text docs)
                                            (fn [m] (vswap! text->embedding merge m) nil)
                                            :type :index :record-tokens? true)
    ;; Skip any doc that came back without an embedding — e.g. a single value over the provider's
    ;; per-item token limit. Inserting a nil-embedding record would otherwise blow up the batch (and a
    ;; failed batch loses the good docs alongside the bad), so drop the offenders and keep the rest.
    (let [records (keep (fn [doc]
                          (when-let [embedding (@text->embedding (:doc_text doc))]
                            (doc->record doc embedding)))
                        docs)]
      (when (seq records)
        (jdbc/execute! conn
                       (-> (sql.helpers/insert-into (keyword (index-table/vectors-table)))
                           (sql.helpers/values (vec records))
                           (sql.helpers/on-conflict :doc_id)
                           (sql.helpers/do-nothing)
                           (sql/format {:quoted true}))))
      (count records))))

(defn- delete-rows! [conn doc-ids]
  (when (seq doc-ids)
    (jdbc/execute! conn
                   (-> (sql.helpers/delete-from (keyword (index-table/vectors-table)))
                       (sql.helpers/where [:in :doc_id (vec doc-ids)])
                       (sql/format {:quoted true})))))

(defn- diff-result [desired to-insert inserted deleted]
  {:inserted  inserted
   :deleted   deleted
   :unchanged (- (count desired) (count to-insert))})

(defn- index-size
  "Total document and distinct-entity counts in the index, for the size gauges. Cheap aggregate, run once
  per full reconcile under the lock."
  [conn]
  (let [{:keys [documents entities]}
        (jdbc/execute-one! conn
                           [(format (str "SELECT count(*) AS documents, "
                                         "count(distinct (entity_type, entity_local_id)) AS entities "
                                         "FROM %s")
                                    (index-table/vectors-table-sql))]
                           {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
    {:documents documents :entities entities}))

(defn- capture-reconcile-watermark [conn]
  (:now (jdbc/execute-one! conn ["SELECT now() AS now"]
                           {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

;; Scalability — targeted writes, full-diff backstop.
;; The full diff is O(total index size) per run, not O(changes). Embeddings — the only expensive resource —
;; are already change-scoped (only a new doc_text is embedded; an idle run embeds nothing), and the O(total)
;; metadata read is cheap over the *library* (a bounded tier), so a full run stays comfortable
;; into the tens of thousands of docs. The write path no longer pays it on every edit: an `osi_ai_context`
;; write drives [[reconcile-entity!]] (one entity's slice), and [[reconcile!]] runs only on a slow schedule
;; and from the force-reconcile API as the backstop for membership / name / description changes that aren't
;; hooked. Mark-and-sweep (stamp a generation, DELETE WHERE gen < current) would be a net loss for the full
;; path: it trades the cheap full read for a full write every run (WAL, dead tuples, vacuum pressure).

(defn- reconcile-against-appdb!
  "The full diff body — assumes the reconcile advisory lock is held on `conn`. See the namespace docstring."
  [conn embedding-model]
  (let [reconciled-at         (capture-reconcile-watermark conn)
        {:keys [docs failed]} (desired-docs)
        projection-failed     failed
        desired               docs
        desired-ids           (set (map :doc_id desired))
        stored                (stored-docs conn)
        to-insert             (remove #(contains? stored (:doc_id %)) desired)
        ;; A projection failure means we do not know that entity's desired set. Preserve its current slice;
        ;; deleting it as absent would turn a recoverable bad row into search data loss.
        orphans     (remove (fn [doc-id]
                              (or (contains? desired-ids doc-id)
                                  (contains? projection-failed (entity-class (get stored doc-id)))))
                            (keys stored))
        ;; entity classes whose insert failed this run — their orphans are spared (see below).
        failed      (volatile! #{})
        inserted    (transduce
                     (partition-all embed-batch-size)
                     (completing
                      (fn [n batch]
                        (+ n (try
                               (insert-batch! conn embedding-model batch)
                               (catch Exception e
                                 (vswap! failed into (map entity-class batch))
                                 (log/error "library entity index: failed to insert batch of"
                                            (count batch) "docs; will retry next run:" (ex-message e))
                                 0)))))
                     0
                     to-insert)
        ;; An orphan is often the stale half of an edited value (e.g. a renamed name's old doc).
        ;; Deleting it while its replacement failed to embed would drop that entity from search until the
        ;; next run, so spare orphans whose entity class had a failed insert; every other orphan GCs normally.
        to-delete   (cond->> orphans
                      (seq @failed) (remove #(contains? @failed (entity-class (get stored %)))))]
    (delete-rows! conn to-delete)
    ;; Record freshness when the run converged as far as it can -- no *retryable* failure this run: no
    ;; insert-batch failure (@failed) and no projection failure (`projection-failed`). Both leave an
    ;; entity's stale docs in place for a later run to fix, so advancing the watermark past either would
    ;; make the staleness health check report a fresh, converged index while a corrupt entity stays
    ;; stale. A doc silently dropped for exceeding the per-item token limit is different -- a permanent,
    ;; expected shortfall (`inserted` < `(count to-insert)` forever) -- so gating on the insert count
    ;; instead would freeze reconciled_at the moment one un-embeddable doc enters the library. Gate on
    ;; the absence of retryable failures, not on full insertion. Persist the pre-read watermark so
    ;; changes made during a long reconcile never look newer than the source snapshot.
    (when (and (empty? @failed) (empty? projection-failed))
      (index-table/touch-reconciled-at! conn reconciled-at))
    ;; index-size after the writes feeds the document/entity gauges (full reconcile only).
    (merge (diff-result desired to-insert inserted (count to-delete))
           (index-size conn))))

(defn- reconcile-entity-against-appdb!
  "The targeted diff body for one entity — assumes the reconcile advisory lock is held on `conn`."
  [conn embedding-model entity-type entity-local-id]
  (let [desired     (entity-desired-docs entity-type entity-local-id)
        desired-ids (set (map :doc_id desired))
        stored      (stored-docs-for-entity conn entity-type entity-local-id)
        to-insert   (remove #(contains? stored (:doc_id %)) desired)
        orphans     (remove desired-ids (keys stored))
        ;; One entity is one class: if its insert fails, keep its stale-but-searchable docs (skip the GC)
        ;; and let a later run retry. A non-member has nothing to insert, so its delete always proceeds.
        inserted    (try
                      (if (seq to-insert) (insert-batch! conn embedding-model to-insert) 0)
                      (catch Exception e
                        (log/error "library entity index: failed to reconcile entity"
                                   entity-type entity-local-id "; will retry next run:" (ex-message e))
                        ::failed))
        failed?     (= ::failed inserted)
        to-delete   (if failed? [] orphans)]
    (delete-rows! conn to-delete)
    (diff-result desired to-insert (if failed? 0 inserted) (count to-delete))))

(defn- with-reconcile-lock
  "Acquire the session-level reconcile advisory lock on one pooled connection, ensure the tables exist for
  the resolved model, then run `(f conn embedding-model emptied?)` on that same connection, and unlock.
  Returns `f`'s diff map with `:rebuilt?` added. `emptied?` is true when `ensure-tables!` left an empty
  vectors table (a first :created build or a model/format :rebuilt), so a targeted caller can fall back to a
  full repopulate; `:rebuilt?` is the narrower model/format-rebuild signal the rebuild metric counts.

  A single run does all its work (lock + ensure-tables! + diff) on one connection, so it never deadlocks
  checking out a second from a size-1 pgvector pool. (Two *concurrent* runs — a full and a targeted one —
  are still two connections, so a size-1 pool isn't viable for that; a pool of >= 2 is recommended.)
  Session-level (not the transaction-scoped lock index-table and semantic-search use) because the run
  commits per batch and tolerates partial failure across runs, so it must not be wrapped in one
  transaction. Blocking acquire — a concurrent node makes this wait, not skip. The model is resolved only
  under the lock, so a config change during a cross-node wait can't make us embed with a stale model;
  `ensure-tables!` (which may drop+rebuild on a model/format change) runs under the lock too, so a rebuild
  can't pull the table out from under a concurrent node's in-flight run."
  [pgvector resolve-model f]
  (with-index-write-lock
    pgvector
    (fn [conn]
      ;; Per-batch commits, not one big transaction: the run tolerates partial failure across runs. The
      ;; shared lock helper forces autocommit on; ensure-tables! temporarily wraps its DDL in a transaction.
      (let [embedding-model (resolve-model)
            status          (index-table/ensure-tables! conn embedding-model)
            ;; :created (first build / healed manual drop) and :rebuilt (model/format change) both leave
            ;; an empty table, so a targeted caller must do a full repopulate rather than index one entity.
            emptied?        (contains? #{:created :rebuilt} status)]
        (when emptied?
          (log/info "library entity index: vectors table is empty (" status "); repopulating"))
        (assoc (f conn embedding-model emptied?) :rebuilt? (= :rebuilt status))))))

(defn reconcile!
  "Full reconcile of the pgvector `library_entity_index` with the appdb, blocking until it completes;
  returns {:inserted n :deleted n :unchanged n :rebuilt? bool}.
  `resolve-model` is a thunk returning the embedding model, called only once the advisory lock is held.
  The backstop for membership / name / description changes that the targeted write path doesn't hook.
  See the namespace docstring and [[with-reconcile-lock]]."
  [pgvector resolve-model]
  (with-reconcile-lock pgvector resolve-model
    (fn [conn embedding-model _emptied?]
      (reconcile-against-appdb! conn embedding-model))))

(defn reconcile-entity!
  "Targeted reconcile of one entity's doc slice, blocking until it completes; returns
  {:inserted n :deleted n :unchanged n :rebuilt? bool}.
  Recomputes the entity's full desired docs (name/description if still a library member, else none, plus
  its current `ai_context` synonyms/examples) and diffs them against its stored slice — so an
  `ai_context` delete GCs the synonym/example docs while keeping name/description, and an entity leaving
  the library GCs all of its docs. `entity-type`/`entity-local-id` come from the `osi_ai_context` write
  hook; the reconcile runs later (on a future), reading the entity's *current* appdb state.
  If `ensure-tables!` left the index empty — a first :created build or a model/format :rebuilt — this falls
  back to a full reconcile; a targeted slice alone would leave every other entity missing until the backstop.
  See the namespace docstring and [[with-reconcile-lock]]."
  [pgvector resolve-model entity-type entity-local-id]
  (with-reconcile-lock pgvector resolve-model
    (fn [conn embedding-model emptied?]
      (if emptied?
        (reconcile-against-appdb! conn embedding-model)
        (reconcile-entity-against-appdb! conn embedding-model entity-type entity-local-id)))))
