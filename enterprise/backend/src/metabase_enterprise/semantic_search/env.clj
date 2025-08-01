(ns metabase-enterprise.semantic-search.env
  (:require [metabase-enterprise.semantic-search.db :as semantic.db]
            [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
            [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]))

;; global configuration / state containment facility
;; only core and the task definitions (for which integration with metabase demands globals)
;; should need these

(defn get-pgvector-datasource! []
  (or @semantic.db/data-source (semantic.db/init-db!)))

(defn get-configured-embedding-model []
  (semantic.embedding/get-configured-model))

(defn get-index-metadata []
  semantic.index-metadata/default-index-metadata)
