(ns metabase-enterprise.semantic-search.env
  (:require
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]))

;; global configuration / state containment facility
;; only core and the task definitions (for which integration with metabase demands globals)
;; should need these

;; TODO: Probably remove completely, all occurrences should be using db.connection
(defn get-pgvector-datasource!
  "Returns the instances pgvector Datasource, initializing lazily if needed."
  []
  (semantic.db.datasource/ensure-initialized-data-source!))

(defn get-configured-embedding-model
  "Returns the currently configured embedding model from settings."
  []
  (semantic.embedding/get-configured-model))

(defn get-index-metadata
  "Returns this instances index metadata configuration.
  Currently, an instance only has one metadata root, so this will always have the same value in production."
  []
  ;; still useful to indirect this for tests
  semantic.index-metadata/default-index-metadata)
