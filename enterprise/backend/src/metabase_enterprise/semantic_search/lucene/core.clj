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
  (or (transduce (comp (partition-all batch-size) (map write-batch!))
                 (partial merge-with +)
                 document-reducible)
      {}))

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
      (lucene.store/delete-other-spaces! space)
      (lucene.index/delete-all!))
    (if (or force-reset? re-populate? (zero? (:n (lucene.store/space-stats space))))
      (update! searchable-documents)
      (do
        (log/debug "Semantic search embeddings are already populated, skipping initial population")
        {}))))

(defn- model-id-of [document]
  [(:model document) (str (:id document))])

(defn- backfill-batch!
  "Persist only the documents of this batch that `stored` does not already have, recording every id in `seen`."
  [stored seen documents]
  (swap! seen into (map model-id-of) documents)
  (let [absent (remove (comp stored model-id-of) documents)]
    (if (seq absent)
      (write-batch! absent)
      {})))

(defn repair!
  "Bring the embedding table and this node's index back in line with `searchable-documents`.

  Backfills documents the table is missing -- whatever an unavailable embedder skipped -- and drops rows for
  documents that no longer exist, or that belong to an embedding space this instance has moved off. Rows that are
  already there are left alone: rewriting them would move every one of their `updated_at` timestamps and make every
  node in the cluster re-import the whole corpus on its next sync.

  Returns `{:index-id … :orphans … :snapshot-at …}`, the shape
  `metabase-enterprise.semantic-search.task.index-repair` reports on."
  [searchable-documents]
  (lucene.index/ensure-open!)
  (let [space       (lucene.store/space-id)
        snapshot-at (t/offset-date-time)
        stored      (lucene.store/stored-model-ids space)
        seen        (atom #{})]
    (transduce (comp (partition-all batch-size)
                     (map (partial backfill-batch! stored seen)))
               (partial merge-with +)
               searchable-documents)
    (let [stale     (into [] (remove @seen) stored)
          abandoned (lucene.store/delete-other-spaces! space)]
      (doseq [[model pairs] (group-by first stale)]
        (delete! model (map second pairs)))
      (when (seq stale)
        (log/infof "Dropped %d stale semantic search embeddings" (count stale)))
      (when (pos? abandoned)
        (log/infof "Dropped %d semantic search embeddings from abandoned embedding spaces" abandoned))
      {:index-id    nil
       :orphans     (count stale)
       :snapshot-at snapshot-at})))
