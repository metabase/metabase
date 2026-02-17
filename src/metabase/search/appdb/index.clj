(ns metabase.search.appdb.index
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql :as sql]
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
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.string :as string]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (org.h2.jdbc JdbcSQLSyntaxErrorException)
   (org.postgresql.util PSQLException)))

(comment
  h2/keep-me
  postgres/keep-me)

(set! *warn-on-reflection* true)

(def ^:private insert-batch-size 150)

(def ^:private sync-tracking-period (long (* 5 #_minutes 60e9)))

; The version ID MUST be updated whenever there is an incompatible change to the schema OR content the index table
; The id can be any string, but a simple incrementing number is normally easiest to manage while giving some semantic meaning.
; When this version changes, on startup metabase will not use the existing index table and instead reindex everything to a new table marked with the new version.
; It is dynamic to allow tests to override it
(defonce ^:dynamic ^:private *index-version-id* "3")

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
                        (for [[status table-name] (search-index-metadata/indexes :appdb *index-version-id*)]
                          (if (exists? table-name)
                            [status (keyword table-name)]
                            ;; For debugging, make it clear why we are not tracking the given metadata.
                            [(keyword (name status) "not-found") (keyword table-name)])))]
      (log/debugf "Sync tracking atoms: %s" indexes)
      (reset! *indexes* indexes))))

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
   (when (and table (exists? table))
     (t2/query (sql.helpers/drop-table (keyword (table-name table)))))))

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
                           [:not-in [:lower :table_name]
                            [:raw
                             (str "("
                                  (first (sql/format {:select [:index_name]
                                                      :from   [[(t2/table-name :model/SearchIndexMetadata) :metadata]]
                                                      :where  [:= :metadata.engine [:inline "appdb"]]}))
                                  ")")]]]})))

(defn- delete-obsolete-tables! []
  ;; Delete metadata around indexes that are no longer needed.
  (search-index-metadata/delete-obsolete! *index-version-id*)
  ;; Drop any indexes that are no longer referenced.
  (let [dropped (volatile! [])]
    (doseq [table (orphan-indexes)]
      (try
        (t2/query (sql.helpers/drop-table table))
        (vswap! dropped conj table)
        ;; Deletion could fail if it races with other instances
        (catch ExceptionInfo _)))
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
              (when (search-index-metadata/create-pending! :appdb *index-version-id* table-name)
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
          (let [active (keyword (search-index-metadata/active-pending! :appdb *index-version-id*))]
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
      (update :legacy_input json/encode)
      (dissoc :native_query)
      (merge (specialization/extra-entry-fields entity))))

(defn- table-not-found-exception? [e]
  ;; Use with care, obviously this can give false positives if used with a query that's *actually* malformed.
  ;; TODO we should handle the MySQL and MariaDB flavors here too
  (or (instance? PSQLException (ex-cause e))
      (instance? JdbcSQLSyntaxErrorException (ex-cause e))))

(defn- safe-batch-upsert! [table-name entries]
  ;; For convenience, no-op if we are not tracking any table.
  (when table-name
    (try
      (specialization/batch-upsert! table-name entries)
      (catch Exception e
        (if (table-not-found-exception? e)
          ;; If resetting tracking atoms resolves the issue (which is likely happened because of stale tracking data),
          ;; suppress the issue - but throw it all the way to the caller if the issue persists
          (try
            (sync-tracking-atoms!)
            (specialization/batch-upsert! table-name entries)
            (catch Exception e2
              (log/error e2 "Error syncing index tracking atoms after table not found exception")
              (throw e)))
          (throw e))))))

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
                      (let [active-table    (active-table)
                            entries          (map document->entry documents)
                            ;; No need to update the active index if we are doing a full index and it will be swapped out soon. Most updates are no-ops anyway.
                            active-updated?  (when-not (and active-table (pending-table) reindexing?)
                                               (safe-batch-upsert! active-table entries))
                            pending-updated? (safe-batch-upsert! (pending-table) entries)]
                        (when (or active-updated? pending-updated?)
                          (u/prog1 (->> entries (map :model) frequencies)
                            (when reindexing?
                              (t2/query ["commit"]))
                            (log/trace "indexed documents for " <>)
                            (when active-updated?
                              (analytics/set! :metabase-search/appdb-index-size (t2/count (name active-table))))))))]
    (if reindexing?
      ;; New connection used for performing the updates which commit periodically without impacting any outer transactions.
      (t2/with-connection [_conn (mdb/data-source)]
        (do-writes))
      (do-writes))))

(defn index-docs!
  "Indexes the documents. The context should be :search/updating or :search/reindexing.
   Context should be :search/updating or :search/reindexing to help control how to manage the updates"
  [context document-reducible]
  (transduce (comp (partition-all insert-batch-size)
                   (map (partial batch-update! context)))
             (partial merge-with +)
             document-reducible))

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
                    :version *index-version-id*
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
  (log/infof "Resetting appdb index for version %s, active table: %s" *index-version-id*
             (pr-str (active-table)))
  (letfn [(reset-logic []
              ;; stop tracking any pending table
            (when-let [table-name (pending-table)]
              (when-not *mocking-tables*
                (let [deleted (search-index-metadata/delete-index! :appdb *index-version-id* table-name)]
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
