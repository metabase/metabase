(ns metabase.search.semantic.index
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.models.search-index-metadata :as search-index-metadata]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (org.h2.jdbc JdbcSQLSyntaxErrorException)
   (org.postgresql.util PSQLException)))

(set! *warn-on-reflection* true)

(def ^:private insert-batch-size 150)

(def ^:private sync-tracking-period (long (* 5 #_minutes 60e9)))

(defonce ^:dynamic ^:private *index-version-id*
  (if config/is-prod?
    (:hash config/mb-version-info)
    (u/lower-case-en (u/generate-nano-id))))

(defonce ^:private next-sync-at (atom nil))

(defonce ^:dynamic ^:private *indexes* (atom {:active nil, :pending nil}))

(def ^:private ^:dynamic *mocking-tables* false)

(defmethod search.engine/reset-tracking! :search.engine/semantic [_]
  (reset! *indexes* nil))

(declare exists?)

(defn- sync-tracking-atoms! []
  (reset! *indexes* (into {}
                          (for [[status table-name] (search-index-metadata/indexes :semantic *index-version-id*)]
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
  (keyword (str/replace (str "search_index__" (u/lower-case-en (u/generate-nano-id))) #"-" "_")))

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
                                                      :where  [:= :metadata.engine [:inline "semantic"]]}))
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
         ;; TODO: figure out if legacy_input is needed
         #_[:legacy_input :text :not-null]
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

(defn when-index-created
  "Return creation time of the active index, or nil if there is none."
  []
  (search-index-metadata/when-index-created :semantic *index-version-id*))

(defn- table-schema
  "Returns the HoneySQL schema for the semantic search index table"
  [base-schema]
  (into [[:id :bigint [:primary-key] [:raw "GENERATED BY DEFAULT AS IDENTITY"]]
         [:embedding [:raw "vector(1024)"] :not-null]]
        base-schema))

;; TODO: create indexes here?
(defn- post-create-statements
  [prefix table-name]
  (mapv
   (fn [template] (format template prefix table-name))
   ["CREATE UNIQUE INDEX IF NOT EXISTS %s_identity_idx ON %s (model, model_id)"]))

(defn create-table!
  "Create an index table with the given name. Should fail if it already exists."
  [table-name]
  (t2/with-transaction [_]
    (-> (sql.helpers/create-table table-name)
        (sql.helpers/with-columns (table-schema base-schema))
        t2/query)
    (let [table-name (name table-name)]
      (doseq [stmt (post-create-statements table-name table-name)]
        (t2/query stmt)))))

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
            (when (search-index-metadata/create-pending! :semantic *index-version-id* table-name)
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
                           :active  (keyword (search-index-metadata/active-pending! :semantic *index-version-id*))}))
      ;; Clean up while we're here
      (delete-obsolete-tables!)
      ;; Did *we* do a rotation?
      (boolean pending))))

(defn- extra-embedding-field
  [entity]
  (let [response (http/post "http://localhost:11434/api/embeddings"
                            {:headers {"Content-Type" "application/json"}
                             :body    (json/encode {:model "mxbai-embed-large"
                                                    :prompt (:searchable_text entity)})})
        embedding (-> (json/decode (:body response) true) :embedding)
        embedding-str (str "[" (str/join ", " embedding) "]")]
    ;; Fully raw to avoid JDBC trying to parameterize it
    {:embedding [:raw (format "'%s'::vector" embedding-str)]}))

;; TODO: consider where the embedding should actually be fetched from
(defn- document->entry
  [entity]
  (-> entity
      (select-keys
       ;; remove attrs that get explicitly aliased below
       (remove #{:id :created_at :updated_at :native_query}
               (conj search.spec/attr-columns :model :display_data :legacy_input)))
      (update :display_data json/encode)
      (dissoc :legacy_input)
      #_(update :legacy_input json/encode)
      (assoc
       :updated_at       :%now
       :model_id         (:id entity)
       :model_created_at (:created_at entity)
       :model_updated_at (:updated_at entity))
      (merge (extra-embedding-field entity))))

;; copied from specialization/batch-upsert!
(defn- batch-upsert!
  [table entries]
  (when (seq entries)
    (t2/query
     ;; The cost of dynamically calculating these keys should be small compared to the IO cost, so unoptimized.
     (let [update-keys (vec (disj (set (keys (first entries))) :id :model :model_id))
           excluded-kw (fn [column] (keyword (str "excluded." (name column))))]
       {:insert-into   table
        :values        entries
        :on-conflict   [:model :model_id]
        :do-update-set (zipmap update-keys (map excluded-kw update-keys))}))))

(defn- safe-batch-upsert! [table-name entries]
  ;; For convenience, no-op if we are not tracking any table.
  (when table-name
    (try
      (batch-upsert! table-name entries)
      (catch Exception e
        ;; TODO we should handle the MySQL and MariaDB flavors here too
        (if (or (instance? PSQLException (ex-cause e))
                (instance? JdbcSQLSyntaxErrorException (ex-cause e)))
          ;; If resetting tracking atoms resolves the issue (which is likely happened because of stale tracking data),
          ;; suppress the issue - but throw it all the way to the caller if the issue persists
          (do (sync-tracking-atoms!)
              (batch-upsert! table-name entries))
          (throw e))))))

(defn- batch-update!
  "Create the given search index entries in bulk"
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

  (let [active-table (active-table)
        entries (map document->entry documents)
        ;; No need to update the active index if we are doing a full index and it will be swapped out soon. Most updates are no-ops anyway.
        active-updated? (when-not (and active-table (= context :search/reindexing)) (safe-batch-upsert! active-table entries))
        pending-updated? (safe-batch-upsert! (pending-table) entries)]
    (when (or active-updated? pending-updated?)
      (u/prog1 (->> entries (map :model) frequencies)
        (log/trace "indexed documents for " <>)
        #_(when active-updated?
            (analytics/set! :metabase-search/appdb-index-size (t2/count (name active-table))))))))

(defn populate-index!
  "Populate the semantic search index with all searchable documents. Returns a map of model names to counts of indexed documents."
  [context]
  (let [document-reducible (search.ingestion/searchable-documents)]
    (transduce
     (comp
      (partition-all insert-batch-size)
      (map (partial batch-update! context)))
     (partial merge-with +)
     document-reducible)))

(defn reset-index!
  "Ensure we have a blank slate; in case the table schema or stored data format has changed."
  []
  ;; stop tracking any pending table
  (when-let [table-name (pending-table)]
    (when-not *mocking-tables*
      (search-index-metadata/delete-index! :semantic *index-version-id* table-name))
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

