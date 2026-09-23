(ns metabase-enterprise.semantic-search.lucene.store
  "Reads and writes `semantic_search_embedding`, the app-DB table the Lucene semantic search backend indexes from.

  Every node writes here; every node syncs its own Lucene index from here. Rows are scoped by embedding space, so
  switching embedding model starts a fresh corpus without disturbing the old one."
  (:require
   [metabase-enterprise.semantic-search.db :as semantic-search.db]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.models.embedding :as semantic.models.embedding]
   [metabase.app-db.core :as mdb]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn space-id
  "Identifier of the embedding space the configured model writes into. Rows in other spaces are not ours.

  Throws when the configured embedding provider is not installed."
  []
  (:embedding-space-id (semantic.embedding/resolve-model (semantic.embedding/get-configured-model))))

;;;; Writing

(defn- cached-embeddings
  "Map of content hash → stored embedding bytes, for those of `hashes` already embedded in `space`."
  [space hashes]
  (when-let [hashes (not-empty (set hashes))]
    (into {}
          (map (juxt :content_hash :embedding))
          (semantic-search.db/embeddings-by-content-hash space hashes))))

(defn- embed-texts!
  "Map of content hash → embedding bytes for `texts`, or `{}` when the embedder cannot be called right now.

  Never throws: an unavailable embedding service must not stop metadata updates, and the periodic repair
  re-embeds whatever was skipped."
  [model texts]
  (if (semantic.embedding/embedder-circuit-untrusted?)
    (do
      (log/warn "Skipping semantic search embeddings: the embedding service circuit breaker is not closed")
      {})
    (let [collected (atom {})]
      (try
        (semantic.embedding/process-embeddings-streaming
         model
         (vec texts)
         (fn [text->embedding] (swap! collected merge text->embedding) nil)
         {:type :index :record-tokens? true})
        (into {}
              (map (fn [[text embedding]]
                     [(semantic.models.embedding/content-hash text)
                      (semantic.models.embedding/floats->bytes embedding)]))
              @collected)
        (catch Throwable t
          (log/warnf "Failed to generate semantic search embeddings, skipping this batch: %s" (ex-message t))
          {})))))

(def ^:private stored-document-keys
  "The document keys a stored row keeps: exactly what `row->document` in
  [[metabase-enterprise.semantic-search.lucene.index]] reads back, plus `model`/`id` for diagnostics.

  An ingestion document also carries `searchable_text`, `embeddable_text` and `display_data`, which together are
  two to three times the size of the rest and which nothing reads out of this table."
  [:model :id :legacy_input :display_type :archived :verified :curated
   :collection_id :creator_id :last_editor_id :database_id :created_at :updated_at])

(defn- document-row
  "The table row for one ingestion document, or nil when we have no embedding for it."
  [{:keys [space dims owner-ids embeddings]} {::keys [content-hash] :as document}]
  (when-let [embedding (get embeddings content-hash)]
    {:embedding_space_id space
     :model              (:model document)
     :model_id           (str (:id document))
     :name               (:name document)
     :archived           (boolean (:archived document))
     :content_hash       content-hash
     :dims               dims
     :embedding          embedding
     ;; Enough of the document travels with the row that a node can rebuild its Lucene index from this table alone.
     :document           (-> document
                             (select-keys stored-document-keys)
                             (assoc :personal_owner_id (get owner-ids (:collection_id document))))}))

(defn- write-rows!
  "Replace `rows` in one transaction. Toucan has no portable upsert, so delete the ids then insert them."
  [space rows]
  (mdb/with-conflict-retry
    (t2/with-transaction [_conn]
      (doseq [[model model-rows] (group-by :model rows)]
        (semantic-search.db/delete-embeddings! space model (mapv :model_id model-rows)))
      (semantic-search.db/insert-embeddings! rows))))

(defn upsert-documents!
  "Persist one batch of ingestion `documents` into `semantic_search_embedding`.

  Text that is already embedded in this space reuses the stored vector, so metadata-only changes — an archive, a
  view-count bump — never call the embedding provider. Documents whose embedding is missing and cannot be produced
  right now are skipped, and the periodic repair backfills them.

  Returns `{:rows <the rows written> :report {model n}}`."
  [documents]
  (let [documents (vec documents)]
    (if (empty? documents)
      {:rows [] :report {}}
      (let [model      (semantic.embedding/get-configured-model)
            space      (:embedding-space-id (semantic.embedding/resolve-model model))
            hashed     (mapv #(assoc % ::content-hash (semantic.models.embedding/content-hash (:embeddable_text %)))
                             documents)
            cached     (cached-embeddings space (map ::content-hash hashed))
            to-embed   (into #{}
                             (comp (remove #(contains? cached (::content-hash %)))
                                   (map :embeddable_text))
                             hashed)
            embeddings (merge cached (when (seq to-embed) (embed-texts! model to-embed)))
            context    {:space      space
                        :dims       (:vector-dimensions model)
                        :owner-ids  (semantic.index/batch-resolve-personal-owner-ids (map :collection_id documents))
                        :embeddings embeddings}
            rows       (into [] (keep (partial document-row context)) hashed)]
        (when (seq rows)
          (write-rows! space rows))
        {:rows rows :report (frequencies (map :model rows))}))))

(defn delete-documents!
  "Delete the rows for `model` and `ids` in the current embedding space, returning the number deleted."
  [model ids]
  (if (seq ids)
    (semantic-search.db/delete-embeddings! (space-id) model (mapv str ids))
    0))

(defn delete-space!
  "Delete every row of `space`, returning the number deleted."
  [space]
  (semantic-search.db/delete-embedding-space! space))

(defn delete-other-spaces!
  "Delete the rows of every embedding space but `space`, returning the number deleted.

  Switching embedding model abandons a whole space, and nothing else reclaims it under this backend: the pgvector
  index-cleanup job does not run here."
  [space]
  ;; This assumes one configured embedding model per deployment. Mid-rollout, nodes on the old and the new model
  ;; each see the other's rows as abandoned and delete them, so the corpus is re-embedded once per flip until they
  ;; converge -- costly but self-correcting, since embeddings are derived data. Scoping the delete by age or by
  ;; node would trade that for rows that are never reclaimed at all.
  ;;
  ;; The per-node index directory of an abandoned space is left on disk; evicting sibling directories is a
  ;; deliberate follow-up (PLAN cut list item 1), and a restart is the workaround.
  (semantic-search.db/delete-embeddings-outside-space! space))

(defn stored-model-ids
  "Set of `[model model_id]` pairs already stored in `space`."
  [space]
  (into #{} (map (juxt :model :model_id)) (semantic-search.db/embedding-model-ids space)))

;;;; Reading

(defn space-stats
  "`{:n <row count> :mx <latest updated_at>}` for `space` — the watermark a node syncs its Lucene index against."
  [space]
  (semantic-search.db/embedding-space-stats space))

(defn rows-after
  "Up to `limit` rows of `space` whose `id` is above `after-id`, lowest id first.

  `since` bounds the scan to rows written at or after it; pass nil to walk the whole space."
  [space after-id since limit]
  (semantic-search.db/embeddings-after space after-id since limit))

(defn model-ids
  "Every `{:model … :model_id …}` in `space`, for reconciling a local index against the table."
  [space]
  (semantic-search.db/embedding-model-ids space))

(defn rows-for-model-ids
  "Rows of `space` for the given `[model model-id]` pairs."
  [space model+ids]
  (into []
        (mapcat (fn [[model pairs]]
                  (semantic-search.db/embeddings-for-model space model (mapv second pairs))))
        (group-by first model+ids)))
