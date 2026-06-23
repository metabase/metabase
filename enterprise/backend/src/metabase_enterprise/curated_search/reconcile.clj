(ns metabase-enterprise.curated-search.reconcile
  "Reconciles the pgvector mirror with the authoritative appdb `curated_search_entries` table.

  Rather than streaming individual writes (the table is curated and small — hundreds to low thousands of
  rows), [[reconcile!]] diffs the whole table against the mirror by content hash on every run: rows whose
  hash is missing or stale are re-embedded and upserted, mirror rows with no appdb counterpart are
  deleted, unchanged rows cost nothing.
  Because each run re-derives the mirror from the appdb, any missed write — pgvector downtime, a crashed
  node, an import that bypassed the model hooks — is repaired on the next run with no operator action.

  Runs from the [[metabase-enterprise.curated-search.task.sync]] Quartz job; callers supply the
  datasource and embedding model so this namespace reads no settings itself."
  (:require
   [buddy.core.hash :as buddy-hash]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.curated-search.index-table :as index-table]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private embed-batch-size
  "Rows embedded per embedding-service request while backfilling stale mirror rows."
  50)

(defn content-hash
  "Hash of an appdb row's mirror-relevant fields.
  Stored on the mirror row at upsert time; a mismatch (or absence) marks the row stale."
  [{:keys [search_prompt usage_instructions entity verified]}]
  (u/encode-base64-bytes
   (buddy-hash/sha1
    (json/encode (sorted-map :search_prompt      search_prompt
                             :usage_instructions (or usage_instructions "")
                             :entity             entity
                             :verified           (boolean verified))))))

(defn- mirror-hashes
  "Map of index_id -> content_hash for every row currently in the mirror."
  [pgvector]
  (into {}
        (map (juxt :index_id :content_hash))
        (jdbc/execute! pgvector
                       [(format "SELECT index_id, content_hash FROM \"%s\"" index-table/*vectors-table*)]
                       {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

(defn- delete-rows! [pgvector ids]
  (when (seq ids)
    (jdbc/execute! pgvector
                   (-> (sql.helpers/delete-from (keyword index-table/*vectors-table*))
                       (sql.helpers/where [:in :index_id ids])
                       (sql/format {:quoted true})))))

(defn- row->record [row hash embedding]
  {:index_id           (:id row)
   :search_prompt      (:search_prompt row)
   :usage_instructions (or (:usage_instructions row) "")
   :entity             [:cast (json/encode (:entity row)) :jsonb]
   :verified           (boolean (:verified row))
   :content_hash       hash
   :embedding          [:raw (index-table/format-embedding embedding)]})

(defn- upsert-batch!
  "Embed one batch of stale appdb rows and upsert them into the mirror.
  Returns the number of rows upserted."
  [pgvector embedding-model rows]
  (let [embeddings (embedding/get-embeddings-batch embedding-model (map :search_prompt rows)
                                                   {:type :index :record-tokens? true})
        records    (map (fn [row embedding] (row->record row (content-hash row) embedding))
                        rows embeddings)]
    (jdbc/execute! pgvector
                   (-> (sql.helpers/insert-into (keyword index-table/*vectors-table*))
                       (sql.helpers/values (vec records))
                       (sql.helpers/on-conflict :index_id)
                       (sql.helpers/do-update-set :search_prompt :usage_instructions :entity
                                                  :verified :content_hash :embedding)
                       (sql/format {:quoted true})))
    (count rows)))

(defn reconcile!
  "Bring the pgvector mirror in line with the appdb table; see the namespace docstring for the approach.
  Embedding-service calls are scoped to changed rows only.
  A failed batch is logged and skipped — its rows stay stale and are retried on the next run.
  Returns {:upserted n :deleted n :unchanged n}."
  [pgvector embedding-model]
  (index-table/ensure-tables! pgvector embedding-model)
  (let [appdb-rows (t2/select [:model/CuratedSearchEntry :id :search_prompt :usage_instructions
                               :entity :verified])
        mirrored   (mirror-hashes pgvector)
        stale      (remove #(= (content-hash %) (get mirrored (:id %))) appdb-rows)
        orphans    (remove (set (map :id appdb-rows)) (keys mirrored))
        upserted   (transduce
                    (partition-all embed-batch-size)
                    (completing
                     (fn [n batch]
                       (+ n (try
                              (upsert-batch! pgvector embedding-model batch)
                              (catch Exception e
                                (log/error e "curated search mirror: failed to upsert batch of"
                                           (count batch) "rows; will retry next run")
                                0)))))
                    0
                    stale)]
    (delete-rows! pgvector orphans)
    {:upserted  upserted
     :deleted   (count orphans)
     :unchanged (- (count appdb-rows) (count stale))}))
