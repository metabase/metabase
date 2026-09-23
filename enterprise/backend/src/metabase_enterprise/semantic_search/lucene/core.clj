(ns metabase-enterprise.semantic-search.lucene.core
  "Write path for the Lucene semantic search backend.

  Every ingestion batch lands in `semantic_search_embedding` first and in this node's Lucene index second, so a
  write is searchable here immediately and on every other node once its sync catches up."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.lucene.store :as lucene.store]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private batch-size
  "Documents per embedding request and per transaction. Matches the batch size ingestion already uses."
  150)

(defn- write-batch!
  "Persist one batch of documents and index the rows that came back, returning its `{model n}` report."
  [documents]
  (let [{:keys [rows report]} (lucene.store/upsert-documents! documents)]
    (lucene.index/upsert-rows! rows)
    report))

(defn update!
  "Write a stream of ingestion documents to the table and this node's index, returning `{model n}` counts.

  Documents whose embedding could not be produced are left out of the counts; the periodic repair backfills them."
  [document-reducible]
  (lucene.index/ensure-open!)
  (transduce (comp (partition-all batch-size) (map write-batch!))
             (partial merge-with +)
             document-reducible))

(defn delete!
  "Remove `ids` of search `model` from the table and this node's index, returning `{model n}`."
  [model ids]
  (if (seq ids)
    (do
      (lucene.index/ensure-open!)
      (let [deleted (lucene.store/delete-documents! model ids)]
        (lucene.index/delete-ids! (map #(lucene.index/document-id model %) ids))
        {model deleted}))
    {}))

(defn init!
  "Make sure this instance has semantic search embeddings, populating them from `searchable-documents` when it does not.

  `:force-reset?` drops this embedding space's rows first; `:re-populate?` re-runs the whole corpus through the
  write path even when rows are already there. Other nodes pick the result up through their own sync."
  [searchable-documents {:keys [force-reset? re-populate?]}]
  (lucene.index/ensure-open!)
  (let [space (lucene.store/space-id)]
    (when force-reset?
      (log/info "Resetting semantic search embeddings")
      (lucene.store/delete-space! space)
      (lucene.index/delete-all!))
    (if (or force-reset? re-populate? (zero? (:n (lucene.store/space-stats space))))
      (update! searchable-documents)
      (do
        (log/debug "Semantic search embeddings are already populated, skipping initial population")
        {}))))

(defn- stale-model-ids
  "The `[model model-id]` pairs stored for `space` that `seen` did not turn up in the canonical document stream."
  [space seen]
  (into []
        (comp (map (juxt :model :model_id))
              (remove seen))
        (lucene.store/model-ids space)))

(defn repair!
  "Bring the embedding table and this node's index back in line with `searchable-documents`.

  Re-running the whole corpus through the write path backfills anything an unavailable embedder skipped; rows for
  documents that no longer exist are dropped. Returns `{:index-id … :orphans … :snapshot-at …}`, the shape
  `metabase-enterprise.semantic-search.task.index-repair` reports on."
  [searchable-documents]
  (lucene.index/ensure-open!)
  (let [space       (lucene.store/space-id)
        snapshot-at (t/offset-date-time)
        seen        (atom #{})]
    (transduce (comp (partition-all batch-size)
                     (map (fn [documents]
                            (swap! seen into (map (juxt :model (comp str :id))) documents)
                            (write-batch! documents))))
               (partial merge-with +)
               searchable-documents)
    (let [stale (stale-model-ids space @seen)]
      (doseq [[model pairs] (group-by first stale)]
        (delete! model (map second pairs)))
      (when (seq stale)
        (log/infof "Dropped %d stale semantic search embeddings" (count stale)))
      {:index-id    nil
       :orphans     (count stale)
       :snapshot-at snapshot-at})))
