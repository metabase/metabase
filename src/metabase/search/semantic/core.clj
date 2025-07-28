(ns metabase.search.semantic.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.util.log :as log]))

(defn- oss-semantic-search-error
  "Helper function to throw semantic search enterprise feature error."
  []
  (throw (ex-info "Semantic search is a premium feature and requires an enterprise license."
                  {:type :semantic-search-not-available})))

;; defenterprise functions that map directly to search.engine methods

(defenterprise supported?
  "Check if semantic search is supported on this instance."
  metabase-enterprise.semantic-search.core
  []
  false)

(defenterprise results
  "Execute a semantic search query and return results."
  metabase-enterprise.semantic-search.core
  [_search-ctx]
  (oss-semantic-search-error))

(defenterprise update-index!
  "Update the semantic search index with the given documents."
  metabase-enterprise.semantic-search.core
  [_document-reducible]
  (oss-semantic-search-error))

(defenterprise delete-from-index!
  "Delete documents from the semantic search index."
  metabase-enterprise.semantic-search.core
  [_model _ids]
  (oss-semantic-search-error))

(defenterprise init!
  "Initialize the semantic search index."
  metabase-enterprise.semantic-search.core
  [_searchable-documents _opts]
  (oss-semantic-search-error))

(defenterprise reindex!
  "Perform a full reindex of the semantic search engine."
  metabase-enterprise.semantic-search.core
  [_searchable-documents _opts]
  (oss-semantic-search-error))

(defenterprise reset-tracking!
  "Reset tracking for the semantic search engine."
  metabase-enterprise.semantic-search.core
  []
  (oss-semantic-search-error))

;; Search engine method implementations

(defmethod search.engine/supported-engine? :search.engine/semantic [_]
  (try
    (supported?)
    (catch Exception e
      (log/warn e "Semantic search engine not supported")
      false)))

(defmethod search.engine/results :search.engine/semantic
  [search-ctx]
  (try
    (results search-ctx)
    (catch Exception e
      (log/error e "Error executing semantic search")
      [])))

(defmethod search.engine/model-set :search.engine/semantic
  [_search-ctx]
  search.config/all-models)

;; NOTE if you remove this you need to also modify filter-read-permitted to handle indexed-entity docs.
;; See the corresponding note in metabase-enterprise.semantic-search.index/filter-read-permitted.
(defn- remove-indexed-entities
  "Remove indexed-entities from `document-reducible`"
  [document-reducible]
  (eduction (remove (comp #{"indexed-entity"} :model))
            document-reducible))

(defmethod search.engine/update! :search.engine/semantic
  [_ document-reducible]
  (try
    (log/info "Updating semantic search engine")
    (update-index! document-reducible)
    (catch Exception e
      (log/error e "Error updating semantic search engine")
      {})))

(defmethod search.engine/delete! :search.engine/semantic
  [_ model ids]
  (try
    (log/info "Deleting from semantic search engine")
    (delete-from-index! model ids)
    (catch Exception e
      (log/error e "Error deleting from semantic search engine")
      {})))

(defmethod search.engine/init! :search.engine/semantic
  [_ opts]
  (try
    (log/info "Initializing semantic search engine")
    (init! (search.ingestion/searchable-documents) opts)
    (catch Exception e
      (log/error e "Error initializing semantic search engine")
      (throw e))))

(defmethod search.engine/reindex! :search.engine/semantic
  [_ opts]
  (try
    (log/info "Reindexing semantic search engine")
    (reindex! (search.ingestion/searchable-documents) opts)
    (catch Exception e
      (log/error e "Error reindexing semantic search engine")
      (throw e))))

(comment
  (def docs (vec (search.ingestion/searchable-documents)))
  (init! docs {})
  (reindex! docs {}))

(defmethod search.engine/reset-tracking! :search.engine/semantic [_]
  (try
    (reset-tracking!)
    (catch Exception e
      (log/debug e "Error resetting tracking for semantic search engine"))))
