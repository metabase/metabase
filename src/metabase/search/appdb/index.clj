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

(set! *warn-on-reflection* true)

(def ^:private insert-batch-size 150)

(def ^:dynamic ^:private *active-table* (atom nil))

(def ^:dynamic ^:private *pending-table* (atom nil))

(defn active-table
  "The table against which we should currently make search queries."
  []
  @*active-table*)

(defn- pending-table
  "A partially populated table that will take over from [[active-table]] when it is done."
  []
  @*pending-table*)

(defn gen-table-name
  "Generate a unique table name to use as a search index table."
  []
  (keyword (str/replace (str "search_index_" (random-uuid)) #"-" "_")))

(defn- exists? [table-name]
  (t2/exists? :information_schema.tables :table_name (name table-name)))

(defn- drop-table! [table-name]
  (boolean
   (when (and table-name (exists? table-name))
     (t2/query (sql.helpers/drop-table table-name)))))

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
  (when (not (pending-table))
    (let [table-name (gen-table-name)]
      (when-not (exists? table-name)
        (create-table! table-name))
      (reset! *pending-table* table-name))))

(defn activate-table!
  "Make the pending index active if it exists. Returns true if it did so."
  ([]
   (activate-table! (pending-table)))
  ([table-name]
   (boolean
    (when (exists? table-name)
      (let [active (active-table)]
        (when (not= active table-name)
          (reset! *active-table* table-name)
          (swap! *pending-table* #(when (not= % table-name) %))
          (when active
            ;; TODO we need more graceful way to drop these
            (-> (Thread. (fn []
                           (Thread/sleep 1000)
                           (drop-table! active)))
                (.run)))))))))

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
  (let [entries          (map document->entry documents)
        ;; Ideally, we would reset these atoms if the corresponding tables don't exist.
        ;; We're about to rework this area, so just leaving this as a note for now.
        active-updated?  (safe-batch-upsert! (active-table) entries)
        pending-updated? (safe-batch-upsert! (pending-table) entries)]
    (when (or active-updated? pending-updated?)
      (->> entries (map :model) frequencies))))

(defmethod search.engine/reset-tracking! :search.engine/fulltext [_]
  (reset! *active-table* nil)
  (reset! *pending-table* nil))

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
  (if (or force-recreation? (not (exists? (active-table))))
    (reset-index!)
    true))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-temp-index-table
  "Create a temporary index table for the duration of the body."
  [& body]
  `(let [table-name# (gen-table-name)]
     (binding [*pending-table* (atom nil)
               *active-table*  (atom table-name#)]
       (try
         (create-table! table-name#)
         ~@body
         (finally
           (#'drop-table! table-name#))))))
