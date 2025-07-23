(ns metabase-enterprise.semantic-search.pgvector-api
  "High-level API for pgvector based semantic search over metabase.search documents.

  Provides the primary interface for search, indexing, and document management.

  Determines which index to target in the database using the index-metadata lib.

  Important: The pgvector database must be setup for metadata by calling (init-semantic-search!)
  After this, the document management and query functions will work as long as you pass the same index-metadata configuration."
  (:require
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]))

#_{:clj-kondo/ignore [unresolved-require]}
(comment
  (require '[metabase-enterprise.semantic-search.db :as semantic.db])
  (def pgvector (or @semantic.db/data-source (semantic.db/init-db!)))
  (def index-metadata semantic.index-metadata/default-index-metadata)

  (require '[metabase-enterprise.semantic-search.embedding :as semantic.embedding])
  (def embedding-model (semantic.embedding/get-configured-model)))

(defn init-semantic-search!
  "Initialises a pgvector database for semantic search if it does not exist and creates an index for the provided
  embedding model (if it does not exist).

  Returns the index that you can use with semantic.search.index functions to operate on the index.

  Designed to be called once at application startup (or in tests)."
  [pgvector index-metadata embedding-model]
  ;; called async on application startup see task/search_index.clj for the job entrypoint.
  ;; called under cluster lock, should not race across nodes.
  ;; each node does call this function independently so we should avoid redundant work
  ;; each node _should_ have the same environmental settings, and therefore the same global model
  (let [_                  (semantic.index-metadata/create-tables-if-not-exists! pgvector index-metadata)
        _                  (semantic.index-metadata/ensure-control-row-exists! pgvector index-metadata)
        active-index-state (semantic.index-metadata/get-active-index-state pgvector index-metadata)
        active-index       (:index active-index-state)
        active-model       (:embedding-model active-index)
        ;; Model switching: compare configured embedding-model vs currently active model.
        ;; If different, find/create appropriate index and activate it. This handles
        ;; environment changes (model config updates) without losing existing indexes.
        ;; nil active-model (no active index) is treated as model change so that a new index is created and made active
        model-changed      (not= embedding-model active-model)
        model-switching    (and active-model model-changed)]
    (when model-switching
      (log/infof "Configured model does not match active index, switching. Previous active: %s" (u/pprint-to-str active-index)))
    (if model-changed
      (let [{:keys [index
                    index-table-exists
                    metadata-row] :as bi}
            (semantic.index-metadata/find-best-index! pgvector index-metadata embedding-model)]
        ;; Metadata might exist without table (deleted manually) or table without metadata
        ;; (created outside this system). Both cases are handled gracefully.
        ;; We might delete some of this fancyness later once schema / setup etc solidifies
        (when-not index-table-exists
          (semantic.index/create-index-table-if-not-exists! pgvector index))
        (let [index-id (or (:id metadata-row) (semantic.index-metadata/record-new-index-table! pgvector index-metadata index))]
          (semantic.index-metadata/activate-index! pgvector index-metadata index-id))
        index)
      active-index)))

;; query/index-mgmt require an active index to be established first.
;; init-semantic-search! must be called on startup
(defn- ensure-active-index-state [pgvector index-metadata]
  (or (semantic.index-metadata/get-active-index-state pgvector index-metadata)
      (throw (ex-info "No active semantic search index found" {:index-metadata index-metadata}))))

(defn query
  "Executes a semantic search query against the active index.
  Requires init-semantic-search! to have been called first to establish active index, otherwise an exception will be thrown."
  [pgvector index-metadata search-context]
  (let [{:keys [index]} (ensure-active-index-state pgvector index-metadata)]
    (semantic.index/query-index pgvector index search-context)))

(defn index-documents!
  "Indexes documents into the active semantic search index.
  Documents are upserted - existing documents with same id are replaced.

  `documents` is a logical collection, but can be reducible to save memory usage."
  [pgvector index-metadata documents]
  (let [{:keys [index]} (ensure-active-index-state pgvector index-metadata)]
    (semantic.index/upsert-index! pgvector index documents)))

(defn delete-documents!
  "Removes documents from the active index by model (search.spec model string) and ids.
  `ids` is a logical collection, but can be reducible to save memory usage."
  [pgvector index-metadata model ids]
  (let [{:keys [index]} (ensure-active-index-state pgvector index-metadata)]
    (semantic.index/delete-from-index! pgvector index model ids)))

#_{:clj-kondo/ignore [unresolved-require]}
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
  (next.jdbc/execute! pgvector ((requiring-resolve 'honey.sql/format) {:delete-from (keyword (:table-name index))} :quoted true))
  (def searchable-documents (vec ((requiring-resolve 'metabase.search.ingestion/searchable-documents))))
  (index-documents! pgvector index-metadata searchable-documents)
  (mt/as-admin (query pgvector index-metadata {:search-string "sharp objects"})))
