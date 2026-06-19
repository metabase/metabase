(ns metabase.search.appdb.index
  "The appdb search index state machine: which physical table is active/pending, how reindexes rotate them
   ([[ReindexMode]]), and the search queries that read from the active table. The write pipeline that
   actually populates these tables lives in [[metabase.search.appdb.writer]].

   ## Concurrency

   Three coordination mechanisms cooperate; keep them straight:

   1. **Cluster lock** (acquired at the appdb engine's init!/reindex! choke points in
      [[metabase.search.appdb.core]]): serializes whole reindex runs across the cluster, so at most one node
      rebuilds at a time.
   2. **Node-local [[index-lock]]**: serializes the multi-step DDL sequences (create-pending → activate) and
      [[ensure-ready!]] within a single JVM, so two threads on one node never both build a new index.
   3. **TTL state cache** ([[*state-store*]]): each node caches the {:active :pending} table names for a few
      minutes; [[index-state/force-refresh!]] re-reads immediately after a node performs a rotation, and the
      write pipeline force-refreshes on a stale-table error.

   ## Reindex modes

   Writes go to different physical tables depending on what is happening (see [[metabase.search.appdb.writer]]):
     - a **full reindex** builds a fresh :pending table while the old :active table keeps serving queries,
       then atomically rotates pending → active;
     - an **in-place reindex** clears and repopulates the :active table directly (no pending);
     - **incremental updates** write to *both* :active and :pending, so a rebuild in progress stays current."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.index-state :as index-state]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.table :as table]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.models.search-index-metadata :as search-index-metadata]
   [metabase.search.spec :as search.spec]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; --------------------------------------- Index state ---------------------------------------------

(defonce ^{:dynamic true
           :doc "Lazily-refreshed view of the search_index_metadata table.
                 Tests bind this to a MockStateStore so no DB interaction is needed for index state."}
  *state-store*
  (index-state/db-backed-store
   (fn []
     (reduce-kv (fn [acc status table-name]
                  (let [kw (keyword table-name)]
                    (if (table/exists? kw)
                      (assoc acc status kw)
                      (do (log/debugf "Search index %s table %s not found; not tracking it" status table-name)
                          acc))))
                {}
                (search-index-metadata/indexes :appdb (search.spec/index-version-hash))))))

(defonce ^{:private true
           :doc "Node-local monitor guarding the multi-step DDL sequences (create-pending → activate) so
                 concurrent threads on the same node don't both attempt to build a new index."}
  index-lock (Object.))

(defmethod search.engine/reset-tracking! :search.engine/appdb [_]
  (index-state/set-state! *state-store* {:active nil :pending nil}))

(defn sync-from-restored-db!
  "Re-sync index tracking with the current database state.
   Used after snapshot restore where the index tables are already present."
  []
  (index-state/force-refresh! *state-store*))

(defn active-table
  "The table against which we should currently make search queries."
  []
  (:active (index-state/current-state *state-store*)))

(defn pending-table
  "A partially populated table that will take over from [[active-table]] when it is done."
  []
  (:pending (index-state/current-state *state-store*)))

(defn state-snapshot
  "Return the current cached {:active …, :pending …} state. For diagnostics only."
  []
  (index-state/current-state *state-store*))

;;; --------------------------------------- Rotation ------------------------------------------------

(defn maybe-create-pending!
  "Create a pending index table if one does not already exist. Returns the pending table name, or nil."
  []
  (locking index-lock
    (or (pending-table)
        ;; We may fail to insert a new metadata row if we lose a race with another instance.
        (let [table-name (table/gen-table-name)]
          (log/infof "Creating pending index %s for lang %s" table-name (i18n/site-locale-string))
          (when (search-index-metadata/create-pending! :appdb (search.spec/index-version-hash) table-name)
            (try
              (table/create-table! table-name)
              (catch Exception e
                (log/error e "Error creating pending index table, cleaning up metadata")
                (try
                  (t2/with-connection [safe-conn (mdb/app-db)]
                    (t2/delete! :conn safe-conn :model/SearchIndexMetadata :index_name (name table-name)))
                  (catch Exception del-e
                    (log/warn del-e "Error clearing out search metadata after failure"))))))
          (let [pending (:pending (index-state/force-refresh! *state-store*))]
            (log/infof "New pending index %s" pending)
            pending)))))

(defn- analyze-table!
  "Refresh the table's statistics so size estimates are accurate as soon as it becomes active.
  Best-effort: a failure here must never block activation."
  [table-name]
  (try
    (specialization/analyze-table! table-name)
    (catch Exception e
      (log/warnf e "Failed to analyze index table %s" table-name))))

(defn activate-table!
  "Make the pending index active if it exists. Returns true if a rotation occurred."
  []
  (locking index-lock
    (let [{:keys [pending]} (index-state/force-refresh! *state-store*)]
      (log/infof "Activating pending index %s" pending)
      (when pending
        (analyze-table! pending)
        (let [active (keyword (search-index-metadata/active-pending! :appdb (search.spec/index-version-hash)))]
          (index-state/set-state! *state-store* {:pending nil :active active})
          (log/infof "Activated pending index %s" active)))
      ;; Clean up while we're here — skip in mock mode to avoid touching production metadata
      (when (index-state/db-backed? *state-store*)
        (table/delete-obsolete-tables!))
      ;; Did *we* do a rotation?
      (boolean pending))))

(defn reset-index!
  "Ensure there is a fresh, empty index table to populate; in case the table schema or stored data format
   has changed. Returns:

     :activated — a new empty table was made active immediately, because no complete index was serving
                  (genuine first-time creation). Partial results then appear as soon as the caller populates.
     :pending   — a complete index is still serving, so the replacement was created as :pending and the old
                  :active table is left serving. The caller MUST populate the pending table and then call
                  [[activate-table!]], so search is never blanked out mid-rebuild.

   The choice hinges on whether we have a usable index to keep serving — never throw away the only thing
   answering queries just to put an empty table in its place."
  []
  (log/infof "Resetting appdb index for version %s, active table: %s" (search.spec/index-version-hash)
             (pr-str (active-table)))
  (letfn [(reset-logic []
            ;; Discard any in-progress pending table before starting fresh.
            (when-let [table-name (pending-table)]
              (let [deleted (search-index-metadata/delete-index! :appdb (search.spec/index-version-hash) table-name)]
                (when (pos? deleted)
                  (log/infof "Deleted %d pending indices" deleted)))
              (index-state/set-state! *state-store* {:active (active-table) :pending nil}))
            (let [serving? (boolean (and (active-table) (table/exists? (active-table))))]
              (maybe-create-pending!)
              (if serving?
                :pending
                ;; Nothing usable is serving — activate the fresh empty table now for partial results ASAP.
                (do (activate-table!) :activated))))]
    (if search.ingestion/*force-sync*
      (reset-logic)
      ;; Use a dedicated connection so the empty tables become visible to other connections
      ;; even while the initial data load is happening in an outer transaction.
      (t2/with-connection [_ (mdb/data-source)]
        (reset-logic)))))

(defn ensure-ready!
  "Ensure the index is ready to be populated. Returns nil when an existing index was already in place and no
   reset was needed, otherwise the [[reset-index!]] signal (:activated or :pending) telling the caller how to
   populate it."
  [& {:keys [force-reset?]}]
  (locking index-lock
    (when (nil? (active-table))
      (index-state/force-refresh! *state-store*))
    (when (or force-reset? (not (table/exists? (active-table))))
      (reset-index!))))

;;; --------------------------------------- Reindex modes -------------------------------------------

(defprotocol ReindexMode
  "Strategy describing how one population pass writes its batches and rotates tables. There are three:
   a background full rebuild, an in-place rebuild, and incremental live updates (see the namespace
   docstring's 'Reindex modes'). [[prepare!]] and [[finish!]] bracket a *reindex*; the live update path
   and the initial populate reuse only the per-batch write behaviour ([[commits-per-batch?]] + the
   derived [[write-targets]])."
  (prepare! [mode]
    "DDL to run before populating: create a fresh pending table, clear the active one, or nothing.")
  (commits-per-batch? [mode]
    "True if each batch should COMMIT in a dedicated connection so the partial build is visible to other
     connections and nodes during a long rebuild. Always false under [[search.ingestion/*force-sync*]],
     which runs synchronously inside the caller's own transaction.")
  (finish! [mode]
    "DDL to run after populating: activate the pending table (or just clean up). Returns true if a
     rotation occurred."))

(defrecord BackgroundReindex []
  ReindexMode
  ;; Build a brand-new pending table while the current active table keeps serving queries.
  (prepare! [_] (maybe-create-pending!) nil)
  (commits-per-batch? [_] (not search.ingestion/*force-sync*))
  (finish! [_] (activate-table!)))

(defrecord InPlaceReindex []
  ReindexMode
  ;; Empty the active table and repopulate it directly — no pending table, no rotation.
  (prepare! [_] (when-let [t (active-table)] (t2/delete! t)) nil)
  (commits-per-batch? [_] false)
  (finish! [_] (activate-table!)))

(defrecord IncrementalUpdate []
  ReindexMode
  ;; Live edits: no DDL, just keep both tables current.
  (prepare! [_] nil)
  (commits-per-batch? [_] false)
  (finish! [_] false))

(defn background-mode
  "A full reindex into a fresh pending table (the active table keeps serving until rotation)."
  [] (->BackgroundReindex))

(defn in-place-mode
  "A reindex that clears and repopulates the active table directly."
  [] (->InPlaceReindex))

(defn incremental-mode
  "The live-update path: dual-write to active and pending, no rotation."
  [] (->IncrementalUpdate))

;;; ------------------------------------------ Search -----------------------------------------------

(defn when-index-created
  "Return creation time of the active index, or nil if there is none."
  []
  (t2/select-one-fn :created_at
                    :model/SearchIndexMetadata
                    :engine :appdb
                    :version (search.spec/index-version-hash)
                    :lang_code (i18n/site-locale-string)
                    :status :active
                    {:order-by [[:created_at :desc]]}))

(defn search-query
  "Query fragment for all models corresponding to a query parameter `:search-term`."
  ([search-term search-ctx]
   (search-query search-term search-ctx [:model_id :model]))
  ([search-term search-ctx select-items]
   (when-let [index-table (active-table)]
     (specialization/base-query index-table search-term search-ctx select-items))))

(defn search
  "Use the index table to search for records."
  [search-term & [search-ctx]]
  (map (juxt :model :name)
       (t2/query (search-query search-term search-ctx [:model :name]))))

;;; --------------------------------------- Test helpers --------------------------------------------

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-temp-index-table
  "Create a single temporary index table for the duration of the body, for tests that write to and read from
   one fixed index table (ingestion, scoring, search).

   Binds *state-store* to an isolated MockStateStore so DDL within the body doesn't touch the real
   search_index_metadata records. NOTE: because the mock's force-refresh! is a no-op, this does NOT support
   the build/rotate flow — [[maybe-create-pending!]]/[[activate-table!]] can't track tables they create, and
   rotation would still mutate real-version metadata. Tests that exercise init!/reindex! must instead bind
   [[metabase.search.spec/*testing-only-index-version-hash*]] and use the real store.

   Re-entrant: when already inside a with-temp-index-table (the state store is a mock), it reuses the existing
   temp table rather than creating a new one, so nested scopes share a single index and content accumulates
   across them — several callers (e.g. nested with-search-items-in-root-collection) rely on this."
  [& body]
  `(if-not (index-state/db-backed? *state-store*)
     (do ~@body)
     (let [table-name# (table/gen-table-name "_temp")
           version#    (str (string/random-string 8) "-temp")]
       (binding [*state-store* (index-state/mock-store {:active table-name#})]
         (try
           (t2/insert! :model/SearchIndexMetadata {:engine     :appdb
                                                   :version    version#
                                                   :lang_code  (i18n/site-locale-string)
                                                   :status     :pending
                                                   :index_name (name table-name#)})
           (table/create-table! table-name#)
           ~@body
           (finally
             (table/drop-table! table-name#)
             (t2/delete! :model/SearchIndexMetadata :version version#)))))))
