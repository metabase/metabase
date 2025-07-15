(ns metabase.search.semantic.core
  (:require
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.engine :as search.engine]
   [metabase.search.filter :as search.filter]
   [metabase.search.impl :as search.impl]
   [metabase.search.permissions :as search.permissions]))

(defn- oss-semantic-search-error
  "Helper function to throw semantic search enterprise feature error."
  []
  (oss-semantic-search-error))

(defenterprise maybe-init-db!
  "OSS stub for semantic database initialization."
  metabase-enterprise.semantic-search.core
  []
  (oss-semantic-search-error))

(defenterprise test-connection!
  "OSS stub for semantic database connection testing."
  metabase-enterprise.semantic-search.core
  []
  (oss-semantic-search-error))

(defenterprise init-db!
  "OSS stub for semantic database initialization."
  metabase-enterprise.semantic-search.core
  []
  (oss-semantic-search-error))

(defenterprise query-index
  "OSS stub for semantic index querying."
  metabase-enterprise.semantic-search.core
  [_search-string]
  (oss-semantic-search-error))

(defenterprise upsert-index!
  "OSS stub for semantic index upserting."
  metabase-enterprise.semantic-search.core
  [_documents]
  (oss-semantic-search-error))

(defenterprise delete-from-index!
  "OSS stub for semantic index deletion."
  metabase-enterprise.semantic-search.core
  [_model _ids]
  (oss-semantic-search-error))

(defenterprise create-index-table!
  "OSS stub for semantic index table creation."
  metabase-enterprise.semantic-search.core
  [_opts]
  (oss-semantic-search-error))

(defmethod search.engine/supported-engine? :search.engine/semantic [_]
  (try
    (maybe-init-db!)
    (test-connection!)
    true
    (catch Exception e
      (log/warn e "Semantic search engine not supported")
      false)))

(defn- semantic-result->search-result
  "Convert a semantic search result to the standard search result format."
  [result]
  (-> result
      (dissoc :distance)
      (assoc :score (- 1.0 (:distance result 0.0)))))

(defn- apply-search-permissions
  "Filter search results based on user permissions."
  [search-ctx results]
  (->> results
       (map semantic-result->search-result)
       (filter #(search.permissions/can-read? search-ctx %))
       (search.filter/search-context-filter search-ctx)))

(defmethod search.engine/results :search.engine/semantic
  [{:keys [search-string] :as search-ctx}]
  (when-not (str/blank? search-string)
    (try
      (maybe-init-db!)
      (let [results (query-index search-string)]
        (apply-search-permissions search-ctx results))
      (catch Exception e
        (log/error e "Error executing semantic search")
        []))))

(defmethod search.engine/model-set :search.engine/semantic
  [search-ctx]
  (let [results (search.engine/results search-ctx)]
    (->> results
         (map :model)
         (into #{}))))

(defmethod search.engine/update! :search.engine/semantic
  [_ document-reducible]
  (try
    (maybe-init-db!)
    (let [documents (vec document-reducible)]
      (when (seq documents)
        (upsert-index! documents))
      (->> documents
           (group-by :model)
           (map (fn [[model docs]] [model (count docs)]))
           (into {})))
    (catch Exception e
      (log/error e "Error updating semantic search index")
      {})))

(defmethod search.engine/delete! :search.engine/semantic
  [_ model ids]
  (try
    (maybe-init-db!)
    (delete-from-index! model ids)
    {model (count ids)}
    (catch Exception e
      (log/error e "Error deleting from semantic search index")
      {})))

(defmethod search.engine/init! :search.engine/semantic
  [_ {:keys [force-reset?] :or {force-reset? false}}]
  (try
    (log/info "Initializing semantic search engine")
    (init-db!)
    (create-index-table! {:force-reset? force-reset?})
    (log/info "Semantic search engine initialized successfully")
    (catch Exception e
      (log/error e "Failed to initialize semantic search engine")
      (throw e))))

(defmethod search.engine/reindex! :search.engine/semantic
  [engine opts]
  (try
    (log/info "Reindexing semantic search engine")
    (search.engine/init! engine (assoc opts :force-reset? true))
    (let [documents (search.impl/searchable-documents)]
      (search.engine/update! engine documents))
    (log/info "Semantic search engine reindexed successfully")
    (catch Exception e
      (log/error e "Failed to reindex semantic search engine")
      (throw e))))

(defmethod search.engine/reset-tracking! :search.engine/semantic [_]
  (log/debug "Reset tracking called for semantic search engine"))
