(ns metabase-enterprise.semantic-search.pgvector-api
  "High-level API for pgvector based semantic search over metabase.search documents.

  Provides the primary interface for search, indexing, and document management.

  Determines which index to target in the database using the index-metadata lib.

  Important: The pgvector database must be setup for metadata by calling (init-semantic-search!)
  After this, the document management and query functions will work as long as you pass the same index-metadata configuration."
  (:require
   [metabase-enterprise.semantic-search.db.connection :as semantic.db.connection]
   [metabase-enterprise.semantic-search.db.migration :as semantic.db.migration]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.gate :as semantic.gate]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.repair :as semantic.repair]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import (java.time Instant)))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [unresolved-require]}
(comment
  (require '[metabase-enterprise.semantic-search.db.datasource :as semantic.db])
  (def pgvector (or @semantic.db/data-source (semantic.db/init-db!)))
  (def index-metadata semantic.index-metadata/default-index-metadata)

  (require '[metabase-enterprise.semantic-search.embedding :as semantic.embedding])
  (def embedding-model (semantic.embedding/get-configured-model)))

(defn- fresh-index [index-metadata embedding-model & {:keys [force-reset?]}]
  (let [default-table-name   (semantic.index/model-table-name embedding-model)
        generated-table-name (if force-reset?
                               (str default-table-name "_" (semantic.index/model-table-suffix))
                               default-table-name)
        table-name           (semantic.index/hash-identifier-if-exceeds-pg-limit generated-table-name)]
    (-> (semantic.index/default-index embedding-model :table-name table-name)
        (semantic.index-metadata/qualify-index index-metadata))))

(defn initialize-index!
  "Creates an index for the provided embedding model (if it does not exist or if we're asking to force reset).

  Returns the index that you can use with semantic.search.index functions to operate on the index."
  [tx index-metadata embedding-model opts]
  (let [force-new-index (:force-reset? opts)

        {:keys [index metadata-row active]}
        (if force-new-index
          {:index (fresh-index index-metadata embedding-model opts)}
          (or (semantic.index-metadata/find-compatible-index! tx index-metadata embedding-model)
              {:index (fresh-index index-metadata embedding-model opts)}))

        index-id (or (:id metadata-row) (semantic.index-metadata/record-new-index-table! tx index-metadata index))]

    (semantic.index/create-index-table-if-not-exists! tx index)
    (semantic.dlq/create-dlq-table-if-not-exists! tx index-metadata index-id)

    (when-not active
      (log/infof "Configured model does not match active index, switching to new index %s" (u/pprint-to-str index))
      (semantic.index-metadata/activate-index! tx index-metadata index-id))

    index))

(defn init-semantic-search!
  "Initialises a pgvector database for semantic search if it does not exist and creates an index for the provided
  embedding model (if it does not exist).

  Returns the index that you can use with semantic.search.index functions to operate on the index.

  Designed to be called once at application startup (or in tests)."
  [pgvector index-metadata embedding-model & {:as opts}]
  (semantic.db.connection/with-migrate-tx [tx pgvector]
    (semantic.db.migration/maybe-migrate! tx {:index-metadata index-metadata
                                              :embedding-model embedding-model})
    (initialize-index! tx index-metadata embedding-model opts)))

;; query/index-mgmt require an active index to be established first.
;; init-semantic-search! must be called on startup
(defn- ensure-active-index-state [pgvector index-metadata]
  (or (semantic.index-metadata/get-active-index-state pgvector index-metadata)
      (throw (ex-info "No active semantic search index found" {:index-metadata index-metadata}))))

(defn query
  "Executes a semantic search query against the active index. Returns results and metadata about filtering.
  Requires init-semantic-search! to have been called first to establish active index, otherwise an exception will be thrown."
  [pgvector index-metadata search-context]
  (let [{:keys [index]} (ensure-active-index-state pgvector index-metadata)]
    (semantic.index/query-index pgvector index search-context)))

(defn index-documents!
  "Indexes documents into the active semantic search index.
  Documents are upserted - existing documents with same id are replaced.

  This is the 'immediate mode' API for inserting documents, the expected production behaviour
  is to instead (gate-updates!) the documents and allow the indexer task to pick them up.

  `documents` is a logical collection, but can be reducible to save memory usage."
  [pgvector index-metadata documents]
  (let [{:keys [index]} (ensure-active-index-state pgvector index-metadata)]
    (semantic.index/upsert-index! pgvector index documents)))

(defn gate-updates!
  "Stages document updates through the gate table to enable async indexing. See gate.clj.

  If passed a repair-table name, document models & IDs are also recorded in that table to enable detection of
  lost deletes.

  NOTE: Returns a frequency map of input {model id-count} for compatibility with existing caller expectations -
  but it is redundant and should otherwise be ignored."
  [pgvector index-metadata documents & {:keys [repair-table]}]
  (let [now (Instant/now)]
    (transduce
     (partition-all (min 512 (semantic.settings/ee-search-gate-max-batch-size)))
     (completing
      (fn [acc documents]
        (->> documents
             (mapv #(semantic.gate/search-doc->gate-doc % now))
             (semantic.gate/gate-documents! pgvector index-metadata))
        (when repair-table
          (semantic.repair/populate-repair-table! pgvector repair-table documents))
        (merge-with + acc (frequencies (map :model documents)))))
     {}
     documents)))

(defn gate-deletes!
  "Stages document deletes through the gate table for async indexing. See gate.clj.

  NOTE: Returns a frequency map of input {model id-count} for compatibility with existing caller expectations -
  but it is redundant and should otherwise be ignored."
  [pgvector index-metadata model ids]
  (let [now (Instant/now)]
    (transduce
     (partition-all (min 512 (semantic.settings/ee-search-gate-max-batch-size)))
     (completing
      (fn [acc ids]
        (->> ids
             (mapv #(semantic.gate/deleted-search-doc->gate-doc model % now))
             (semantic.gate/gate-documents! pgvector index-metadata))
        (merge-with + acc {model (count ids)})))
     {}
     ids)))

(defn delete-documents!
  "Removes documents from the active index by model (search.spec model string) and ids.
  `ids` is a logical collection, but can be reducible to save memory usage."
  [pgvector index-metadata model ids]
  (let [{:keys [index]} (ensure-active-index-state pgvector index-metadata)]
    (semantic.index/delete-from-index! pgvector index model ids)))

#_{:clj-kondo/ignore [:unresolved-require :metabase/modules]}
(comment
  (init-semantic-search! pgvector index-metadata embedding-model)
  (index-documents! pgvector index-metadata [{:model           "card"
                                              :id              "1"
                                              :searchable_text "This is a test card"}])
  (require '[metabase.test :as mt])
  (mt/as-admin (query pgvector index-metadata {:search-string "test card"}))

  (def index-state (ensure-active-index-state pgvector index-metadata))
  (def index (:index index-state))

  ;; warning: deletes everything
  (require 'next.jdbc)
  (next.jdbc/execute! pgvector ((requiring-resolve 'honey.sql/format) {:delete-from (keyword (:table-name index))} :quoted true))
  (def searchable-documents (vec ((requiring-resolve 'metabase.search.ingestion/searchable-documents))))
  (index-documents! pgvector index-metadata searchable-documents)
  (mt/as-admin (query pgvector index-metadata {:search-string "sharp objects"})))
