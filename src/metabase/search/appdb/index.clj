(ns metabase.search.appdb.index
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.models.search-index-metadata :as search-index-metadata]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.specialization.h2 :as h2]
   [metabase.search.appdb.specialization.postgres :as postgres]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
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

(defonce ^:dynamic ^:private *index-version-id*
  (if config/is-prod?
    (:hash config/mb-version-info)
    (str (random-uuid))))

(defonce ^:private next-sync-at (atom nil))

(defonce ^:dynamic ^:private *indexes* (atom {:active nil, :pending nil}))

(def ^:private ^:dynamic *mocking-tables* false)

(defmethod search.engine/reset-tracking! :search.engine/appdb [_]
  (reset! *indexes* nil))

(declare exists?)

(defn- sync-tracking-atoms! []
  (reset! *indexes* (into {}
                          (for [[status table-name] (search-index-metadata/indexes :appdb *index-version-id*)]
                            (if (exists? table-name)
                              [status (keyword table-name)]
                                ;; For debugging, make it clear why we are not tracking the given metadata.
                              [(keyword (name status) "not-found") (keyword table-name)])))))

;; This exists only to be mocked.
(defn- now [] (System/nanoTime))

(defn- sync-tracking-atoms-if-stale! []
  (when-not *mocking-tables*
    (when (or (not @next-sync-at) (> (now) @next-sync-at))
      (reset! next-sync-at (+ (now) sync-tracking-period))
      (sync-tracking-atoms!))))

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
  "Generate a unique table name to use as a search index table."
  []
  (keyword (str/replace (str "search_index__" (random-uuid)) #"-" "_")))

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
  (let [dropped (volatile! 0)]
    (doseq [table (orphan-indexes)]
      (try
        (t2/query (sql.helpers/drop-table table))
        (vswap! dropped inc)
        ;; Deletion could fail if it races with other instances
        (catch ExceptionInfo _)))
    (log/infof "Dropped %d stale indexes" @dropped)))

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
  (-> (sql.helpers/create-table table-name)
      (sql.helpers/with-columns (specialization/table-schema base-schema))
      t2/query)
  (let [table-name (name table-name)]
    (doseq [stmt (specialization/post-create-statements table-name table-name)]
      (t2/query stmt))))

(defn maybe-create-pending!
  "Create a search index table if one doesn't exist. Record and return the name of the table, regardless."
  []
  (if *mocking-tables*
    ;; The atoms are the only source of truth, create a new table if necessary.
    (or (pending-table)
        (let [table-name (gen-table-name)]
          (create-table! table-name)
          (swap! *indexes* assoc :pending table-name)))
    ;; The database is the source of truth
    (let [{:keys [pending]} (sync-tracking-atoms!)]
      (or pending
          (let [table-name (gen-table-name)]
            ;; We may fail to insert a new metadata row if we lose a race with another instance.
            (when (search-index-metadata/create-pending! :appdb *index-version-id* table-name)
              (create-table! table-name))
            (:pending (sync-tracking-atoms!)))))))

(defn activate-table!
  "Make the pending index active if it exists. Returns true if it did so."
  []
  (if *mocking-tables*
    ;; The atoms are the only source of truth, we must not update the metadata.
    (boolean
     (when-let [pending (:pending @*indexes*)]
       (reset! *indexes* {:pending nil, :active pending})))
    ;; Ensure the metadata is updated and pruned.
    (let [{:keys [pending]} (sync-tracking-atoms!)]
      (when pending
        (reset! *indexes* {:pending nil
                           :active  (keyword (search-index-metadata/active-pending! :appdb *index-version-id*))}))
      ;; Clean up while we're here
      (delete-obsolete-tables!)
      ;; Did *we* do a rotation?
      (boolean pending))))

(defn- document->entry [entity]
  (-> entity
      (select-keys
       ;; remove attrs that get aliased
       (remove #{:id :created_at :updated_at :native_query}
               (conj search.spec/attr-columns :model :display_data :legacy_input)))
      (update :display_data json/encode)
      (update :legacy_input json/encode)
      (assoc
       :updated_at       :%now
       :model_id         (:id entity)
       :model_created_at (:created_at entity)
       :model_updated_at (:updated_at entity))
      (merge (specialization/extra-entry-fields entity))))

(defn- safe-batch-upsert! [table-name entries]
  ;; For convenience, no-op if we are not tracking any table.
  (when table-name
    (try
      (specialization/batch-upsert! table-name entries)
      (catch Exception e
        ;; TODO we should handle the MySQL and MariaDB flavors here too
        (if (or (instance? PSQLException (ex-cause e))
                (instance? JdbcSQLSyntaxErrorException (ex-cause e)))
          ;; Suppress database errors, which are likely due to stale tracking data.
          (sync-tracking-atoms!)
          (throw e))))))

(defn- batch-update!
  "Create the given search index entries in bulk"
  [documents]
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

  (let [entries          (map document->entry documents)
        ;; Optimization idea: if the updates are coming from the re-indexing worker, skip updating the active table.
        ;;                    this should give a close to 2x speed-up as insertion is the bottleneck, and most of the
        ;;                    updates will be no-ops in any case.
        active-updated?  (safe-batch-upsert! (active-table) entries)
        pending-updated? (safe-batch-upsert! (pending-table) entries)]
    (when (or active-updated? pending-updated?)
      (u/prog1 (->> entries (map :model) frequencies)
        (log/trace "indexed documents" <>)))))

(defmethod search.engine/consume! :search.engine/appdb [_engine document-reducible]
  (transduce (comp (partition-all insert-batch-size)
                   (map batch-update!))
             (partial merge-with +)
             document-reducible))

(defmethod search.engine/delete! :search.engine/appdb [_engine search-model ids]
  (doseq [table-name [(active-table) (pending-table)] :when table-name]
    (t2/delete! table-name :model search-model :model_id [:in ids])))

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
  ;; stop tracking any pending table
  (when-let [table-name (pending-table)]
    (when-not *mocking-tables*
      (search-index-metadata/delete-index! :appdb *index-version-id* table-name))
    (swap! *indexes* assoc :pending nil))
  (maybe-create-pending!)
  (activate-table!))

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
  "Create a temporary index table for the duration of the body."
  [& body]
  `(let [table-name# (gen-table-name)]
     (binding [*mocking-tables* true
               *indexes*        (atom {:active table-name#})]
       (try
         (create-table! table-name#)
         ~@body
         (finally
           (#'drop-table! table-name#))))))
