(ns metabase-enterprise.semantic-search.gate
  "The gate table (managed by index-metadata) decouples document ingestion from embedding computation and indexing.

  By avoiding producer/consumer coupling in this instance we get some advantages:
  - downstream consumers can take an unbounded amount of time without necessarily increasing memory usage or providing
    blocking backpressure onto search ingestion
  - downstream consumers can recover after transient indexing/embedding errors, or due to process loss during indexing.
  - multiple downstream indexes (or intermediate structures) can be maintained on a single document source
    without re-reading the data from the appdb.
  - provides opportunities to avoid wasted work when reindexing
    (which is ultimately still necessary as the search ingestion system itself can lose data).

  This namespace provides the `gate-documents!` function for writing gate documents and enforcing ordering guarantees.
  Additionally, polling support functions are defined for indexing (see the lib indexer).

  IMPORTANT: The gating mechanism is still based on heuristics, it alone is not enough to guarantee index convergence.
  It only allows you to converge on a consistent index more often than if it did not exist (i.e. Re-indexes can be less frequent, and less expensive).

  NOTE: The 'immediate mode' indexing apis in the libs: (index, pgvector-api) are still available and work as document
  but are not coordinated with any gated updates and therefore might race if gate indexers are also running."
  (:require [buddy.core.hash :as buddy-hash]
            [honey.sql :as sql]
            [metabase.util :as u]
            [metabase.util.json :as json]
            [metabase.util.log :as log]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as jdbc.rs])
  (:import (java.time Duration Instant)
           (org.postgresql.util PGobject)))

;; multiple threads can hit the gating table, row states can be committed in any order,
;; gated table provides a gated_at value which never decreases with new writes
;; regardless of commit ordering (via clock_timestamp())

;; ideal maximum write time (we can allow for some error in lag-tolerance).
;; we should see tx timeout policies set accordingly e.g: SET LOCAL statement_timeout
;; we should use one transaction per write to limit opportunity for error here.
(def ^Duration gate-write-timeout (Duration/ofSeconds 5))

(def max-batch-size
  "The maximum number of documents that can be sent to (gate-documents!) without causing an error"
  512)

(defn deleted-search-doc->gate-doc
  "Converts a deleted document reference into a gate table record.
  Document and hash are set to nil to signal deletion."
  [model id default-updated-at]
  {:id            (str model "_" id)
   :model         model
   :model_id      id
   :document      nil
   :document_hash nil
   :updated_at    default-updated-at})

(defn- document-hash [search-doc]
  (u/encode-base64-bytes (buddy-hash/sha1 (json/encode (into (sorted-map) search-doc)))))

(defn search-doc->gate-doc
  "Converts a search document into a gate table record, requires the document can be encoded as json."
  [search-doc default-updated-at]
  (let [{:keys [model id]} search-doc]
    {:id            (str model "_" id)
     :model         model
     :model_id      id
     :document      (doto (PGobject.)
                      (.setType "jsonb")
                      (.setValue (json/encode search-doc)))
     :document_hash (document-hash search-doc)
     :updated_at    (or (:updated_at search-doc) default-updated-at)}))

(defn gate-doc->search-doc
  "Converts a gate table record back to a search document."
  [gate-doc]
  (let [{:keys [^PGobject document]} gate-doc]
    (json/decode (.getValue document) keyword)))

(defn gate-documents!
  "Writes document changes to the gate table which improves ordering guarantees for downstream consumption.
  Will not update gate records if:
   a. It is an earlier document value according to the search documents updated_at value
   b. It is literally the same document and reindexing would be redundant
  Returns a count of rows actually updated/inserted."
  [pgvector index-metadata gate-document-batch]
  {:pre [;; countable only
         (seqable? gate-document-batch)
         ;; too many documents and we might see buffer size limits get hit in the driver, TODO: bench/play with this - document expectations
         (<= (bounded-count (inc max-batch-size) gate-document-batch) max-batch-size)]}
  ;; We will fix the transaction policy here (rather than letting caller decide) to encapsulate timeout behaviour
  ;; and to ensure the READ COMMITTED :isolation level is set.
  ;; NOTE: we depend on the UPDATE behaviour described here: https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED
  ;; i.e (the WHERE must be re-evaluated against the UPDATED row if another transaction commits concurrently).
  (jdbc/with-transaction [tx pgvector {:isolation :read-committed}]
    (when-some [gate-document-batch (->> gate-document-batch
                                         (sort-by :updated_at)
                                         (group-by :id)
                                         (map (fn [[id updates]]
                                                (when (< 1 (count updates))
                                                  (log/warnf "More than one (%d) update issued for a gate entry: %s" (count updates) id))
                                                (peek updates)))
                                         seq)]
      (let [{:keys [gate-table-name]} index-metadata
            upsert-q   {:insert-into   (keyword gate-table-name)
                        ;; sort to ensure locks are acquired predictably
                        :values        (sort-by :id gate-document-batch)
                        :on-conflict   [:id]
                        :do-update-set {:fields {:updated_at    :excluded.updated_at
                                                 :model         :excluded.model
                                                 :model_id      :excluded.model_id
                                                 :document      :excluded.document
                                                 :document_hash :excluded.document_hash
                                                 :gated_at      [:clock_timestamp]}
                                        :where  [:and
                                                 ;; in the case of an updated_at collision, simulate old behaviour, later transactions on the gate win.
                                                 [:<= (keyword gate-table-name "updated_at") :excluded.updated_at]
                                                 ;; content diff
                                                 [:case
                                                  ;; now deleted, delete if was not previously
                                                  [:= nil :excluded.document_hash]
                                                  [:!= nil (keyword gate-table-name "document_hash")]

                                                  ;; was deleted (now has a value) - update
                                                  [:= nil (keyword gate-table-name "document_hash")]
                                                  true

                                                  ;; update if new value is different
                                                  :else
                                                  [:!= (keyword gate-table-name "document_hash") :excluded.document_hash]]]}}
            upsert-sql (sql/format upsert-q :quoted true)]
        (jdbc/execute! tx [(format "SET LOCAL statement_timeout = %d" (.toMillis gate-write-timeout))]) ; note pg cannot accept a parameter here
        (let [update-count (::jdbc/update-count (jdbc/execute-one! tx upsert-sql))]
          (log/infof "Gated %d document updates" update-count)
          update-count)))))

(defn poll
  "Find document (gate table) ids that are highly likely to have been updated. Due to commit lag, if called with a watermark
  close to the current postgres clock value, you will see some records with timestamps <= your watermark.
  Therefore, any downstream processing must be idempotent - duplicate delivery is expected and intended.

  Expect to receive a map with:
  - `:poll-time` the postgres clock value as-of this poll
  - `:update-candidates` a vector of [{:id, :document_hash, :gated_at}] maps.

  Options:
  - :limit (1000)
  - :lag-tolerance (Duration) (should be at least gate-write-timeout + some buffer for timeout variation)

  Call (next-watermark) on the result to determine where to poll next."
  [pgvector index-metadata watermark & {:keys [^Duration lag-tolerance
                                               limit]
                                        :or   {lag-tolerance (.multipliedBy gate-write-timeout 2) ; heuristic: still depends on postgres enforcing timeouts. We might still need a slow-pass over everything occasionally in the future.
                                               limit         1000}}]
  {:pre [(pos? limit)]}
  (let [last-poll-time    (or (:last-poll watermark) Instant/EPOCH)
        last-seen-time    (or (:gated_at (:last-seen watermark)) Instant/EPOCH)
        confidence-time   (.minus (Instant/ofEpochMilli (inst-ms last-poll-time)) lag-tolerance)
        gate-min          (if (< (inst-ms confidence-time) (inst-ms last-seen-time))
                            confidence-time
                            ;; We might not have seen everything with the last poll
                            ;; e.g. maybe there were more than :limit rows
                            ;; For this case - we would expect the last-seen to be behind the confidence window,
                            ;; and we should not skip ahead.
                            last-seen-time)
        poll-q            {:union-all
                           [{:select [[nil :id]
                                      [nil :document_hash]
                                      [[:clock_timestamp] :gated_at]]} ; return pgs clock value, to use as the :poll-time
                            {:select [:q.id :q.document_hash :q.gated_at]
                             :from
                             ;; subquery is important otherwise :limit is honey-ed into the outer union
                             [[{:select   [:id, :document_hash, :gated_at]
                                :from     [(keyword (:gate-table-name index-metadata))]
                                ;; the earliest timestamp where we might expect to find new documents
                                :where    [:>= :gated_at gate-min]
                                :order-by [[:gated_at :asc]]
                                :limit    limit}
                               :q]]}]}
        poll-sql          (sql/format poll-q :quoted true)
        rs                (jdbc/execute! pgvector poll-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})
        poll-time         (some #(when (nil? (:id %)) (:gated_at %)) rs)
        _                 (assert poll-time "expected poll time record (nil id)")
        update-candidates (filterv #(some? (:id %)) rs)]
    {:poll-time         poll-time
     :update-candidates update-candidates}))

(defn next-watermark
  "Given a poll result and the previous watermark, return next watermark (to be applied to poll at some future time)"
  [watermark {:keys [poll-time update-candidates]}]
  (let [max-seen-rf (fn [max-seen {:keys [gated_at] :as candidate}]
                      (cond
                        (nil? max-seen) candidate
                        (< (inst-ms (:gated_at max-seen)) (inst-ms gated_at)) candidate
                        :else max-seen))]
    {:last-poll poll-time
     :last-seen (reduce max-seen-rf (:last-seen watermark) update-candidates)}))

(defn resume-watermark
  "Extracts a watermark for resuming indexer processing - assuming the previous watermark was flushed
  to the metadata table."
  [metadata-row]
  (let [{:keys [indexer_last_poll
                indexer_last_seen
                indexer_last_seen_id
                indexer_last_seen_hash]} metadata-row]
    {:last-poll indexer_last_poll
     :last-seen (when indexer_last_seen_id
                  {:id            indexer_last_seen_id
                   :document_hash indexer_last_seen_hash
                   :gated_at      indexer_last_seen})}))

(defn flush-watermark!
  "Persists an indexer watermark to the corresponding row in the metadata table for resumption after restarts.
  Note: Issues an UPDATE, so assumes the metadata row exists (it should if you are polling!)."
  [pgvector index-metadata index watermark]
  (let [{:keys [last-poll last-seen]} watermark
        update-q {:update [(keyword (:metadata-table-name index-metadata))]
                  :set    {:indexer_last_poll      last-poll
                           :indexer_last_seen_id   (:id last-seen)
                           :indexer_last_seen      (:gated_at last-seen)
                           :indexer_last_seen_hash (:document_hash last-seen)}
                  :where  [:= :table_name (:table-name index)]}]
    (jdbc/execute! pgvector (sql/format update-q :quoted true))))

(comment
  (def pgvector ((requiring-resolve 'metabase-enterprise.semantic-search.env/get-pgvector-datasource!)))
  (def index-metadata ((requiring-resolve 'metabase-enterprise.semantic-search.env/get-index-metadata)))
  (def search-docs (vec ((requiring-resolve 'metabase.search.ingestion/searchable-documents))))

  (def null-updated-at (filter #(nil? (:updated_at %)) search-docs))
  (count null-updated-at)
  (take 1 null-updated-at)

  (count search-docs)

  (jdbc/execute! pgvector ["delete from index_gate"])

  (time
   (doseq [chunk (partition-all 512 search-docs)]
     (gate-documents! pgvector
                      index-metadata
                      (for [search-doc chunk
                            :let [search-doc (if (< (rand) 0.5)
                                               (assoc search-doc :updated_at (java.time.Instant/now))
                                               search-doc)]]
                        (search-doc->gate-doc search-doc (Instant/now))))))

  (jdbc/execute! pgvector ["select * from index_gate limit 100"])

  (def watermark
    {:last-poll java.time.Instant/EPOCH
     :last-seen nil})

  (def poll-result (poll pgvector index-metadata watermark))
  poll-result
  (reverse (sort (map :gated_at (:update-candidates poll-result))))

  (next-watermark watermark poll-result)

  (def active-index-state
    ((requiring-resolve 'metabase-enterprise.semantic-search.index-metadata/get-active-index-state)
     pgvector
     index-metadata))

  (def index (:index active-index-state))
  (flush-watermark! pgvector index-metadata index (next-watermark watermark poll-result))
  (jdbc/execute! pgvector ["select * from index_metadata where table_name = ?" (:table-name index)]))
