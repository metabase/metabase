(ns metabase.search.appdb.index
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.analytics.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
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
  []
  ;; Locks the indexes so the reset! doesn't lose data written to the db by a different thread between the read and write
  (locking *indexes*
    (let [indexes (into {}
                        (for [[status table-name] (search-index-metadata/indexes :appdb (search.spec/index-version-hash))]
                          (if (exists? table-name)
                            [status (keyword table-name)]
                            ;; For debugging, make it clear why we are not tracking the given metadata.
                            [(keyword (name status) "not-found") (keyword table-name)])))]
      (log/debugf "Sync tracking atoms: %s" indexes)
      (reset! *indexes* indexes))))

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

(defn- exists? [table]
  (when table
    (t2/exists? :information_schema.tables :table_name (table-name table))))

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
  "Create a search index table if one doesn't exist. Record and return the name of the table, regardless."
  []
  (locking *indexes*
    (if *mocking-tables*
      ;; In a test where the atoms are the source of truth, create a new table if necessary.
      (or (pending-table)
          (let [table-name (gen-table-name)]
            (create-table! table-name)
            (swap! *indexes* assoc :pending table-name) table-name))
      ;; The database is the source of truth
      (let [{:keys [pending]} (sync-tracking-atoms!)]
        (or pending
            (let [table-name (gen-table-name)]
              (log/infof "Creating pending index %s for lang %s" table-name (i18n/site-locale-string))
            ;; We may fail to insert a new metadata row if we lose a race with another instance.
              (when (search-index-metadata/create-pending! :appdb (search.spec/index-version-hash) table-name)
                (try
                  (create-table! table-name)
                  (catch Exception e
                    (log/error e "Error creating pending index table, cleaning up metadata")
                    (try
                      (t2/with-connection [safe-conn (mdb/app-db)]
                        (t2/delete! :conn safe-conn :model/SearchIndexMetadata :index_name (name table-name)))
                      (catch Exception del-e
                        (log/warn del-e "Error clearing out search metadata after failure")))
                    (sync-tracking-atoms!))))
              (let [pending (:pending (sync-tracking-atoms!))]
                (log/infof "New pending index %s" pending)
                pending)))))))

(defn activate-table!
  "Make the pending index active if it exists. Returns true if it did so."
  []
  (locking *indexes*
    (if *mocking-tables*
      ;; The atoms are the only source of truth, we must not update the metadata.
      (boolean
       (when-let [pending (:pending @*indexes*)]
         (reset! *indexes* {:pending nil, :active pending}) true))
      ;; Ensure the metadata is updated and pruned.
      (let [{:keys [pending]} (sync-tracking-atoms!)]
        (log/infof "Activating pending index %s" pending)
        (when pending
          (let [active (keyword (search-index-metadata/active-pending! :appdb (search.spec/index-version-hash)))]
            (reset! *indexes* {:pending nil :active active})
            (log/infof "Activated pending index %s" active)))
        ;; Clean up while we're here
        (delete-obsolete-tables!)
        ;; Did *we* do a rotation?
        (boolean pending)))))

(defn- document->entry [entity]
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
      (merge (specialization/extra-entry-fields entity))))

(defn- table-not-found-exception? [e]
  ;; Use with care, obviously this can give false positives if used with a query that's *actually* malformed.
  ;; TODO we should handle the MySQL and MariaDB flavors here too
  (or (instance? PSQLException (ex-cause e))
      (instance? JdbcSQLSyntaxErrorException (ex-cause e))))

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

  Returns the name of the table that was written to, or nil if there is none being tracked.
  We recover gracefully the first time if the tracking atom was stale, but do not check again on retry."
  [table-type table-name-fn entries]
  ;; For convenience, no-op if we are not tracking any table.
  (when-let [table-name (table-name-fn)]
    (let [upsert! (fn [t] (specialization/batch-upsert! t entries) t)]
      (try
        (upsert! table-name)
        (catch Exception e
          ;; Only suppress failures related to a legitimately non-existent table
          (if (or (not (table-not-found-exception? e)) (exists? table-name))
            (throw e)
            (when-let [refreshed-table-name (do (sync-tracking-atoms!) (table-name-fn))]
              (if (= table-name refreshed-table-name)
                (throw (ex-info "Currently tracked index does not exist" e {:table-name table-name}))
                (try
                  (upsert! refreshed-table-name)
                  (catch Exception e2
                    (retry-upsert-ex table-type table-name refreshed-table-name e e2)))))))))))

(defn- batch-update!
  "Create the given search index entries in bulk. Commits after each batch"
  [context documents]
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
                                (analytics/set! :metabase-search/appdb-index-size (t2/count (name active-updated)))
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
          (analytics/set! :metabase-search/appdb-index-size (:count (t2/query-one {:select [[:%count.* :count]]
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
              ;; stop tracking any pending table
            (when-let [table-name (pending-table)]
              (when-not *mocking-tables*
                (let [deleted (search-index-metadata/delete-index! :appdb (search.spec/index-version-hash) table-name)]
                  (when (pos? deleted)
                    (log/infof "Deleted %d pending indices" deleted))))
              (swap! *indexes* assoc :pending nil))
            (maybe-create-pending!)
            (activate-table!))]
    (if search.ingestion/*force-sync*
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

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
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
