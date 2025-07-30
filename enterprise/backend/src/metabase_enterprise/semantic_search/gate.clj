(ns metabase-enterprise.semantic-search.gate
  (:require [buddy.core.hash :as buddy-hash]
            [honey.sql :as sql]
            [metabase.util.json :as json]
            [metabase.util.log :as log]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as jdbc.rs])
  (:import (java.time Duration Instant)
           (java.time.temporal Temporal)
           (org.postgresql.util PGobject)))

;; multiple threads hit the gating table, row states can be committed in any order, though the constraint
;; that updated_at < excluded.updated_at is expected to apply atomically with the corresponding row update (you need READ COMMITTED for this on pg)
;; stale updates will therefore be ignored.

;; ideal maximum write time (we can allow for some error in lag-tolerance).
;; we should set tx timeout policies accordingly. SET LOCAL statement_timeout = '5s'
;; we should use one transaction per write to limit opportunity for error here.
(def ^Duration gate-write-timeout (Duration/ofSeconds 5))

(defn signal-possibly-new-documents! [pgvector index-metadata gate-documents]
  {:pre [;; countable only
         (seqable? gate-documents)
         ;; too many documents and we might see buffer size limits get hit in the driver, TODO: bench/play with this - document expectations
         (<= (bounded-count 513 gate-documents) 512)]}
  ;; We will fix the transaction policy here (rather than letting caller decide) to encapsulate timeout behaviour
  ;; and to ensure the READ COMMITTED :isolation level is set.
  ;; NOTE: we depend on the UPDATE behaviour described here: https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED
  ;; i.e (the WHERE must be re-evaluated against the UPDATED row if another transaction commits concurrently).
  (jdbc/with-transaction [tx pgvector {:isolation :read-committed}]
    (when (seq gate-documents)
      (let [{:keys [gate-table-name]} index-metadata
            upsert-q   {:insert-into   [(keyword gate-table-name)]
                        ;; sort to ensure locks are acquired predictably
                        :values        (sort-by :id gate-documents)
                        :on-conflict   [:id]
                        :do-update-set {:fields {:updated_at    :excluded.updated_at
                                                 :document      :excluded.document
                                                 :document_hash :excluded.document_hash
                                                 :gated_at      [:clock_timestamp]}
                                        ;; in the case of an updated_at collision, simulate old behaviour, later transactions on the gate win.
                                        :where  [:and
                                                 [:<= (keyword gate-table-name "updated_at") :excluded.updated_at]
                                                 [:!= (keyword gate-table-name "document_hash") :excluded.document_hash]]}}
            upsert-sql (sql/format upsert-q :quoted true)]
        (jdbc/execute! tx [(format "SET LOCAL statement_timeout = %d" (.toMillis gate-write-timeout))]) ; note pg cannot accept a parameter here
        (let [update-count (::jdbc/update-count (jdbc/execute-one! tx upsert-sql))]
          (log/infof "Gated %d new documents" update-count)
          update-count)))))

(defn poll
  "Find document (gate table) ids that are highly likely to have been updated. Due to commit lag, if called with a watermark
  close to the current postgres clock value, you will see some records with timestamps <= your watermark.
  Therefore, any downstream processing must be idempotent - duplicate delivery is expected and intended.

  Expect to receive a map with:
  - `:poll-time` the postgres clock value as-of this poll
  - `:update-candidates` a vector of [{:id, :gated_at}] maps.

  Options:
  - :limit (1000)
  - :lag-tolerance (Duration) (should be at least gate-write-timeout + some buffer for timeout variation)

  Call (next-watermark) on the result to determine where to poll next."
  [pgvector index-metadata watermark & {:keys [^Duration lag-tolerance
                                               limit]
                                        :or   {lag-tolerance (.multipliedBy gate-write-timeout 2) ; heuristic: still depends on postgres enforcing timeouts. We might still need a slow-pass over everything occasionally in the future.
                                               limit         1000}}]
  (let [confidence-time   (.subtractFrom lag-tolerance (Instant/ofEpochMilli (inst-ms (:last-poll watermark))))
        gate-min          (if (< (inst-ms confidence-time) (inst-ms (:last-seen watermark)))
                            confidence-time
                            ;; We might not have seen everything with the last poll
                            ;; e.g. maybe there were more than :limit rows
                            ;; For this case - we would expect the last-seen to be behind the confidence window,
                            ;; and we should not skip ahead.
                            (:last-seen watermark))
        poll-q            {:union-all
                           [{:select [[nil :id]
                                      [[:clock_timestamp] :gated_at]]} ; return pgs clock value, to use as the :poll-time
                            {:select   [:id, :gated_at]
                             :from     [(keyword (:gate-table-name index-metadata))]
                             ;; the earliest timestamp where we might expect to find new documents
                             :where    [:>= :gated_at gate-min]
                             :order-by [[:gated_at :asc]]
                             :limit    limit}]}
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
  (let [max-seen-rf (fn [max-seen {:keys [gated_at]}]
                      (if (< (inst-ms max-seen) (inst-ms gated_at))
                        gated_at
                        max-seen))]
    {:last-poll poll-time
     :last-seen (reduce max-seen-rf (:last-seen watermark) update-candidates)}))

(defn resume-watermark
  [metadata-row]
  (let [{:keys [indexer_last_poll indexer_last_seen]} metadata-row]
    {:last-poll indexer_last_poll
     :last-seen indexer_last_seen}))

(defn flush-watermark! [pgvector index-metadata index watermark]
  (let [{:keys [last-poll last-seen]} watermark
        update-q {:update [(keyword (:metadata-table-name index-metadata))]
                  :set    {:indexer_last_poll last-poll
                           :indexer_last_seen last-seen}
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
     (signal-possibly-new-documents! pgvector
                                     index-metadata
                                     (for [search-doc chunk
                                           :let [search-doc (if (< (rand) 0.5)
                                                              (assoc search-doc :updated_at (java.time.Instant/now))
                                                              search-doc)]]
                                       {:id            (str (:model search-doc) "_" (:id search-doc))
                                        :document      (doto (PGobject.)
                                                         (.setType "jsonb")
                                                         (.setValue (json/encode search-doc)))
                                        :document_hash (buddy-hash/sha1 (json/encode (into (sorted-map) search-doc)))
                                        :updated_at    (or (:updated_at search-doc) (java.time.Instant/now))}))))

  (jdbc/execute! pgvector ["select * from index_gate limit 100"])

  (def watermark
    {:last-poll java.time.Instant/EPOCH
     :last-seen java.time.Instant/EPOCH})

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
