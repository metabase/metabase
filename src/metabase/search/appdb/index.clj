(ns metabase.search.appdb.index
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.config :as config]
   [metabase.models.setting :as settings :refer [defsetting]]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.specialization.postgres :as postgres]
   [metabase.search.engine :as search.engine]
   [metabase.search.spec :as search.spec]
   [metabase.search.util :as search.util]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (org.postgresql.util PSQLException)))

(comment
  postgres/keep-me)

(def ^:private insert-batch-size 150)

(defonce ^:dynamic ^:private *index-version-id*
  (if config/is-prod?
    (:hash config/mb-version-info)
    (str (random-uuid))))

(defonce ^:dynamic ^:private *active-table* (atom nil))

(defonce ^:dynamic ^:private *pending-table* (atom nil))

(def ^:private ^:dynamic *mocking-tables* false)

(defn active-table
  "The table against which we should currently make search queries."
  []
  @*active-table*)

(defn- pending-table
  "A partially populated table that will take over from [[active-table]] when it is done."
  []
  @*pending-table*)

(defmethod search.engine/reset-tracking! :search.engine/fulltext [_]
  (reset! *active-table* nil)
  (reset! *pending-table* nil))

(defn gen-table-name
  "Generate a unique table name to use as a search index table."
  []
  (keyword (str/replace (str "search_index__" (random-uuid)) #"-" "_")))

(defn- exists? [table-name]
  (when table-name
    (t2/exists? :information_schema.tables :table_name (name table-name))))

(defn- drop-table! [table-name]
  (boolean
   (when (and table-name (exists? table-name))
     (t2/query (sql.helpers/drop-table table-name)))))

(defn- existing-indexes []
  (map (comp keyword :table_name)
       (t2/query {:select [:table_name]
                  :from   :information_schema.tables
                  :where  [:or
                           [:like :table_name "search\\_index\\_\\_%"]
                           ;; legacy table names
                           [:in :table_name ["search_index" "search_index_next" "search_index_retired"]]]})))

(defn- sync-metadata [_old-setting-raw new-setting-raw]
  ;; Oh dear, we get the raw setting. Save a little bit of overhead by no keywordizing the keys.
  (let [new-setting                          (json/decode new-setting-raw)
        this-index-metadata                  #(get-in % ["versions" *index-version-id*])
        {:strs [active-table pending-table]} (this-index-metadata new-setting)
        ;; implicitly clear the pending table if we just activated it
        pending-table                        (when (not= active-table pending-table) pending-table)]
    (reset! *active-table* (some-> active-table keyword))
    (reset! *pending-table* (some-> pending-table keyword))
    ;; Clean up any tables not referenced by any active versions.
    (let [keep-table? (set (for [[_ index-metadata] (get new-setting "versions")
                                 k ["active-table" "pending-table"]
                                 :let [table-name (get index-metadata k)]
                                 :when table-name]
                             (keyword table-name)))
          to-drop     (remove keep-table? (existing-indexes))]
      (when (seq to-drop)
        (try
          (t2/query (apply sql.helpers/drop-table to-drop))
          ;; Deletion could fail if it races with other instances
          (catch ExceptionInfo _))
        (log/infof "Dropped %d stale indexes" (count to-drop))))))

(defsetting search-engine-appdb-index-state
  "Internation state used to maintain the AppDb Search Index"
  :visibility :internal
  :encryption :no
  :export?    false
  :default    nil
  :type       :json
  :on-change sync-metadata)

(defn- update-metadata! [new-metadata]
  (if *mocking-tables*
    (do (when-let [[_ table] (find new-metadata :active-table)]
          (reset! *active-table* table))
        (when-let [[_ table] (find new-metadata :pending-table)]
          (reset! *pending-table* table)))
    (search-engine-appdb-index-state!
     (let [existing-state  (search-engine-appdb-index-state)
           active-versions (search.util/cycle-recent-versions (:recent-versions existing-state) *index-version-id*)]
       (-> existing-state
           (assoc :recent-versions active-versions)
           ;; Settings hydration parses all keys as keywords
           (update :versions select-keys (map keyword active-versions))
           (update-in [:versions *index-version-id*] merge new-metadata)))))
  true)

(comment
  (search-engine-appdb-index-state! nil))

(defn create-table!
  "Create an index table with the given name. Should fail if it already exists."
  [table-name]
  (-> (sql.helpers/create-table table-name)
      (sql.helpers/with-columns (specialization/table-schema))
      t2/query)
  (let [table-name (name table-name)]
    (doseq [stmt (specialization/post-create-statements table-name table-name)]
      (t2/query stmt))))

(defn maybe-create-pending!
  "Create a search index table."
  []
  (when (not (exists? (pending-table)))
    (let [table-name (gen-table-name)]
      (when-not (exists? table-name)
        (create-table! table-name))
      ;; This is a bit shaky - another server part-way through populating the pending table maybe pick up this table
      ;; and then activate it prematurely.
      ;; This issue also existed with the fixed table name approach too, however.
      ;; TODO improve coordination around re-indexing
      (update-metadata! {:pending-table table-name}))))

(defn activate-table!
  "Make the pending index active if it exists. Returns true if it did so."
  ([]
   (activate-table! (pending-table)))
  ([table-name]
   (boolean
    (when (exists? table-name)
      (update-metadata! {:active-table table-name})))))

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

(defn delete!
  "Remove any entries corresponding directly to a given model instance."
  [id search-models]
  ;; In practice, we expect this to be 1-1, but the data model does not preclude it.
  (when (seq search-models)
    (doseq [table-name [(active-table) (pending-table)] :when table-name]
      (t2/delete! table-name :model_id id :model [:in search-models]))))

(defn- safe-batch-upsert! [table-name entries]
  ;; For convenience, if we're given a non-existing table, gracefully no-op.
  (when table-name
    (try
      (specialization/batch-upsert! table-name entries)
      (catch Exception e
        ;; ignore database errors, the table likely doesn't exist, or has a stale schema.
        (when-not (instance? PSQLException (ex-cause e))
          (throw e))))))

(defn- batch-update!
  "Create the given search index entries in bulk"
  [documents]
  ;; Protect against tests that nuke the appdb
  (when config/is-test?
    (when (and (active-table) (not (exists? (active-table))))
      (reset! *active-table* nil))
    (when (and (pending-table) (not (exists? (pending-table))))
      (reset! *pending-table* nil)))

  (let [entries          (map document->entry documents)
        ;; Optimization idea: if the updates are coming from the re-indexing worker, skip updating the active table.
        ;;                    this should give a close to 2x speed-up as insertion is the bottleneck, and most of the
        ;;                    updates will be no-ops in any case.
        active-updated?  (safe-batch-upsert! (active-table) entries)
        pending-updated? (safe-batch-upsert! (pending-table) entries)]
    (when (or active-updated? pending-updated?)
      (->> entries (map :model) frequencies))))

(defmethod search.engine/consume! :search.engine/fulltext [_engine document-reducible]
  (transduce (comp (partition-all insert-batch-size)
                   (map batch-update!))
             (partial merge-with +)
             document-reducible))

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
  (drop-table! (pending-table))
  (maybe-create-pending!)
  (activate-table!))

(defn ensure-ready!
  "Ensure the index is ready to be populated. Return false if it was already ready."
  [force-recreation?]
  (when-not *mocking-tables*
    (when (nil? (active-table))
      ;; double check that we're initialized from the current shared metadata
      (when-let [raw-state (settings/get-raw-value :search-engine-appdb-index-state)]
        (sync-metadata raw-state raw-state))))

  (when (or force-recreation? (not (exists? (active-table))))
    (reset-index!)))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-temp-index-table
  "Create a temporary index table for the duration of the body."
  [& body]
  `(let [table-name# (gen-table-name)]
     (binding [*mocking-tables* true
               *pending-table*  (atom nil)
               *active-table*   (atom table-name#)]
       (try
         (create-table! table-name#)
         ~@body
         (finally
           (#'drop-table! table-name#))))))
