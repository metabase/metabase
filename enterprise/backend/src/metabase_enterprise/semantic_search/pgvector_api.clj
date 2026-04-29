(ns metabase-enterprise.semantic-search.pgvector-api
  "High-level API for pgvector based semantic search over metabase.search documents.

  Provides the primary interface for search, indexing, and document management.

  Determines which index to target in the database using the index-metadata lib.

  Important: The pgvector database must be setup for metadata by calling (init-semantic-search!)
  After this, the document management and query functions will work as long as you pass the same index-metadata configuration."
  (:require
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.db.connection :as semantic.db.connection]
   [metabase-enterprise.semantic-search.db.migration :as semantic.db.migration]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.gate :as semantic.gate]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.repair :as semantic.repair]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
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

(defn- try-active-index-state
  "Active-index probe that returns nil rather than throwing when the feature is
   disabled, the datasource is unreachable, or no index is active. Mirrors the
   private helper of the same name in `embedders.clj` — kept duplicated rather
   than lifted to a shared util to avoid a circular require, and so that future
   embedder changes can't accidentally break the read-side helpers below."
  []
  (try
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          md       (semantic.env/get-index-metadata)]
      (when-let [state (semantic.index-metadata/get-active-index-state pgvector md)]
        {:pgvector   pgvector
         :table-name (-> state :index :table-name)
         :model      (-> state :index :embedding-model)}))
    (catch Throwable t
      (log/debug t "Semantic-search index not available")
      nil)))

(defn neighbors-of
  "Top-K nearest neighbors of `(model, model-id)` from the active pgvector
   semantic-search index, ordered by ascending cosine distance.

   Returns nil when no active index exists (feature off, datasource down, or
   no row in the active-index control table). Returns `[]` when the index is
   reachable but the seed row isn't present.

   Each result row: `{:model :model_id :distance}`. `:distance` is pgvector
   cosine distance (`<=>`) in `[0, 2]`; convert to similarity at the call
   site (typically `1 - distance` for unit-norm embeddings).

   Optional kwargs:
     :target-model      filter results to this model (e.g. \"card\"). nil = any.
     :exclude-archived? default true; excludes archived rows on both ends."
  [model model-id k & {:keys [target-model exclude-archived?]
                       :or   {exclude-archived? true}}]
  (when-let [{:keys [pgvector table-name]} (try-active-index-state)]
    (let [model-id-str (str model-id)
          tbl          (keyword table-name)
          seed-where   (cond-> [:and [:= :model model] [:= :model_id model-id-str]]
                         exclude-archived? (conj [:= :archived false]))
          where        (cond-> [:and [:not [:and [:= :model model]
                                            [:= :model_id model-id-str]]]]
                         target-model      (conj [:= :model target-model])
                         exclude-archived? (conj [:= :archived false]))
          sql-vec      (sql/format
                        {:with     [[:seed {:select [:embedding]
                                            :from   [tbl]
                                            :where  seed-where
                                            :limit  1}]]
                         :select   [:model :model_id
                                    [[:raw "embedding <=> (SELECT embedding FROM seed)"]
                                     :distance]]
                         :from     [tbl]
                         :where    where
                         :order-by [[[:raw "embedding <=> (SELECT embedding FROM seed)"] :asc]]
                         :limit    k}
                        {:quoted true})
          rows         (jdbc/execute! pgvector sql-vec
                                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
      ;; The seed CTE returns 0 rows when `(model, model-id)` isn't indexed; the
      ;; scalar subquery is then NULL and every row's distance is NULL too. We
      ;; flatten that to `[]` so callers can treat "missing seed" as "no
      ;; neighbors" without a special-case.
      (if (some-> rows first :distance some?)
        rows
        []))))

(defn indexed-row-count
  "Count of `model = ?` rows in the active index, optionally filtered to
   non-archived. Returns 0 when no active index is available."
  [model & {:keys [exclude-archived?] :or {exclude-archived? true}}]
  (if-let [{:keys [pgvector table-name]} (try-active-index-state)]
    (let [where (cond-> [:and [:= :model model]]
                  exclude-archived? (conj [:= :archived false]))
          row   (jdbc/execute-one! pgvector
                                   (sql/format {:select [[[:count :*] :ct]]
                                                :from   [(keyword table-name)]
                                                :where  where}
                                               {:quoted true})
                                   {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
      (or (:ct row) 0))
    0))

(defn reduce-indexed-ids
  "Streams `{:model :model_id}` rows for `model = ?` from the active index.
   `rf` is invoked per row (no batching — `next.jdbc/plan` is the source).
   Returns the final reduction. Returns `init` when no active index is
   available.

   Use this instead of returning a vector when the caller iterates many rows:
   avoids materializing the id list in memory."
  [model rf init & {:keys [exclude-archived?] :or {exclude-archived? true}}]
  (if-let [{:keys [pgvector table-name]} (try-active-index-state)]
    (let [where (cond-> [:and [:= :model model]]
                  exclude-archived? (conj [:= :archived false]))
          sql   (sql/format {:select [:model :model_id]
                             :from   [(keyword table-name)]
                             :where  where}
                            {:quoted true})]
      (transduce identity (completing rf) init
                 (jdbc/plan pgvector sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})))
    init))

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
  (jdbc/execute! pgvector (sql/format {:delete-from (keyword (:table-name index))} {:quoted true}))
  (def searchable-documents (vec ((requiring-resolve 'metabase.search.ingestion/searchable-documents))))
  (index-documents! pgvector index-metadata searchable-documents)
  (mt/as-admin (query pgvector index-metadata {:search-string "sharp objects"})))
