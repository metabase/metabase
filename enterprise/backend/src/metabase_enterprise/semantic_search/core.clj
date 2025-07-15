(ns metabase-enterprise.semantic-search.core
  "Enterprise implementations of semantic search core functions using defenterprise."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase.premium-features.core :refer [defenterprise]]))

;; TODO: Update :feature from :none to the appropriate token feature once semantic search feature is added

(defenterprise supported?
  "Enterprise implementation of semantic search engine support check."
  :feature :none
  []
  ;; TODO: figure out the right criteria here
  true)

(defenterprise results
  "Enterprise implementation of semantic search results."
  :feature :none
  [search-ctx]
  (semantic.index/query-index search-ctx))

(defenterprise update-index!
  "Enterprise implementation of semantic index updating."
  :feature :none
  [document-reducible]
  (let [documents (vec document-reducible)]
    (when (seq documents)
      (semantic.index/upsert-index! documents))
    (->> documents
         (group-by :model)
         (map (fn [[model docs]] [model (count docs)]))
         (into {}))))

(defenterprise delete-from-index!
  "Enterprise implementation of semantic index deletion."
  :feature :none
  [model ids]
  (semantic.index/delete-from-index! model ids)
  {model (count ids)})

;; TODO: add reindexing logic when index is detected as stale
(defenterprise init!
  "Initialize the semantic search table and populate it with initial data."
  :feature :none
  [searchable-documents opts]
  (semantic.db/init-db!)
  (semantic.index/create-index-table! {:force-reset? true})
  (semantic.index/populate-index! (into [] searchable-documents)))

(defenterprise reindex!
  "Reindex the semantic search index."
  :feature :none
  [searchable-documents _opts]
  ;; TODO:implement reindexing without dropping the table
  (semantic.index/create-index-table! {:force-reset? true})
  (semantic.index/populate-index! (into [] searchable-documents)))

(defenterprise reset-tracking!
  "Enterprise implementation of semantic search tracking reset."
  :feature :none
  []
  nil)
