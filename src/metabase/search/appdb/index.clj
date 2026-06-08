(ns metabase.search.appdb.index
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.index-state :as index-state]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.specialization.h2 :as h2]
   [metabase.search.appdb.specialization.postgres :as postgres]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.models.search-index-metadata :as search-index-metadata]
   [metabase.search.spec :as search.spec]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.string :as string]
   [toucan2.core :as t2])
  (:import
   (org.h2.jdbc JdbcSQLSyntaxErrorException)
   (org.postgresql.util PSQLException)))

(comment
  h2/keep-me
  postgres/keep-me)

(set! *warn-on-reflection* true)

(def ^:private insert-batch-size 150)

(defn- table-name [kw]
  (cond-> (name kw)
    (= :h2 (mdb/db-type)) u/upper-case-en))

(defn- exists? [table]
  (when table
    (t2/exists? :information_schema.tables :table_name (table-name table))))

;;; State tracking — which physical tables are currently active and pending.
;;;
;;; The *state-store* holds a lazily-refreshed view of the search_index_metadata table.
;;; Tests bind this to a MockStateStore so no DB interaction is needed for index state.
;;;
;;; A separate index-lock guards the multi-step DDL sequences (create-pending → activate)
;;; so that concurrent threads on the same node don't both attempt to build a new index.
(defonce ^:dynamic *state-store*
  (index-state/db-backed-store
   (fn []
     (reduce-kv (fn [acc status table-name]
                  (let [kw (keyword table-name)]
                    (if (exists? kw)
                      (assoc acc status kw)
                      (do (log/debugf "Search index %s table %s not found; not tracking it" status table-name)
                          acc))))
                {}
                (search-index-metadata/indexes :appdb (search.spec/index-version-hash))))))

(defonce ^:private index-lock (Object.))

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

(defn- pending-table
  "A partially populated table that will take over from [[active-table]] when it is done."
  []
  (:pending (index-state/current-state *state-store*)))

(defn gen-table-name
  "Generate a unique table name to use as a search index table. If no suffix is provided, none will be used"
  ([]
   (gen-table-name ""))
  ([suffix]
   (keyword (str (str/replace (str "search_index__" (u/lower-case-en (u/generate-nano-id))) #"-" "_") suffix))))

(defn- drop-table! [table]
  (boolean
   (when table
     (t2/query (sql.helpers/drop-table :if-exists (keyword (table-name table)))))))

(defn- orphan-indexes []
  (map (comp keyword u/lower-case-en :table_name)
       (t2/query {:select [:table_name]
                  :from   :information_schema.tables
                  :where  [:and
                           [:= :table_schema :%current_schema]
                           [:or
                            [:like [:lower :table_name] [:inline "search\\_index\\_\\_%"]]
                            ;; legacy table names
                            [:in [:lower :table_name]
                             (mapv #(vector :inline %) ["search_index" "search_index_next" "search_index_retired"])]]
                           ;; Exclude temp tables — they are managed by with-temp-index-table
                           [:not-like [:lower :table_name] [:inline "%\\_temp"]]
                           [:not-in [:lower :table_name]
                            {:select [:%lower.index_name]
                             :from   [(t2/table-name :model/SearchIndexMetadata)]
                             :where  [:= :engine [:inline "appdb"]]}]]})))

(defn- delete-obsolete-tables! []
  ;; Delete metadata around indexes that are no longer needed.
  (search-index-metadata/delete-obsolete! (search.spec/index-version-hash))
  ;; Drop any indexes that are no longer referenced.
  (let [dropped (volatile! [])]
    (doseq [table (orphan-indexes)]
      (try
        (t2/query (sql.helpers/drop-table table))
        (vswap! dropped conj table)
        ;; Deletion could fail if it races with other instances
        (catch Exception e
          (log/warnf e "Failed to drop stale index %s" table))))
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
          [:default [:raw "CURRENT_TIMESTAMP"]]
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
  ;; Create with a separate transaction so that postgresql will complete the index creations before returning,
  ;; even when already running in a transaction
  (t2/with-transaction [_ (mdb/app-db)]
    (-> (sql.helpers/create-table table-name)
        (sql.helpers/with-columns (specialization/table-schema base-schema))
        t2/query)
    (let [table-name (name table-name)]
      (doseq [stmt (specialization/post-create-statements table-name table-name)]
        (t2/query stmt)))))

(defn maybe-create-pending!
  "Create a pending index table if one does not already exist. Returns the pending table name, or nil."
  []
  (locking index-lock
    (or (pending-table)
        ;; We may fail to insert a new metadata row if we lose a race with another instance.
        (let [table-name (gen-table-name)]
          (log/infof "Creating pending index %s for lang %s" table-name (i18n/site-locale-string))
          (when (search-index-metadata/create-pending! :appdb (search.spec/index-version-hash) table-name)
            (try
              (create-table! table-name)
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

(defn activate-table!
  "Make the pending index active if it exists. Returns true if a rotation occurred."
  []
  (locking index-lock
    (let [{:keys [pending]} (index-state/force-refresh! *state-store*)]
      (log/infof "Activating pending index %s" pending)
      (when pending
        (let [active (keyword (search-index-metadata/active-pending! :appdb (search.spec/index-version-hash)))]
          (index-state/set-state! *state-store* {:pending nil :active active})
          (log/infof "Activated pending index %s" active)))
      ;; Clean up while we're here — skip in mock mode to avoid touching production metadata
      (when (index-state/db-backed? *state-store*)
        (delete-obsolete-tables!))
      ;; Did *we* do a rotation?
      (boolean pending))))

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

(defn table-not-found-exception?
  "True if `e` looks like a missing-table error from the DB driver.
   Used to detect stale index table references — the caller should refresh state and retry.
   NOTE: can produce false positives on genuinely malformed queries, so only use in contexts
   where you have already verified the table name came from the index state store."
  [e]
  (or (instance? PSQLException (ex-cause e))
      (instance? JdbcSQLSyntaxErrorException (ex-cause e))))

(defn state-snapshot
  "Return the current cached {:active …, :pending …} state. For diagnostics only."
  []
  (index-state/current-state *state-store*))

(defn- do-batch-upsert!
  "Write entries to the given table. Returns the table name on success. No error handling."
  [table-name entries]
  (specialization/batch-upsert! table-name entries)
  table-name)

(defn- classify-upsert-error
  "Return :interrupted, :stale-table, or :unknown-error for a caught upsert exception."
  [e table-name]
  (cond
    (instance? InterruptedException e)                               :interrupted
    (and (table-not-found-exception? e) (not (exists? table-name))) :stale-table
    :else                                                            :unknown-error))

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
  (index-state/force-refresh! *state-store*)
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
          :stale-table  (try-retry-after-sync! table-type table-name table-name-fn entries e)
          :unknown-error (record-skipped-batch! table-type table-name nil e nil))))))

(defn- batch-update!
  "Create the given search index entries in bulk.
   In reindexing mode, writes go only to the pending table — the active table will be replaced when reindexing completes,
   so writing to it is wasted work. Each batch issues an explicit COMMIT so the pending data is visible
   to other connections during the build."
  [context documents]
  (let [reindexing? (and (= :search/reindexing context) (not search.ingestion/*force-sync*))
        do-writes   (fn []
                      (let [entries         (map document->entry documents)
                            ;; No need to update the active index if we are doing a full index, as this table will be
                            ;; swapped out soon. Most updates would be no-ops anyway.
                            active-updated  (when-not (and reindexing? (pending-table))
                                              (safe-batch-upsert! :active active-table entries))
                            pending-updated (safe-batch-upsert! :pending pending-table entries)]
                        (when (or active-updated pending-updated)
                          (u/prog1 (->> entries (map :model) frequencies)
                            (when reindexing?
                              (t2/query ["commit"]))
                            (log/trace "indexed documents for " <>)
                            (when active-updated
                              (try
                                (analytics/set-gauge! :metabase-search/appdb-index-size (t2/count (name active-updated)))
                                (catch Exception e
                                  (log/warnf e "Unable to measure active search index size (%s)" active-updated))))))))]
    (if reindexing?
      ;; New connection used for performing the updates which commit periodically without impacting any outer transactions.
      (t2/with-connection [_conn (mdb/data-source)]
        (do-writes))
      (do-writes))))

(defn index-docs!
  "Indexes the documents. The context should be :search/updating or :search/reindexing.
   Context should be :search/updating or :search/reindexing to help control how to manage the updates"
  [context document-reducible]
  (tracing/with-span :search "search.appdb.index-docs" {:search/context (name context)}
    (transduce (comp (partition-all insert-batch-size)
                     (map (partial batch-update! context)))
               (partial merge-with +)
               document-reducible)))

(defmethod search.engine/update! :search.engine/appdb [_engine document-reducible]
  (index-docs! :search/updating document-reducible))

(defmethod search.engine/delete! :search.engine/appdb [_engine search-model ids]
  (when (seq ids)
    (u/prog1 (->> [(active-table) (pending-table)]
                  (keep (fn [table-name]
                          (when table-name
                            {search-model (try (t2/delete! table-name :model search-model :model_id [:in (set ids)])
                                               ;; Race conditions with table being deleted, especially in tests.
                                               (catch Exception e (if (table-not-found-exception? e) 0 (throw e))))})))
                  (apply merge-with +)
                  (into {}))
      (when (active-table)
        (try
          (analytics/set-gauge! :metabase-search/appdb-index-size (:count (t2/query-one {:select [[:%count.* :count]]
                                                                                         :from   [(active-table)]
                                                                                         :limit  1})))
          (catch Exception e
            ;; No point tracking the size of the newer index table, since we won't have modified it.
            (when-not (table-not-found-exception? e)
              (throw e))))))))

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
            ;; Discard any in-progress pending table before starting fresh.
            (when-let [table-name (pending-table)]
              (let [deleted (search-index-metadata/delete-index! :appdb (search.spec/index-version-hash) table-name)]
                (when (pos? deleted)
                  (log/infof "Deleted %d pending indices" deleted)))
              (index-state/set-state! *state-store* {:active (active-table) :pending nil}))
            (maybe-create-pending!)
            (activate-table!))]
    (if search.ingestion/*force-sync*
      (reset-logic)
      ;; Use a dedicated connection so the empty tables become visible to other connections
      ;; even while the initial data load is happening in an outer transaction.
      (t2/with-connection [_ (mdb/data-source)]
        (reset-logic)))))

(defn ensure-ready!
  "Ensure the index is ready to be populated. Returns truthy if the index was created or reset."
  [& {:keys [force-reset?]}]
  (locking index-lock
    (when (nil? (active-table))
      (index-state/force-refresh! *state-store*))
    (when (or force-reset? (not (exists? (active-table))))
      (reset-index!))))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-temp-index-table
  "Create a temporary index table for the duration of the body.
   Binds *state-store* to an isolated MockStateStore so DDL operations within body
   do not touch the real search_index_metadata records."
  [& body]
  `(let [table-name# (gen-table-name "_temp")
         version#    (str (string/random-string 8) "-temp")]
     (binding [*state-store* (index-state/mock-store {:active table-name#})]
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
           (t2/delete! :model/SearchIndexMetadata :version version#))))))
