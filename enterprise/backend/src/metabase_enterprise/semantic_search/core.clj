(ns metabase-enterprise.semantic-search.core
  "Enterprise implementations of semantic search core functions using defenterprise."
  (:require
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise supported?
  "Enterprise implementation of semantic search engine support check."
  :feature :semantic-search
  []
  (and
   (some? semantic.db/db-url)
   (semantic.settings/semantic-search-enabled)))

(defenterprise results
  "Enterprise implementation of semantic search results."
  :feature :semantic-search
  [search-ctx]
  (when-not @semantic.db/data-source (semantic.db/init-db!))
  (semantic.index/query-index @semantic.db/data-source (semantic.embedding/get-active-model) search-ctx))

(defenterprise update-index!
  "Enterprise implementation of semantic index updating."
  :feature :semantic-search
  [document-reducible]
  (when-not @semantic.db/data-source (semantic.db/init-db!))
  (let [documents (vec document-reducible)]
    (when (seq documents)
      (semantic.index/upsert-index! @semantic.db/data-source (semantic.embedding/get-active-model) documents))))

(defenterprise delete-from-index!
  "Enterprise implementation of semantic index deletion."
  :feature :semantic-search
  [model ids]
  (when-not @semantic.db/data-source (semantic.db/init-db!))
  (semantic.index/delete-from-index! @semantic.db/data-source (semantic.embedding/get-active-model) model ids))

;; TODO: add reindexing/table-swapping logic when index is detected as stale
(defenterprise init!
  "Initialize the semantic search table and populate it with initial data."
  :feature :semantic-search
  [searchable-documents _opts]
  (doto (semantic.db/init-db!)
    (semantic.index/create-index-table! (semantic.embedding/get-active-model) {:force-reset? false})
    (semantic.index/populate-index! (semantic.embedding/get-active-model) (into [] searchable-documents))))

(defenterprise reindex!
  "Reindex the semantic search index."
  :feature :semantic-search
  [searchable-documents _opts]
  (when-not @semantic.db/data-source (semantic.db/init-db!))
  (doto @semantic.db/data-source
    (semantic.index/create-index-table! (semantic.embedding/get-active-model) {:force-reset? false})
    (semantic.index/populate-index! (semantic.embedding/get-active-model) (into [] searchable-documents))))

;; TODO: implement
(defenterprise reset-tracking!
  "Enterprise implementation of semantic search tracking reset."
  :feature :semantic-search
  []
  nil)

(comment
  (update-index! [{:model "card"
                   :id "1"
                   :searchable_text "This is a test card"}
                  {:model "card"
                   :id "2"
                   :searchable_text "This is a test card too"}
                  {:model "dashboard"
                   :id "3"
                   :searchable_text "This is a test dashboard"}])
  (delete-from-index! "card" ["1" "2"]))
