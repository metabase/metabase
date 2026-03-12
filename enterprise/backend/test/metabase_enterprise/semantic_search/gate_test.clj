(ns metabase-enterprise.semantic-search.gate-test
  (:require
   [buddy.core.hash :as buddy-hash]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.gate :as semantic.gate]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test.util :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import (java.io Closeable)
           (java.sql Timestamp SQLException)
           (java.time Duration Instant)
           (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- open-tables! ^Closeable [pgvector index-metadata]
  (semantic.tu/closeable
   (semantic.index-metadata/create-tables-if-not-exists! pgvector index-metadata)
   (fn [_] (semantic.tu/cleanup-index-metadata! pgvector index-metadata))))

(defn- ts ^Timestamp [s] (Timestamp/from (Instant/parse s)))

(deftest search-doc->gate-doc-test
  (testing "converts search document to gate document format"
    (let [t1         (ts "2025-01-01T12:00:00Z")
          t2         (ts "2025-01-02T12:00:00Z")
          search-doc {:model           "card"
                      :id              "123"
                      :searchable_text "Dog Training Guide"
                      :embeddable_text "Dog Training Guide"
                      :updated_at      t1}
          sut        semantic.gate/search-doc->gate-doc]
      (is (= {:id            "card_123"
              :model_id      "123"
              :model         "card"
              :document      (doto (PGobject.)
                               (.setType "jsonb")
                               (.setValue (json/encode search-doc)))
              :document_hash (u/encode-base64-bytes (buddy-hash/sha1 (json/encode (into (sorted-map) search-doc))))
              :updated_at    (:updated_at search-doc)}
             (sut search-doc t2)))

      (testing "uses default updated_at when search doc has none"
        (is (= t2
               (:updated_at (sut (dissoc search-doc :updated_at) t2))
               (:updated_at (sut (assoc search-doc :updated_at nil) t2))))))))

(deftest gate-doc->search-doc-test
  (let [original-search-doc {:model "card" :id "123" :searchable_text "Dog Training Guide" :embeddable_text "Dog Training Guide"}
        gate-doc            {:document (doto (PGobject.)
                                         (.setType "jsonb")
                                         (.setValue (json/encode original-search-doc)))}
        recovered-doc       (semantic.gate/gate-doc->search-doc gate-doc)]
    (is (= original-search-doc recovered-doc))))

(defn- get-gate-rows! [pgvector index-metadata]
  (jdbc/execute! pgvector (sql/format {:select   [:*]
                                       :from     [(keyword (:gate-table-name index-metadata))]
                                       :order-by [[:id :asc]]}
                                      :quoted true)
                 {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- get-gate-row! [pgvector index-metadata id]
  (jdbc/execute-one! pgvector (sql/format {:select [:*]
                                           :from   [(keyword (:gate-table-name index-metadata))]
                                           :where  [:= :id id]}
                                          :quoted true)
                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- comparable-gate-row [row]
  (walk/postwalk
   (fn [x]
     (cond
       (bytes? x) (u/encode-base64-bytes x)
       (inst? x) (inst-ms x)
       (instance? PGobject x) (json/decode (.getValue ^PGobject x))
       :else x))
   row))

(defn- pg-clock-timestamp! [pgvector]
  (:ts (jdbc/execute-one! pgvector ["select clock_timestamp() ts"])))

(deftest gate-documents!-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        t0             (ts "2025-01-01T00:00:00Z")
        t1             (ts "2025-01-01T00:01:00Z")
        t2             (ts "2025-01-02T00:03:10Z")
        t3             (ts "2025-01-03T00:02:42Z")
        c1             {:model "card" :id "123" :searchable_text "Dog Training Guide" :embeddable_text "Dog Training Guide"}
        c2             {:model "card" :id "123" :searchable_text "Dog Training Guide 2" :embeddable_text "Dog Training Guide 2"}
        c3             {:model "card" :id "123" :searchable_text "Dog Training Guide 3" :embeddable_text "Dog Training Guide 3"}
        d1             {:model "dashboard" :id "456" :searchable_text "Elephant Migration" :embeddable_text "Elephant Migration"}
        version        semantic.gate/search-doc->gate-doc
        delete         (fn [doc t] (semantic.gate/deleted-search-doc->gate-doc (:model doc) (:id doc) t))
        sut            semantic.gate/gate-documents!]

    (with-open [_ (open-tables! pgvector index-metadata)]
      (testing "brand new index, writes accepted"
        (let [docs               [(version c1 t1) (version d1 t1)]
              existing-timestamp (pg-clock-timestamp! pgvector)
              update-count       (sut pgvector index-metadata docs)
              gate-rows          (map comparable-gate-row (get-gate-rows! pgvector index-metadata))
              new-timestamp      (pg-clock-timestamp! pgvector)]
          (is (= 2 update-count))
          (is (= (frequencies (map comparable-gate-row docs))
                 (frequencies (map #(dissoc % :gated_at) gate-rows))))
          (testing "timestamps in range of expected pg clock value"
            (doseq [{:keys [gated_at]} gate-rows]
              (is (<= (inst-ms existing-timestamp)
                      gated_at
                      (inst-ms new-timestamp)))))))

      (testing "same doc a second time is ignored"
        (let [previous-state (get-gate-rows! pgvector index-metadata)]
          (is (= 0 (sut pgvector index-metadata [(version c1 t1) (version d1 t1)])))
          (is (= (map comparable-gate-row previous-state)
                 (map comparable-gate-row (get-gate-rows! pgvector index-metadata))))))

      (testing "if document has a newer timestamp, but the same content - not updated"
        (is (= 0 (sut pgvector index-metadata [(version c1 t2)]))))

      (testing "if document has an older timestamp and new content, not updated"
        (is (= 0 (sut pgvector index-metadata [(version c2 t0)]))))

      (testing "if document has same timestamp and new content, updated"
        (let [lower-bound (pg-clock-timestamp! pgvector)]
          (is (= 1 (sut pgvector index-metadata [(version c2 t1)])))
          (is (<= (inst-ms lower-bound)
                  (inst-ms (:gated_at (get-gate-row! pgvector index-metadata (:id (version c2 t1)))))))))

      (testing "if document has newer timestamp and new content, updated"
        (is (= 1 (sut pgvector index-metadata [(version c1 t2)]))))

      (testing "documents are not deleted if older"
        (let [previous-state (get-gate-rows! pgvector index-metadata)]
          (is (= 0 (sut pgvector index-metadata [(delete d1 t0)])))
          (is (= (map comparable-gate-row previous-state)
                 (map comparable-gate-row (get-gate-rows! pgvector index-metadata))))))

      (testing "documents are deleted if they have the same or newer timestamp"
        (is (= 1 (sut pgvector index-metadata [(delete d1 t1)])))
        (is (= 1 (sut pgvector index-metadata [(delete c1 t3)]))))

      (testing "documents are not deleted if already deleted, regardless of timestamp"
        (is (= 0 (sut pgvector index-metadata [(delete d1 t2)]))))

      (testing "documents are not undeleted if new write is older than the delete"
        (is (= 0 (sut pgvector index-metadata [(version d1 t0)]))))

      (testing "documents are undeleted if new write is newer than the delete"
        (is (= 1 (sut pgvector index-metadata [(version d1 t3)]))))

      (testing "last logical update is preferred if multiple submitted, regardless of order"
        (is (= 1 (sut pgvector index-metadata [(version c1 t2)
                                               (version c3 t3)
                                               (delete c1 t2)
                                               (version c1 t1)])))
        (is (= (comparable-gate-row (version c3 t3))
               (comparable-gate-row (dissoc (get-gate-row! pgvector index-metadata (:id (version c3 t3))) :gated_at))))))))

(deftest poll-test
  (let [pgvector        (semantic.env/get-pgvector-datasource!)
        index-metadata  (semantic.tu/unique-index-metadata)
        epoch-watermark {:last-poll Instant/EPOCH :last-seen Instant/EPOCH}
        c1              {:model "card" :id "123" :searchable_text "a" :embeddable_text "a"}
        c2              {:model "card" :id "234" :searchable_text "b" :embeddable_text "b"}
        c3              {:model "card" :id "345" :searchable_text "c" :embeddable_text "c"}
        t0              (ts "2025-01-01T00:00:00Z")
        t1              (ts "2025-01-01T00:01:00Z")
        t2              (ts "2025-01-02T00:03:10Z")
        version         semantic.gate/search-doc->gate-doc
        delete          (fn [doc t] (semantic.gate/deleted-search-doc->gate-doc (:model doc) (:id doc) t))
        gate!           semantic.gate/gate-documents!
        sut             semantic.gate/poll]

    (with-open [_ (open-tables! pgvector index-metadata)]

      (testing "empty gate table"
        (let [clock-lower-bound (inst-ms (pg-clock-timestamp! pgvector))
              poll-result       (sut pgvector index-metadata epoch-watermark)
              clock-upper-bound (inst-ms (pg-clock-timestamp! pgvector))]
          (is (<= clock-lower-bound (inst-ms (:poll-time poll-result)) clock-upper-bound))
          (is (= [] (:update-candidates poll-result)))
          (let [next-poll-result (sut pgvector index-metadata (semantic.gate/next-watermark epoch-watermark poll-result))]
            (is (not= epoch-watermark (semantic.gate/next-watermark epoch-watermark poll-result)))
            (is (<= (inst-ms (:poll-time poll-result)) (inst-ms (:poll-time next-poll-result))))
            (is (= [] (:update-candidates poll-result))))))

      (testing "from epoch happy path"
        (testing "add a doc, picked up"
          (gate! pgvector index-metadata [(version c2 t0)])
          (let [poll-result (sut pgvector index-metadata epoch-watermark)]
            (is (= {(:id (version c2 t0)) 1} (frequencies (map :id (:update-candidates poll-result)))))))

        (testing "add a new doc and delete, all 3 operations are picked up from epoch"
          (gate! pgvector index-metadata [(version c1 t0) (delete c3 t1)])
          (let [poll-result (sut pgvector index-metadata epoch-watermark)]
            (is (= (frequencies (map :id [(version c2 t0) (version c1 t0) (delete c3 t1)]))
                   (frequencies (map :id (:update-candidates poll-result)))))))

        (testing "limit works, will get the earlier record (c2 write)" ; note remains undefined within a timestamp
          (let [poll-result (sut pgvector index-metadata epoch-watermark :limit 1)]
            (is (= [(:id (version c2 t0))] (map :id (:update-candidates poll-result))))))

        (testing "watermark test"

          ;; assign unique gate timestamps to each record, so following assertions are deterministic
          (doseq [[t {:keys [id]}] (map vector
                                        [t0
                                         t1
                                         t2]
                                        (get-gate-rows! pgvector index-metadata))]
            (jdbc/execute-one!
             pgvector
             (sql/format {:update (keyword (:gate-table-name index-metadata))
                          :set    {:gated_at t}
                          :where  [:= :id id]}
                         :quoted true)))

          (let [[g1 g2 g3] (sort (map :gated_at (get-gate-rows! pgvector index-metadata)))
                lag-tolerance  (Duration/ofSeconds 3)
                poll-times     #(sort (map :gated_at (:update-candidates (sut pgvector index-metadata % :lag-tolerance lag-tolerance))))
                timestamp-plus #(.plus (.toInstant ^Timestamp %1) ^Duration %2)]
            (is (= [g1 g2 g3] (poll-times epoch-watermark)))
            (testing "seen everything, but still in lag tolerance window"
              (is (= [g1 g2 g3] (poll-times {:last-poll g1 :last-seen {:gated_at g3}})))
              (is (= [g1 g2 g3] (poll-times {:last-poll (timestamp-plus g1 lag-tolerance) :last-seen {:gated_at g3}}))))
            (testing "entries drop once confidence window slides forwards"
              (is (= [g2 g3] (poll-times {:last-poll (timestamp-plus g1 (.multipliedBy lag-tolerance 2))
                                          :last-seen {:gated_at g3}}))))
            (testing "if last seen is < confidence, we still pull those entries (no gaps)"
              (is (= [g1 g2 g3] (poll-times {:last-poll (timestamp-plus g1 (.multipliedBy lag-tolerance 2))
                                             :last-seen {:gated_at g1}})))
              (testing "true even for big gaps"
                (is (= [g2 g3] (poll-times {:last-poll (timestamp-plus g3 (.multipliedBy lag-tolerance 1000))
                                            :last-seen {:gated_at g2}})))))))))))

(deftest watermark-management-test
  (testing "next-watermark updates watermark based on poll results"
    (let [initial-watermark {:last-poll (ts "2025-01-01T12:00:00Z")
                             :last-seen {:id            "card_1"
                                         :document_hash "foo"
                                         :gated_at      (ts "2025-01-01T11:00:00Z")}}
          poll-result       {:poll-time         (ts "2025-01-01T13:00:00Z")
                             :update-candidates [{:id "card_123" :document_hash "foo" :gated_at (ts "2025-01-01T12:30:00Z")}
                                                 {:id "dashboard_456" :document_hash nil :gated_at (ts "2025-01-01T12:45:00Z")}]}
          next-watermark    (semantic.gate/next-watermark initial-watermark poll-result)]

      (is (= (ts "2025-01-01T13:00:00Z") (:last-poll next-watermark)))
      (is (= {:gated_at      (ts "2025-01-01T12:45:00Z")
              :document_hash nil
              :id            "dashboard_456"}
             (:last-seen next-watermark)))))

  (testing "resume-watermark extracts watermark from metadata row"
    (let [metadata-row {:indexer_last_poll      (ts "2025-01-01T12:00:00Z")
                        :indexer_last_seen      (ts "2025-01-01T11:30:00Z")
                        :indexer_last_seen_id   "card_1"
                        :indexer_last_seen_hash "foo"}
          watermark    (semantic.gate/resume-watermark metadata-row)]

      (is (= (ts "2025-01-01T12:00:00Z") (:last-poll watermark)))
      (is (= {:id            "card_1"
              :document_hash "foo"
              :gated_at      (ts "2025-01-01T11:30:00Z")}
             (:last-seen watermark))))))

(deftest flush-watermark!-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        model1         {:provider "foo" :model-name "m1" :vector-dimensions 42}
        model2         {:provider "foo" :model-name "m2" :vector-dimensions 42}
        index1         (semantic.index-metadata/qualify-index (semantic.index/default-index model1) index-metadata)
        index2         (semantic.index-metadata/qualify-index (semantic.index/default-index model2) index-metadata)
        watermark      {:last-poll (ts "2025-01-01T13:00:00Z")
                        :last-seen {:id            "card_1"
                                    :document_hash "bar"
                                    :gated_at      (ts "2025-01-01T12:45:00Z")}}]

    (with-open [_ (open-tables! pgvector index-metadata)]

      (let [id1
            (semantic.index-metadata/record-new-index-table!
             pgvector
             index-metadata
             index1)

            id2
            (semantic.index-metadata/record-new-index-table!
             pgvector
             index-metadata
             index2)]

        (semantic.gate/flush-watermark! pgvector index-metadata index2 watermark)

        (let [indexer-records
              (->> (jdbc/execute! pgvector
                                  (-> {:select [:id
                                                :indexer_last_poll
                                                :indexer_last_seen
                                                :indexer_last_seen_hash
                                                :indexer_last_seen_id]
                                       :from   [(keyword (:metadata-table-name index-metadata))]}
                                      (sql/format :quoted true))
                                  {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                   (sort-by :id))
              [index1-meta index2-meta] indexer-records]
          (is (= 2 (count indexer-records)))
          (is (= {:id                     id1
                  :indexer_last_seen_id   nil
                  :indexer_last_seen_hash nil
                  :indexer_last_poll      nil
                  :indexer_last_seen      nil}
                 index1-meta))
          (is (=? {:id                     id2
                   :indexer_last_poll      (:last-poll watermark)
                   :indexer_last_seen_id   "card_1"
                   :indexer_last_seen_hash "bar"
                   :indexer_last_seen      (:gated_at (:last-seen watermark))}
                  index2-meta)))))))

(deftest gate-documents-metrics-test
  (mt/with-prometheus-system! [_ system]
    (let [pgvector       (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.tu/unique-index-metadata)
          t1             (ts "2025-01-01T00:01:00Z")
          c1             {:model "card" :id "123" :searchable_text "Dog Training Guide" :embeddable_text "Dog Training Guide"}
          d1             {:model "dashboard" :id "456" :searchable_text "Elephant Migration" :embeddable_text "Elephant Migration"}
          version        semantic.gate/search-doc->gate-doc
          sut            semantic.gate/gate-documents!]
      (with-open [_ (open-tables! pgvector index-metadata)]
        (let [docs [(version c1 t1) (version d1 t1)]]
          (testing "Gating triggers write metrics"
            (sut pgvector index-metadata docs)
            (is (=? {:sum #(and (number? %) (> % 0)) :count (partial == 1) :buckets #(= 11 (count %))}
                    (mt/metric-value system :metabase-search/semantic-gate-write-ms)))
            (is (== 2 (mt/metric-value system :metabase-search/semantic-gate-write-documents)))
            (is (== 2 (mt/metric-value system :metabase-search/semantic-gate-write-modified))))
          (testing ":metabase-search/semantic-gate-write-modified is not increased if documents are gated"
            (sut pgvector index-metadata docs)
            (is (== 4 (mt/metric-value system :metabase-search/semantic-gate-write-documents)))
            (is (== 2 (mt/metric-value system :metabase-search/semantic-gate-write-modified))))
          (testing ":metabase-search/semantic-gate-timeout-ms is updated on timeout"
            (with-redefs [semantic.gate/execute-upsert!
                          (fn [& _] (throw (org.postgresql.util.PSQLException.
                                            "ERROR: canceling statement due to statement timeout"
                                            org.postgresql.util.PSQLState/QUERY_CANCELED)))]
              (let [ex (try
                         (sut pgvector index-metadata docs)
                         (catch Exception e e))]
                (is (and (instance? SQLException ex)
                         (= "57014" (.getSQLState ^SQLException ex)))))
              (is (=? {:sum #(and (number? %) (> % 0)) :count (partial == 1) :buckets #(= 11 (count %))}
                      (mt/metric-value system :metabase-search/semantic-gate-timeout-ms))))))))))
