(ns metabase.search.appdb.index
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.specialization.h2 :as h2]
   [metabase.search.appdb.specialization.postgres :as postgres]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.lease :as search.lease]
   [metabase.search.models.search-index-metadata :as search-index-metadata]
   [metabase.search.spec :as search.spec]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.string :as string]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (org.postgresql.util PSQLException)))

(comment
  h2/keep-me
  postgres/keep-me)

(set! *warn-on-reflection* true)

(def ^:private insert-batch-size 150)

(def ^:private sync-tracking-period (long (* 5 #_minutes 60e9)))

(defonce ^:private next-sync-at (atom nil))

(defonce ^:dynamic ^:private ^{:doc "This atom is often reset! in threads, so modifications should be done only when locking it first."}
  *indexes*
  (atom {:active nil, :pending nil}))

(def ^:private ^:dynamic *mocking-tables* false)

(defmethod search.engine/reset-tracking! :search.engine/appdb [_]
  (reset! *indexes* nil))

(declare exists?)

(defn- sync-tracking-atoms!
  "Sync the *indexes* atom with the current database metadata state."
  ([]
   (sync-tracking-atoms! nil))
  ([conn]
   ;; Locks the indexes so the reset! doesn't lose data written to the db by a different thread between the read and write
   (locking *indexes*
     (let [tracked (if conn
                     (search-index-metadata/indexes-on-current-connection
                      conn :appdb (search.spec/index-version-hash))
                     (search-index-metadata/indexes :appdb (search.spec/index-version-hash)))
           table-exists? (if conn (partial exists? conn) exists?)
           indexes (into {}
                         (for [[status table-name] tracked]
                           (if (table-exists? table-name)
                             [status (keyword table-name)]
                             ;; For debugging, make it clear why we are not tracking the given metadata.
                             [(keyword (name status) "not-found") (keyword table-name)])))]
       (log/debugf "Sync tracking atoms: %s" indexes)
       (reset! *indexes* indexes)))))

(defn sync-from-restored-db!
  "Re-sync tracking atoms with the current database state.
   Used after snapshot restore where the index tables are already present."
  []
  (reset! next-sync-at nil)
  (sync-tracking-atoms!))

;; This exists only to be mocked.
(defn- now [] (System/nanoTime))

(defn- sync-tracking-atoms-if-stale! []
  (when-not *mocking-tables*
    (let [current @next-sync-at
          now-ns (now)]
      (when (or (nil? current) (> now-ns current))
        ;; Use compare-and-set! to ensure only one thread wins the race and syncs
        (when (compare-and-set! next-sync-at current (+ now-ns sync-tracking-period))
          (sync-tracking-atoms!))))))

(defn active-table
  "The table against which we should currently make search queries."
  []
  (sync-tracking-atoms-if-stale!)
  (:active @*indexes*))

(defn- pending-table
  "A partially populated table that will take over from [[active-table]] when it is done."
  []
  (sync-tracking-atoms-if-stale!)
  (:pending @*indexes*))

(defn gen-table-name
  "Generate a unique table name to use as a search index table. If no suffix is provided, none will be used"
  ([]
   (gen-table-name ""))
  ([suffix]
   (keyword (str (str/replace (str "search_index__" (u/lower-case-en (u/generate-nano-id))) #"-" "_") suffix))))

(defn- table-name [kw]
  (cond-> (name kw)
    (= :h2 (mdb/db-type)) u/upper-case-en))

(defn exists?
  "Whether the given index `table` actually exists in the appdb (the tracked active/pending table can be
  briefly stale relative to what has been dropped)."
  ([table]
   (when table
     (t2/exists? :information_schema.tables :table_name (table-name table))))
  ([conn table]
   (when table
     (t2/exists? :conn conn :information_schema.tables :table_name (table-name table)))))

(defn- drop-table! [table]
  (boolean
   (when table
     (search.lease/do-with-ddl-connection
      #(t2/query % (sql.helpers/drop-table :if-exists (keyword (table-name table))))))))

(defn- orphan-indexes []
  (map (comp keyword u/lower-case-en :table_name)
       (t2/query {:select [:ist.table_name]
                  :from   [[:information_schema.tables :ist]]
                  :where  [:and
                           [:= :ist.table_schema :%current_schema]
                           [:or
                            [:like [:lower :ist.table_name] "search\\_index\\_\\_%"]
                            ;; legacy table names
                            [:in [:lower :ist.table_name]
                             ["search_index" "search_index_next" "search_index_retired"]]]
                           ;; Exclude temp tables — they are managed by with-temp-index-table
                           [:not-like [:lower :ist.table_name] "%\\_temp"]
                           [:not [:exists ^:allow-subquery {:select [1]
                                                            :from   [[(t2/table-name :model/SearchIndexMetadata) :sim]]
                                                            :where  [:and
                                                                     [:= :sim.engine "appdb"]
                                                                     [:= [:lower :sim.index_name] [:lower :ist.table_name]]]}]]]})))

(defn- delete-obsolete-tables! []
  ;; Delete metadata around indexes that are no longer needed.
  (search.lease/do-with-ddl-connection
   #(search-index-metadata/delete-obsolete! % (search.spec/index-version-hash)))
  ;; Drop any indexes that are no longer referenced.
  (let [dropped (volatile! [])]
    (doseq [table (orphan-indexes)]
      (try
        (search.lease/do-with-ddl-connection
         #(t2/query % (sql.helpers/drop-table table)))
        (vswap! dropped conj table)
        ;; Deletion could fail if it races with other instances
        (catch Exception e
          (log/warnf "Failed to drop stale index %s: %s" table (ex-message e)))))
    (log/infof "Dropped %d stale indexes: %s" (count @dropped) @dropped)))

(defn- ->db-type [t]
  (get {:pk :int, :timestamp :timestamp-with-time-zone} t t))

(defn- ->db-column [c]
  (or (get {:id         :model_id
            :created-at :model_created_at
            :updated-at :model_updated_at}
           c)
      (keyword (u/->snake_case_en (name c)))))

(def ^:private not-null
  #{:archived :name})

(def ^:private default
  {:archived false})

;; If this fails, we'll need to increase the size of :model below
(assert (>= 32 (transduce (map (comp count name)) max 0 search.config/all-models)))

(def ^:private base-schema
  (into [[:model [:varchar 32] :not-null]
         [:display_data :text :not-null]
         [:legacy_input :text :not-null]
         ;; useful for tracking the speed and age of the index
         [:created_at :timestamp-with-time-zone
          [:default ^:allow-raw-sql [:raw "CURRENT_TIMESTAMP"]]
          :not-null]
         [:updated_at :timestamp-with-time-zone :not-null]]
        (keep (fn [[k t]]
                (when t
                  (into [(->db-column k) (->db-type t)]
                        (concat
                         (when (not-null k)
                           [:not-null])
                         (when-some [d (default k)]
                           [[:default d]]))))))
        search.spec/attr-types))

(defn create-table!
  "Create an index table with the given name. Should fail if it already exists."
  [table-name]
  ;; Always a separate transaction: PostgreSQL needs the post-create indexes committed before returning, and DDL
  ;; must never run on a caller's ambient transaction (it would implicitly commit it on H2 and MySQL).
  (search.lease/do-with-ddl-connection
   (fn [conn]
     (t2/query conn
               (-> (sql.helpers/create-table table-name)
                   (sql.helpers/with-columns (specialization/table-schema base-schema))))
     (let [table-name (name table-name)]
       (doseq [stmt (specialization/post-create-statements table-name table-name)]
         (t2/query conn stmt))))))

(defn- create-fresh-leased-pending!
  []
  (let [table-name (gen-table-name)]
    (log/infof "Creating owner-isolated pending index %s for lang %s" table-name (i18n/site-locale-string))
    (try
      ;; Reserve the name before creating the table, so orphan cleanup can never see a newly created leased table as
      ;; unreferenced. If creation fails, the next owner atomically replaces this pending reservation.
      (search.lease/do-with-ddl-connection
       #(search-index-metadata/replace-pending-on-current-connection!
         % :appdb (search.spec/index-version-hash) table-name))
      (create-table! table-name)
      (sync-tracking-atoms!)
      table-name
      (catch Throwable e
        ;; A table created just before ownership was lost is deliberately left unreferenced and will be collected by
        ;; the ordinary orphan cleanup. Never let a stale owner delete a table a replacement may have adopted.
        ;; An obsolete-locale owner must not sync either: its tracking would be for the old locale's tables.
        (when-not (= ::search.lease/coordinate-obsolete (:type (ex-data e)))
          (sync-tracking-atoms!))
        (throw e)))))

(defn maybe-create-pending!
  "Create a search index table if one doesn't exist. Record and return the name of the table, regardless."
  []
  (locking *indexes*
    (cond
      *mocking-tables*
      ;; In a test where the atoms are the source of truth, create a new table if necessary.
      (or (pending-table)
          (let [table-name (gen-table-name)]
            (create-table! table-name)
            (swap! *indexes* assoc :pending table-name) table-name))

      (search.lease/leased?)
      ;; Never reuse a crashed or replaced owner's partially populated table. A stale worker captured its own table
      ;; name and transactional fencing prevents it from mutating or promoting this replacement.
      (create-fresh-leased-pending!)

      :else
      ;; The database is the source of truth
      (let [{:keys [pending]} (sync-tracking-atoms!)]
        (or pending
            (let [table-name (gen-table-name)]
              (log/infof "Creating pending index %s for lang %s" table-name (i18n/site-locale-string))
              ;; We may fail to insert a new metadata row if we lose a race with another instance.
              (when (search.lease/do-with-ddl-connection
                     #(search-index-metadata/create-pending! % :appdb (search.spec/index-version-hash) table-name))
                (try
                  (create-table! table-name)
                  (catch Exception e
                    (log/errorf "Error creating pending index table, cleaning up metadata: %s" (ex-message e))
                    (try
                      (t2/with-connection [safe-conn (mdb/app-db)]
                        (t2/delete! :conn safe-conn :model/SearchIndexMetadata :index_name (name table-name)))
                      (catch Exception del-e
                        (log/warnf "Error clearing out search metadata after failure: %s" (ex-message del-e))))
                    (sync-tracking-atoms!))))
              (let [pending (:pending (sync-tracking-atoms!))]
                (log/infof "New pending index %s" pending)
                pending)))))))

(defn- analyze-table!
  "Refresh the table's statistics so size estimates are accurate as soon as it becomes active.
  Best-effort: a failure here must never block activation."
  [table-name]
  (try
    (specialization/analyze-table! table-name)
    (catch Exception e
      (log/warnf "Failed to analyze index table %s: %s" table-name (ex-message e)))))

(defn activate-table!
  "Make the pending index active if it exists. Returns true if it did so."
  []
  ;; Check before sync-tracking-atoms! can replace this process's current-locale tracking with the old coordinate.
  (search.lease/assert-coordinate-current!)
  (locking *indexes*
    (if *mocking-tables*
      ;; The atoms are the only source of truth, we must not update the metadata.
      (boolean
       (when-let [pending (:pending @*indexes*)]
         (analyze-table! pending)
         (search.lease/assert-current!)
         (reset! *indexes* {:pending nil, :active pending}) true))
      ;; Ensure the metadata is updated and pruned.
      (let [{:keys [pending]} (sync-tracking-atoms!)]
        (log/infof "Activating pending index %s" pending)
        (when pending
          (analyze-table! pending)
          (let [active (search.lease/do-with-ddl-connection
                        #(some-> (search-index-metadata/active-pending-on-current-connection!
                                  % :appdb (search.spec/index-version-hash) pending)
                                 keyword))]
            (when-not (= active pending)
              ;; Another process replaced or retired our pending metadata between the sync and the fenced
              ;; transaction; the table we built is left for orphan cleanup.
              (sync-tracking-atoms!)
              (throw (ex-info "Pending index was replaced before it could be activated"
                              {:pending pending, :active active})))
            (reset! *indexes* {:pending nil :active active})
            (log/infof "Activated pending index %s" active)))
        ;; Clean up while we're here
        (delete-obsolete-tables!)
        ;; Did *we* do a rotation?
        (boolean pending)))))

(defn- strip-junk-chars
  "Replace control characters (\\p{Cc}: C0 controls including \\t \\n \\r, DEL, C1 controls) and surrogate
   code points (\\p{Cs}) with a single space so they act as token boundaries for full-text indexing instead
   of accidentally fusing adjacent words. Postgres also outright rejects literal NUL (0x00) in text columns,
   so this is required to keep reindex batches from aborting. Non-string values pass through unchanged."
  [v]
  (cond-> v (string? v) (str/replace #"(?U)[\p{Cc}\p{Cs}]" " ")))

(defn- document->entry [entity]
  (let [entity (update-vals entity strip-junk-chars)]
    (-> entity
        (select-keys (conj search.spec/attr-columns :model :display_data :legacy_input))
        (set/rename-keys {:id :model_id
                          :created_at :model_created_at
                          :updated_at :model_updated_at})
        (assoc :updated_at :%now)
        (update :display_data json/encode)
        ;; legacy_input is already JSON-encoded in ->document; encode only if it's still a map (e.g., in tests)
        (update :legacy_input #(if (string? %) % (json/encode %)))
        (dissoc :native_query)
        (merge (specialization/extra-entry-fields entity)))))

(defn- table-not-found-exception? [e]
  ;; Use with care, obviously this can give false positives if used with a query that's *actually* malformed.
  ;; TODO we should handle the MySQL and MariaDB flavors here too
  (or (instance? PSQLException (ex-cause e))
      (= mdb/jdbc-sql-syntax-error-exception-classname
         (some-> e ex-cause class .getName))))

(defn- retry-upsert-ex [table-type table-name-before table-name-after e-before e-after]
  (ex-info "Failed retrying search index batch upsert"
           {:table-type                table-type
            :table-name-before-refresh table-name-before
            :table-name-after-refresh  table-name-after
            :initial-exception-class   (class e-before)
            :initial-exception-message (ex-message e-before)}
           e-after))

(defn- safe-batch-upsert!
  "A version of batch-upsert! that no-ops for missing indexes, and handles stale index tracking metadata.

  Returns the name of the table that was written to, or nil if no table is being tracked or a
  recoverable batch failure was logged and skipped. Interrupts and unrecoverable retry failures
  propagate to the caller.

  We recover gracefully the first time if the tracking atom was stale, but do not check again on retry."
  [conn table-type table-name-fn entries]
  ;; For convenience, no-op if we are not tracking any table.
  (when-let [table-name (table-name-fn)]
    (let [upsert! (fn [t]
                    ;; A failed statement aborts the surrounding transaction on PostgreSQL. Isolate every attempt in
                    ;; a savepoint so catching a skippable failure here does not roll back a successful write to the
                    ;; other index table, and so a stale-table retry can still issue SQL on the same connection.
                    (t2.conn/do-with-transaction
                     conn
                     {}
                     (fn [_]
                       (specialization/batch-upsert-on-connection! conn t entries)))
                    t)]
      (try
        (upsert! table-name)
        (catch InterruptedException ie
          (.interrupt (Thread/currentThread))
          (throw ie))
        (catch Exception e
          ;; If the failure is a legitimately non-existent table, refresh tracking and retry once.
          (if (and (table-not-found-exception? e) (not (exists? conn table-name)))
            (when-let [refreshed-table-name (do (sync-tracking-atoms! conn) (table-name-fn))]
              (if (= table-name refreshed-table-name)
                (throw (ex-info "Currently tracked index does not exist" e {:table-name table-name}))
                (try
                  (upsert! refreshed-table-name)
                  (catch InterruptedException ie
                    (.interrupt (Thread/currentThread))
                    (throw ie))
                  (catch Exception e2
                    (if (table-not-found-exception? e2)
                      (throw (retry-upsert-ex table-type table-name refreshed-table-name e e2))
                      (do (analytics/inc! :metabase-search/appdb-index-batches-skipped {:table-type table-type})
                          (log/errorf "Error upserting search index batch into %s table %s after refresh; skipping batch and continuing: %s"
                                      (name table-type) refreshed-table-name (ex-message e2))
                          nil))))))
            ;; Any other failure - log and continue so reindex can still finish.
            (do (analytics/inc! :metabase-search/appdb-index-batches-skipped {:table-type table-type})
                (log/errorf "Error upserting search index batch into %s table %s; skipping batch and continuing: %s"
                            (name table-type) table-name (ex-message e))
                nil)))))))

(defn- batch-update!
  "Create the given search index entries in bulk. Commits after each batch.

  A full reindex passes the `reindex-table` captured by [[index-docs!]] and writes only there. Incremental and
  in-place updates pass nil and dual-write to the active and pending tables so an in-progress rebuild stays current."
  [reindex-table documents]
  ;; Protect against tests that nuke the appdb
  (when config/is-test?
    (when-let [table (active-table)]
      (when (not (exists? table))
        (log/warnf "Unable to find table %s and no longer tracking it as active", table)
        (swap! *indexes* assoc :active nil)))
    (when-let [table (pending-table)]
      (when (not (exists? table))
        (log/warnf "Unable to find table %s and no longer tracking it as pending", table)
        (swap! *indexes* assoc :pending nil))))

  (let [reindexing? (some? reindex-table)
        leased?     (search.lease/leased?)
        do-writes   (fn [conn]
                      ;; Outside a leased rebuild this is a cheap no-op. During all rebuild modes (including in-place
                      ;; and force-sync) it stops a stale owner at the next batch boundary.
                      (search.lease/throw-if-lost!)
                      (let [entries (map document->entry documents)
                            updated (if reindexing?
                                      (safe-batch-upsert! conn :pending (constantly reindex-table) entries)
                                      ;; Either table may legitimately be absent.
                                      (let [active-updated  (safe-batch-upsert! conn :active active-table entries)
                                            pending-updated (safe-batch-upsert! conn :pending pending-table entries)]
                                        (or active-updated pending-updated)))]
                        (when updated
                          (u/prog1 (->> entries (map :model) frequencies)
                            (log/trace "indexed documents for " <>)))))]
    (cond
      leased?
      ;; Reuse the batch writer for both the ownership fence and write. This covers staged, force-sync, and in-place
      ;; rebuilds without acquiring a third connection alongside the streaming reader and batch writer.
      (search.lease/do-with-mutation-connection do-writes)

      reindexing?
      ;; The ambient connection is the streaming reader's transaction, so write on a fresh connection to keep each
      ;; batch committing on its own.
      (t2/with-connection [conn (mdb/app-db)]
        (do-writes conn))

      :else
      (t2/with-connection [conn]
        (do-writes conn)))))

(defn clear-active-table!
  "Delete the active table's contents on the lease's mutation connection."
  [table]
  (search.lease/do-with-mutation-connection #(t2/delete! :conn % table)))

(defn index-docs!
  "Indexes the documents. The context should be :search/updating or :search/reindexing.
   Context should be :search/updating or :search/reindexing to help control how to manage the updates"
  [context document-reducible]
  (tracing/with-span :search "search.appdb.index-docs" {:search/context (name context)}
    (let [reindexing?   (and (= :search/reindexing context) (not search.ingestion/*force-sync*))
          ;; Capture the destination table once for the whole reindex: the pending table when a rebuild is staging
          ;; one, otherwise the active table (an initial build populates the freshly activated table directly).
          ;; Resolving it per batch is unsafe: a concurrent TTL resync can transiently blank :pending, which would
          ;; redirect writes to the live active table mid-rebuild and silently drop documents from the new index.
          reindex-table (when reindexing? (or (pending-table) (active-table)))]
      (transduce (comp (partition-all insert-batch-size)
                       (map (partial batch-update! reindex-table)))
                 (partial merge-with +)
                 document-reducible))))

(defmethod search.engine/update! :search.engine/appdb [_engine document-reducible]
  (index-docs! :search/updating document-reducible))

(defmethod search.engine/delete! :search.engine/appdb [_engine search-model ids]
  (when (seq ids)
    (->> [(active-table) (pending-table)]
         (keep (fn [table-name]
                 (when table-name
                   {search-model (try (t2/delete! table-name :model search-model :model_id [:in (set ids)])
                                      ;; Race conditions with table being deleted, especially in tests.
                                      (catch Exception e (if (table-not-found-exception? e) 0 (throw e))))})))
         (apply merge-with +)
         (into {}))))

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

(defn reset-index!
  "Ensure we have a blank slate; in case the table schema or stored data format has changed."
  []
  (log/infof "Resetting appdb index for version %s, active table: %s" (search.spec/index-version-hash)
             (pr-str (active-table)))
  (letfn [(reset-logic []
            ;; A leased reset atomically replaces pending metadata in maybe-create-pending!. Do not let a stale owner
            ;; pre-delete a replacement owner's metadata or clear the process-wide tracking atom.
            (when-let [table-name (and (not (search.lease/leased?)) (pending-table))]
              (when-not *mocking-tables*
                (let [deleted (search.lease/do-with-ddl-connection
                               #(search-index-metadata/delete-pending-index! % :appdb (search.spec/index-version-hash) table-name))]
                  (when (pos? deleted)
                    (log/infof "Deleted %d pending indices" deleted))))
              (swap! *indexes* assoc :pending nil))
            (maybe-create-pending!)
            (activate-table!))]
    (if (or search.ingestion/*force-sync* (search.lease/leased?))
      (reset-logic)
      ;; Creates and tracks tables with a unique transaction so the empty tables are available to other threads
      ;; even while the initial startup and data load may be happening
      (t2/with-connection [_ (mdb/data-source)]
        (reset-logic)))))

(defn ensure-ready!
  "Ensure the index is ready to be populated. Return false if it was already ready."
  [& {:keys [force-reset?]}]
  ;; Be extra careful against races on initializing the setting
  (locking *indexes*
    (when-not *mocking-tables*
      (when (nil? (active-table))
        (sync-tracking-atoms!)))
    (when (or force-reset? (not (exists? (active-table))))
      (reset-index!))))

(defmacro with-temp-index-table
  "Create a temporary index table for the duration of the body. Uses the existing index if we're already mocking."
  [& body]
  `(if @#'*mocking-tables*
     ~@body
     (let [table-name#      (gen-table-name "_temp")
           version#         (str (string/random-string 8) "-temp")]
       (binding [*mocking-tables* true
                 *indexes*        (atom {:active table-name#})]
         (try
           (t2/insert! :model/SearchIndexMetadata {:engine     :appdb
                                                   :version    version#
                                                   :lang_code  (i18n/site-locale-string)
                                                   :status     :pending
                                                   :index_name (name table-name#)})
           (create-table! table-name#)
           ~@body
           (finally
             (#'drop-table! table-name#)
             (t2/delete! :model/SearchIndexMetadata :version version#)))))))
