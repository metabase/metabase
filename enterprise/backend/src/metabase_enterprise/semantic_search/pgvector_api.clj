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
  (let [base                 (semantic.index/default-index embedding-model)
        default-table-name   (:table-name base)
        generated-table-name (if force-reset?
                               (str default-table-name "_" (semantic.index/model-table-suffix))
                               default-table-name)
        table-name           (semantic.index/hash-identifier-if-exceeds-pg-limit generated-table-name)]
    (-> (assoc base :table-name table-name)
        (semantic.index-metadata/qualify-index index-metadata))))

(defn- ensure-index-tables!
  "Idempotently create the index table and its dead-letter-queue table for `index`/`index-id`."
  [tx index-metadata index index-id]
  (semantic.index/create-index-table-if-not-exists! tx index)
  (semantic.dlq/create-dlq-table-if-not-exists! tx index-metadata index-id))

(defn initialize-index!
  "Establishes the index for the configured embedding model + embedding-text version.

  - `force-reset?` builds a brand-new (timestamped) index and activates it immediately.
  - When a compatible index already exists (same provider/model/dimensions AND embedding-text
    version), it is reused — activated immediately if it isn't already active, except when it is
    the index currently being built in the background (then the build continues).
  - When there is no active index at all, the desired index is created and activated (bootstrap).
  - When the active index has the *same embedding model* but a *different embedding-text version*
    (i.e. `embeddable-text` changed), the desired index is built in the background (blue-green):
    recorded and pointed at by `index_control.building_id` while the old index keeps serving. The
    indexer backfills it and atomically swaps it active once caught up (see indexer/swap-active!).
  - Any other difference (an embedding *model* switch) activates the new index immediately, as
    before — old indexes remain available and are cleaned up later.

  Returns the index map for the index that callers should treat as the target of this call."
  [tx index-metadata embedding-model opts]
  (let [force-new-index (:force-reset? opts)
        etv             (semantic.index/current-embedding-text-version)
        active-state    (semantic.index-metadata/get-active-index-state tx index-metadata)
        building-id     (-> (semantic.index-metadata/get-building-index-state tx index-metadata)
                            :metadata-row :id)
        compatible      (when-not force-new-index
                          (semantic.index-metadata/find-compatible-index! tx index-metadata embedding-model etv))
        compatible-id   (-> compatible :metadata-row :id)
        ;; The active index uses the same embedding model but a different embedding-text version
        ;; than the configured one -> the embedded-document representation changed.
        same-model-new-text-version?
        (and active-state
             (nil? compatible)
             (= embedding-model (:embedding-model (:index active-state)))
             (not= etv (:embedding-text-version (:index active-state))))]
    (cond
      ;; Explicit force-reset: brand-new timestamped index, activated immediately (start-fresh).
      force-new-index
      (let [index    (fresh-index index-metadata embedding-model opts)
            index-id (semantic.index-metadata/record-new-index-table! tx index-metadata index)]
        (ensure-index-tables! tx index-metadata index index-id)
        (semantic.index-metadata/activate-index! tx index-metadata index-id)
        index)

      ;; A compatible index is already active -> steady state, reuse it.
      (and compatible (:active compatible))
      (let [{:keys [index metadata-row]} compatible]
        (ensure-index-tables! tx index-metadata index (:id metadata-row))
        index)

      ;; The compatible index is the one currently building in the background -> keep building it,
      ;; do not activate (the indexer swaps it in once caught up).
      (and compatible (= compatible-id building-id))
      (let [{:keys [index]} compatible]
        (ensure-index-tables! tx index-metadata index compatible-id)
        index)

      ;; A compatible-but-inactive index exists (e.g. switching back to a previously used model, or
      ;; a completed build that hasn't been activated) -> activate it immediately.
      compatible
      (let [{:keys [index]} compatible]
        (ensure-index-tables! tx index-metadata index compatible-id)
        (semantic.index-metadata/activate-index! tx index-metadata compatible-id)
        index)

      ;; No active index at all -> bootstrap: create and activate immediately.
      (nil? active-state)
      (let [index    (fresh-index index-metadata embedding-model opts)
            index-id (semantic.index-metadata/record-new-index-table! tx index-metadata index)]
        (ensure-index-tables! tx index-metadata index index-id)
        (semantic.index-metadata/activate-index! tx index-metadata index-id)
        index)

      ;; Same embedding model, new embedding-text version -> build the new representation in the
      ;; background and let the indexer swap it in once caught up (blue-green, zero-downtime).
      same-model-new-text-version?
      (let [index    (fresh-index index-metadata embedding-model opts)
            index-id (semantic.index-metadata/record-new-index-table! tx index-metadata index)]
        (ensure-index-tables! tx index-metadata index index-id)
        (semantic.index-metadata/set-building-index! tx index-metadata index-id)
        (log/infof "Embedding-text version changed; building %s in the background for a blue-green swap"
                   (:table-name index))
        index)

      ;; Otherwise (an embedding model switch) -> create and activate immediately, as before.
      :else
      (let [index    (fresh-index index-metadata embedding-model opts)
            index-id (semantic.index-metadata/record-new-index-table! tx index-metadata index)]
        (ensure-index-tables! tx index-metadata index index-id)
        (log/infof "Configured model does not match active index, switching to new index %s" (:table-name index))
        (semantic.index-metadata/activate-index! tx index-metadata index-id)
        index))))

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
