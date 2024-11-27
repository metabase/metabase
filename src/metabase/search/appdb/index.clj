(ns metabase.search.appdb.index
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.specialization.postgres :as postgres]
   [metabase.search.engine :as search.engine]
   [metabase.search.spec :as search.spec]
   [toucan2.core :as t2])
  (:import (org.postgresql.util PSQLException)))

(comment
  postgres/keep-me)

(def ^:private insert-batch-size 150)

(def ^:dynamic *active-table*
  "The table against which we should currently make search queries. Dynamic for testing."
  :search_index)

(def ^:private pending-table :search_index_next)

(def ^:private retired-table :search_index_retired)

(defonce ^:private initialized? (atom false))

(defonce ^:private reindexing? (atom false))

(defn- random-prefix []
  (str/replace (str (name *active-table*) "_" (random-uuid)) #"-" "_"))

(defn- exists? [table-name]
  (t2/exists? :information_schema.tables :table_name (name table-name)))

(defn- drop-table! [table-name]
  (boolean
   (when (exists? table-name)
     (t2/query (sql.helpers/drop-table table-name)))))

(defn- rename-table! [old new]
  (when (and (exists? old) (not (exists? new)))
    (-> (sql.helpers/alter-table old)
        (sql.helpers/rename-table new)
        t2/query)))

(defn create-table!
  "Create an index table with the given name. Should fail if it already exists."
  [table-name]
  (-> (sql.helpers/create-table table-name)
      (sql.helpers/with-columns (specialization/table-schema))
      t2/query)
  (let [idx-prefix (random-prefix)
        table-name (name table-name)]
    (doseq [stmt (specialization/post-create-statements idx-prefix table-name)]
      (t2/query stmt))))

(defn maybe-create-pending!
  "Create a search index table."
  ([]
   (when (not @reindexing?)
     (maybe-create-pending! pending-table)
     (reset! reindexing? true)))
  ([table-name]
   (when-not (exists? table-name)
     (create-table! table-name))))

(defn activate-pending!
  "Make the pending index active if it exists. Returns true if it did so."
  []
  ;; ... just in case it wasn't cleaned up last time.
  (drop-table! retired-table)
  (when (exists? pending-table)
    (t2/with-transaction [_conn]
      (rename-table! *active-table* retired-table)
      (rename-table! pending-table *active-table*))
    (reset! reindexing? false)
    (drop-table! retired-table)
    true))

(defn- document->entry [entity]
  (-> entity
      (select-keys
       ;; remove attrs that get aliased
       (remove #{:id :created_at :updated_at :native_query}
               (conj search.spec/attr-columns :model :display_data :legacy_input)))
      (update :display_data json/generate-string)
      (update :legacy_input json/generate-string)
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
    (when @initialized?
      (t2/delete! *active-table* :model_id id :model [:in search-models]))
    (when @reindexing?
      (t2/delete! pending-table :model_id id :model [:in search-models]))))

(defn- safe-batch-upsert! [table-name entries]
  (try
    (specialization/batch-upsert! table-name entries)
    (catch Exception e
      ;; ignore database errors, the table likely doesn't exist, or has a stale schema.
      (when-not (instance? PSQLException (ex-cause e))
        (throw e)))))

(defn- batch-update!
  "Create the given search index entries in bulk"
  [documents]
  (let [entries          (map document->entry documents)
        ;; When stubbing the table in tests, always treat it as active
        active?          (or @initialized? (not= :search_index *active-table*))
        ;; Ideally, we would reset these atoms if the corresponding tables don't exist.
        ;; We're about to rework this area, so just leaving this as a note for now.
        active-updated?  (when active? (safe-batch-upsert! *active-table* entries))
        pending-updated? (when @reindexing?  (safe-batch-upsert! pending-table entries))]
    (when (or active-updated? pending-updated?)
      (->> entries (map :model) frequencies))))

(defmethod search.engine/reset-tracking! :search.engine/fulltext [_]
  ;; TODO we'll make this safe when we switch to the metadata table.
  (reset! initialized? false)
  (reset! reindexing? false))

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
   (specialization/base-query *active-table* search-term search-ctx select-items)))

(defn search
  "Use the index table to search for records."
  [search-term & [search-ctx]]
  (map (juxt :model :name)
       (t2/query (search-query search-term search-ctx [:model :name]))))

(defn reset-index!
  "Ensure we have a blank slate; in case the table schema or stored data format has changed."
  []
  ;; Moving to random tables will clean this up
  (let [testing?   (not= *active-table* :search_index)
        table-name (if testing? *active-table* pending-table)]
    (when-not testing?
      (reset! reindexing? false))
    (drop-table! table-name)
    (maybe-create-pending! table-name)
    (when-not testing?
      (activate-pending!)
      (reset! initialized? true))
    true))

(defn ensure-ready!
  "Ensure the index is ready to be populated. Return false if it was already ready."
  [force-recreation?]
  (if (or force-recreation? (not (exists? *active-table*)))
    (reset-index!)
    (reset! initialized? true)))
