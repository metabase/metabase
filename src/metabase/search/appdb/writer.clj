(ns metabase.search.appdb.writer
  "The write pipeline that populates the appdb search index: turning a stream of documents into batched,
   resilient upserts against the active and/or pending tables.

  This is the *mechanism* half of the indexer; the *policy* half — which table is active/pending and how a
  reindex rotates them — lives in [[metabase.search.appdb.index]]. A [[metabase.search.appdb.index/ReindexMode]]
  decides, per batch, which physical tables to write to ([[write-targets]]) and whether to COMMIT each batch
  in a dedicated connection ([[metabase.search.appdb.index/commits-per-batch?]]).

  The core resilience guarantee is [[safe-batch-upsert!]]: a single batch that lands on a table which was
  dropped out from under us (a concurrent rotation on another node) triggers one transparent state refresh
  and retry; any other write failure is logged and skipped so the rest of a reindex still completes."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.document :as document]
   [metabase.search.appdb.index :as index]
   [metabase.search.appdb.index-state :as index-state]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.table :as table]
   [metabase.search.engine :as search.engine]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private insert-batch-size 150)

(defn- write-targets
  "Which [label table-name-fn] pairs the current batch upserts into.
   A committing background rebuild targets ONLY `reindex-table` — the destination captured once at the
   start of the run (see [[index-docs!]]) — so a concurrent TTL resync that transiently blanks the tracking
   atom can't redirect writes into the live active table mid-rebuild. We hand back a `(constantly
   reindex-table)` fn so per-batch resolution never re-reads the atom. Every other write dual-writes to
   active AND pending so an in-flight rebuild stays current with live edits (pending may be nil, in which
   case it is simply skipped)."
  [mode reindex-table]
  (if (and (index/commits-per-batch? mode) reindex-table)
    [[:pending (constantly reindex-table)]]
    [[:active index/active-table] [:pending index/pending-table]]))

(defn- do-batch-upsert!
  "Write entries to the given table. Returns the table name on success. No error handling."
  [table-name entries]
  (specialization/batch-upsert! table-name entries)
  table-name)

(defn- classify-upsert-error
  "Return :interrupted, :stale-table, or :unknown-error for a caught upsert exception."
  [e table-name]
  (cond
    (instance? InterruptedException e)                                          :interrupted
    (and (table/table-not-found-exception? e) (not (table/exists? table-name))) :stale-table
    :else                                                                       :unknown-error))

(defn- record-skipped-batch!
  "Log an upsert failure at ERROR level, increment analytics, and return nil so the reindex continues."
  [table-type name-before name-after e-before e-after]
  (let [wrapped (ex-info "Failed retrying search index batch upsert"
                         {:table-type                table-type
                          :table-name-before-refresh name-before
                          :table-name-after-refresh  name-after
                          :initial-exception-class   (class e-before)
                          :initial-exception-message (ex-message e-before)}
                         e-after)]
    (analytics/inc! :metabase-search/appdb-index-batches-skipped {:table-type table-type})
    (log/errorf wrapped "Error upserting search index batch into %s table; skipping batch and continuing"
                (name table-type))
    nil))

(defn- try-retry-after-sync!
  "After a stale-table error, force-refresh state and retry the upsert once into the new table.
   Returns the new table name on success, or nil if the retry also fails."
  [table-type orig-name table-name-fn entries orig-ex]
  (index-state/force-refresh! index/*state-store*)
  (if-let [new-name (table-name-fn)]
    (if (= orig-name new-name)
      ;; The refreshed state still points at the same missing table — something is genuinely wrong.
      (throw (ex-info "Currently tracked index does not exist" orig-ex {:table-name orig-name}))
      (try
        (do-batch-upsert! new-name entries)
        (catch InterruptedException ie
          (.interrupt (Thread/currentThread))
          (throw ie))
        (catch Exception e2
          (record-skipped-batch! table-type orig-name new-name orig-ex e2))))
    ;; After refresh there is no table to write to — nothing to do.
    nil))

(defn- safe-batch-upsert!
  "Write entries to the tracked table, recovering once from stale index metadata.
   Returns the table name written to, or nil when there is no tracked table or the write failed.
   Failures are logged at ERROR and skipped so the rest of a reindex can still finish."
  [table-type table-name-fn entries]
  (when-let [table-name (table-name-fn)]
    (try
      (do-batch-upsert! table-name entries)
      (catch InterruptedException ie
        (.interrupt (Thread/currentThread))
        (throw ie))
      (catch Exception e
        (case (classify-upsert-error e table-name)
          :stale-table   (try-retry-after-sync! table-type table-name table-name-fn entries e)
          :unknown-error (record-skipped-batch! table-type table-name nil e nil))))))

(defn- batch-update!
  "Upsert one batch of documents into the tables chosen by `mode` (see [[write-targets]]).
   `reindex-table` is the destination captured once for a committing background rebuild (nil otherwise).
   When the mode commits per batch, the writes run in a dedicated connection and each batch issues an
   explicit COMMIT so the partial build is visible to other connections during a long rebuild."
  [mode reindex-table documents]
  (let [commit?   (index/commits-per-batch? mode)
        do-writes (fn []
                    (let [entries         (map document/document->entry documents)
                          written         (into {} (map (fn [[label table-name-fn]]
                                                          [label (safe-batch-upsert! label table-name-fn entries)]))
                                                (write-targets mode reindex-table))
                          active-updated  (:active written)
                          pending-updated (:pending written)]
                      (when (or active-updated pending-updated)
                        (u/prog1 (->> entries (map :model) frequencies)
                          (when commit?
                            (t2/query ["commit"]))
                          (log/trace "indexed documents for " <>)))))]
    (if commit?
      ;; New connection used for performing the updates which commit periodically without impacting any outer transactions.
      (t2/with-connection [_conn (mdb/data-source)]
        (do-writes))
      (do-writes))))

(defn index-docs!
  "Index the documents from `document-reducible` using the given reindex `mode`, returning per-model counts.
   `mode` is one of [[index/background-mode]], [[index/in-place-mode]], or [[index/incremental-mode]]."
  [mode document-reducible]
  (tracing/with-span :search "search.appdb.index-docs" {:search/mode (.getSimpleName (class mode))}
    ;; Capture the destination table ONCE for a committing background rebuild: the pending table when a
    ;; rebuild is staging one, otherwise the freshly-activated active table for an initial build. Resolving
    ;; this per batch is unsafe -- a concurrent TTL resync of the tracking atom can transiently blank
    ;; :pending, which would otherwise flip the write target to the live active table mid-rebuild and
    ;; silently drop documents from the index we are about to activate.
    (let [reindex-table (when (index/commits-per-batch? mode)
                          (or (index/pending-table) (index/active-table)))]
      (transduce (comp (partition-all insert-batch-size)
                       (map (partial batch-update! mode reindex-table)))
                 (partial merge-with +)
                 document-reducible))))

(defmethod search.engine/update! :search.engine/appdb [_engine document-reducible]
  (index-docs! (index/incremental-mode) document-reducible))

(defmethod search.engine/delete! :search.engine/appdb [_engine search-model ids]
  (when (seq ids)
    (->> [(index/active-table) (index/pending-table)]
         (keep (fn [table-name]
                 (when table-name
                   {search-model (try (t2/delete! table-name :model search-model :model_id [:in (set ids)])
                                      ;; Race conditions with table being deleted, especially in tests.
                                      (catch Exception e (if (table/table-not-found-exception? e) 0 (throw e))))})))
         (apply merge-with +)
         (into {}))))
