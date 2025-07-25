(ns metabase-enterprise.semantic-search.core
  "Enterprise implementations of semantic search core functions using defenterprise."
  (:require
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [next.jdbc :as jdbc]))

(defn- get-pgvector-datasource! []
  (or @semantic.db/data-source (semantic.db/init-db!)))

(defn- get-configured-embedding-model []
  (semantic.embedding/get-configured-model))

(defn- get-index-metadata []
  semantic.index-metadata/default-index-metadata)

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
  (semantic.pgvector-api/query
   (get-pgvector-datasource!)
   (get-index-metadata)
   search-ctx))

(defenterprise update-index!
  "Enterprise implementation of semantic index updating."
  :feature :semantic-search
  [document-reducible]
  (let [pgvector (get-pgvector-datasource!)
        index-metadata (get-index-metadata)
        embedding-model (get-configured-embedding-model)]
    (jdbc/with-transaction [tx pgvector]
      (semantic.pgvector-api/init-semantic-search! tx index-metadata embedding-model))
    (semantic.pgvector-api/index-documents! pgvector index-metadata (vec document-reducible))))

(defenterprise delete-from-index!
  "Enterprise implementation of semantic index deletion."
  :feature :semantic-search
  [model ids]
  ;; If data-source has not been initialized, then presumably the index doesn't exist yet.
  (when @semantic.db/data-source
    (semantic.pgvector-api/delete-documents!
     (get-pgvector-datasource!)
     (get-index-metadata)
     model
     (vec ids))))

;; TODO: add reindexing/table-swapping logic when index is detected as stale
(defenterprise init!
  "Initialize the semantic search table and populate it with initial data."
  :feature :semantic-search
  [searchable-documents _opts]
  (let [pgvector (get-pgvector-datasource!)
        index-metadata (get-index-metadata)
        embedding-model (get-configured-embedding-model)]
    (jdbc/with-transaction [tx pgvector]
      (semantic.pgvector-api/init-semantic-search! tx index-metadata embedding-model))
    (semantic.pgvector-api/index-documents! pgvector index-metadata (vec searchable-documents))))

(defenterprise reindex!
  "Reindex the semantic search index."
  :feature :semantic-search
  [searchable-documents _opts]
  (let [pgvector (get-pgvector-datasource!)
        index-metadata (get-index-metadata)
        embedding-model (get-configured-embedding-model)]
    ;; todo force a new index
    (jdbc/with-transaction [tx pgvector]
      (semantic.pgvector-api/init-semantic-search! tx index-metadata embedding-model))
    (semantic.pgvector-api/index-documents! pgvector index-metadata (vec searchable-documents))))

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
