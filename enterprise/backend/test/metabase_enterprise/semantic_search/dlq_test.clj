(ns metabase-enterprise.semantic-search.dlq-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.gate :as semantic.gate]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import (java.io Closeable)
           (java.net SocketException)
           (java.sql Timestamp)
           (java.time Duration Instant InstantSource)
           (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- open-dlq! ^Closeable [pgvector index-metadata index-id]
  (semantic.tu/closeable
   (semantic.dlq/create-dlq-table-if-not-exists! pgvector index-metadata index-id)
   (fn [_] (semantic.dlq/drop-dlq-table-if-exists! pgvector index-metadata index-id))))

(defn- ts ^Timestamp [s]
  (Timestamp/from (Instant/parse s)))

(deftest error-categorization-test
  (testing "HTTP status codes"
    (is (= :permanent (semantic.dlq/categorize-error (ex-info "Client error" {:status 404}))))
    (is (= :permanent (semantic.dlq/categorize-error (ex-info "Validation error" {:status 422}))))
    (is (= :transient (semantic.dlq/categorize-error (ex-info "Server error" {:status 500}))))
    (is (= :transient (semantic.dlq/categorize-error (ex-info "Gateway timeout" {:status 504})))))

  (testing "Exception types"
    (is (= :transient (semantic.dlq/categorize-error (SocketException. "Connection reset"))))
    (is (= :permanent (semantic.dlq/categorize-error (AssertionError. "Invalid assertion"))))
    (is (= :permanent (semantic.dlq/categorize-error (NullPointerException. "NPE")))))

  (testing "Default to transient"
    (is (= :transient (semantic.dlq/categorize-error (RuntimeException. "Unknown error"))))
    (is (= :transient (semantic.dlq/categorize-error (Exception. "Generic exception"))))))

(deftest dlq-table-creation-test
  (testing "DLQ table creation and existence checks"
    (let [pgvector       (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.tu/unique-index-metadata)
          index-id       42]
      (with-open [_ (semantic.tu/open-metadata! pgvector index-metadata)]
        (is (false? (semantic.dlq/dlq-table-exists? pgvector index-metadata index-id)))
        (semantic.dlq/create-dlq-table-if-not-exists! pgvector index-metadata index-id)
        (is (true? (semantic.dlq/dlq-table-exists? pgvector index-metadata index-id)))
        (semantic.dlq/drop-dlq-table-if-exists! pgvector index-metadata index-id)
        (is (false? (semantic.dlq/dlq-table-exists? pgvector index-metadata index-id)))))))

(deftest dlq-entry-management-test
  (testing "DLQ entry add, query, and delete operations"
    (let [pgvector       (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.tu/unique-index-metadata)
          index-id       42]
      (with-open [_ (semantic.tu/open-metadata! pgvector index-metadata)
                  _ (open-dlq! pgvector index-metadata index-id)]
        (let [t1      (ts "2025-01-01T10:00:00Z")
              t2      (ts "2025-01-01T11:00:00Z")
              entries [{:gate_id           "gate1"
                        :retry_count       0
                        :attempt_at        t1
                        :last_attempted_at t2
                        :error_gated_at    t1}
                       {:gate_id           "gate2"
                        :retry_count       1
                        :attempt_at        t2
                        :last_attempted_at t1
                        :error_gated_at    t1}]]

          (is (= 2 (semantic.dlq/add-entries! pgvector index-metadata index-id entries)))

          (let [table-name (semantic.dlq/dlq-table-name-kw index-metadata index-id)
                results    (jdbc/execute! pgvector
                                          (sql/format {:select [:*] :from [table-name] :order-by [:gate_id]} :quoted true)
                                          {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
            (is (= 2 (count results)))
            (is (= "gate1" (:gate_id (first results))))
            (is (= 0 (:retry_count (first results)))))

          (let [table-name  (semantic.dlq/dlq-table-name-kw index-metadata index-id)
                all-results (jdbc/execute! pgvector
                                           (sql/format {:select [[:gate_id :id] [:error_gated_at :gated_at]] :from [table-name]} :quoted true)
                                           {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
            (is (= 2 (semantic.dlq/delete-entries! pgvector index-metadata index-id all-results)))
            (let [remaining (jdbc/execute! pgvector
                                           (sql/format {:select [:*] :from [table-name]} :quoted true))]
              (is (empty? remaining)))))))))

(deftest dlq-entry-upsert-test
  (testing "DLQ entry upsert behavior on conflict"
    (let [pgvector       (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.tu/unique-index-metadata)
          index-id       42]
      (with-open [_ (semantic.tu/open-metadata! pgvector index-metadata)
                  _ (open-dlq! pgvector index-metadata index-id)]
        (let [t1            (ts "2025-01-01T10:00:00Z")
              t2            (ts "2025-01-01T11:00:00Z")
              initial-entry [{:gate_id           "gate1"
                              :retry_count       0
                              :attempt_at        t1
                              :last_attempted_at t2
                              :error_gated_at    t1}]]

          (is (= 1 (semantic.dlq/add-entries! pgvector index-metadata index-id initial-entry)))

          (let [updated-entry [{:gate_id           "gate1"
                                :retry_count       2
                                :attempt_at        t2
                                :last_attempted_at t2
                                :error_gated_at    t2}]]
            (is (= 1 (semantic.dlq/add-entries! pgvector index-metadata index-id updated-entry))))

          (let [table-name (semantic.dlq/dlq-table-name-kw index-metadata index-id)
                results    (jdbc/execute! pgvector
                                          (sql/format {:select [:*] :from [table-name] :order-by [:gate_id]} :quoted true)
                                          {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
            (is (= 1 (count results)))
            (is (= "gate1" (:gate_id (first results))))
            (is (= 2 (:retry_count (first results))))
            (is (= t2 (:error_gated_at (first results))))))))))

(deftest dlq-poll-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        model          semantic.tu/mock-embedding-model
        index          (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
        t1             (ts "2025-01-01T10:00:00Z")
        t2             (ts "2025-01-01T11:00:00Z")
        t3             (ts "2025-01-01T12:00:00Z")
        c1             {:model "card" :id "1" :name "Test" :searchable_text "Content" :embeddable_text "Content"}
        c2             {:model "card" :id "2" :name "Test" :searchable_text "Content" :embeddable_text "Content"}
        version        semantic.gate/search-doc->gate-doc
        delete         (fn [doc t] (semantic.gate/deleted-search-doc->gate-doc (:model doc) (:id doc) t))]

    (with-open [_            (semantic.tu/open-metadata! pgvector index-metadata)
                _            (semantic.tu/open-index! pgvector index)
                index-id-ref (semantic.tu/closeable
                              (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)
                              (constantly nil))
                _            (open-dlq! pgvector index-metadata @index-id-ref)]

      ;; Set up test data: gate entry and DLQ entry
      (semantic.gate/gate-documents! pgvector index-metadata [(version c1 t1) (delete c2 t2)])

      ;; Add some DLQ entries that should be retried
      (let [dlq-entries [;; upsert
                         {:gate_id           "card_1"
                          :retry_count       1
                          :attempt_at        t2
                          :last_attempted_at t2
                          :error_gated_at    t1}
                         ;; delete
                         {:gate_id           "card_2"
                          :retry_count       1
                          :attempt_at        t3
                          :last_attempted_at t2
                          :error_gated_at    t1}
                         ;; orphan
                         {:gate_id           "card_3"
                          :retry_count       1
                          :attempt_at        t1
                          :last_attempted_at t2
                          :error_gated_at    t1}]]
        (semantic.dlq/add-entries! pgvector index-metadata @index-id-ref dlq-entries))

      (testing "poll at different times finds records to be retried as-of that clock value"
        (testing "t1"
          (with-redefs [semantic.dlq/clock (reify InstantSource (instant [_] (.toInstant t1)))]
            (let [poll-results (semantic.dlq/poll pgvector index-metadata @index-id-ref 100)]
              (is (= {"card_3" 1} (frequencies (map :id poll-results)))))))

        (testing "t2"
          (with-redefs [semantic.dlq/clock (reify InstantSource (instant [_] (.toInstant t2)))]
            (let [poll-results (semantic.dlq/poll pgvector index-metadata @index-id-ref 100)]
              (is (= {"card_1" 1 "card_3" 1} (frequencies (map :id poll-results)))))))

        (testing "t3"
          (with-redefs [semantic.dlq/clock (reify InstantSource (instant [_] (.toInstant t3)))]
            (let [poll-results (semantic.dlq/poll pgvector index-metadata @index-id-ref 100)]
              (is (= {"card_1" 1 "card_2" 1 "card_3" 1} (frequencies (map :id poll-results))))))))

      (testing "limit parameter"
        (with-redefs [semantic.dlq/clock (reify InstantSource (instant [_] (.toInstant t3)))]
          (is (= 1 (count (semantic.dlq/poll pgvector index-metadata @index-id-ref 1))))
          (is (= 3 (count (semantic.dlq/poll pgvector index-metadata @index-id-ref 10)))))))))

(deftest dlq-retry-loop-test
  (let [pgvector         (semantic.env/get-pgvector-datasource!)
        index-metadata   (semantic.tu/unique-index-metadata)
        model            semantic.tu/mock-embedding-model
        index            (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
        clock-ref        (volatile! (Instant/parse "2025-01-04T00:00:00Z"))
        clock            (reify InstantSource (instant [_] @clock-ref))
        t1               (ts "2025-01-01T10:00:00Z")
        c1               {:model "card" :id "1" :name "Test" :searchable_text "Content" :embeddable_text "Content"}
        c2               {:model "card" :id "2" :name "Test" :searchable_text "Content" :embeddable_text "Content"}
        version          semantic.gate/search-doc->gate-doc
        add-gate-to-dlq! (fn [pgvector index-metadata index-id]
                           (->> (semantic.gate/poll pgvector index-metadata {})
                                :update-candidates
                                (map #(semantic.dlq/initial-dlq-entry % (.instant clock)))
                                (semantic.dlq/add-entries! pgvector index-metadata index-id)))]

    (with-open [_            (semantic.tu/open-metadata! pgvector index-metadata)
                _            (semantic.tu/open-index! pgvector index)
                index-id-ref (semantic.tu/closeable
                              (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)
                              (constantly nil))
                _            (open-dlq! pgvector index-metadata @index-id-ref)]

      (with-redefs [semantic.dlq/clock clock]

        (testing "exits with no data"
          (let [result (semantic.dlq/dlq-retry-loop! pgvector index-metadata index @index-id-ref
                                                     :max-run-duration (Duration/ofSeconds 1))]
            (is (= :no-more-data (:exit-reason result)))
            (is (zero? (:success-count result)))
            (is (zero? (:failure-count result)))))

        (testing "processes successful retries"
          ;; Set up gate data and DLQ entries for retry
          (is (pos? (semantic.gate/gate-documents! pgvector index-metadata [(version c1 t1)])))

          (add-gate-to-dlq! pgvector index-metadata @index-id-ref)

          (testing "clock has not advanced beyond initial backoff"
            (is (= 0 (count (semantic.dlq/poll pgvector index-metadata @index-id-ref 10)))))

          (testing "advance clock beyond initial backoff"
            ;; move clock passed the expected back off time
            (vreset! clock-ref (.plus (.instant clock) semantic.dlq/initial-backoff))
            (is (= 1 (count (semantic.dlq/poll pgvector index-metadata @index-id-ref 10)))))

          (let [result (semantic.dlq/dlq-retry-loop! pgvector index-metadata index @index-id-ref
                                                     :max-run-duration (Duration/ofMinutes 5)
                                                     :max-batch-size 10)]
            (is (= :no-more-data (:exit-reason result)))
            (is (= 1 (:success-count result)))))

        (testing "handles failures and adjusts batch size"
          ;; ensure there are two documents in the gate
          (semantic.gate/gate-documents! pgvector index-metadata [(version c1 t1) (version c2 t1)])
          ;; add everything to dlq
          (add-gate-to-dlq! pgvector index-metadata @index-id-ref)

          (vreset! clock-ref (.plus (.instant clock) semantic.dlq/initial-backoff))

          (with-redefs [semantic.index/upsert-index! (fn [& _] (throw (RuntimeException. "Forced failure")))]
            (let [result (semantic.dlq/dlq-retry-loop! pgvector index-metadata index @index-id-ref
                                                       :max-run-duration (Duration/ofSeconds 1)
                                                       :max-batch-size 10)]
              (is (#{:no-more-data :ran-out-of-time} (:exit-reason result)))
              (is (= 2 (:failure-count result)))))

          (testing "batch shrinking to minimum size of 1, causing passes"
            (add-gate-to-dlq! pgvector index-metadata @index-id-ref)
            (vreset! clock-ref (.plus (.instant clock) semantic.dlq/initial-backoff))
            (let [observed-batches (atom [])]
              (with-redefs [semantic.dlq/transient-policy (semantic.dlq/linear-policy Duration/ZERO)
                            semantic.index/upsert-index!  (fn [_ _ docs]
                                                            ;; important: simulate time passing
                                                            (vreset! clock-ref (.plus (.instant clock) (Duration/ofMillis 1)))
                                                            (swap! observed-batches conj (count docs))
                                                            (when (> (count docs) 1)
                                                              (throw (RuntimeException. "Batch too large"))))]
                (let [result (semantic.dlq/dlq-retry-loop! pgvector index-metadata index @index-id-ref
                                                           :max-run-duration (Duration/ofSeconds 1)
                                                           :max-batch-size 10)]
                  (is (= :no-more-data (:exit-reason result)))
                  (is (= 2 (:success-count result)))        ; both writes eventually succeed
                  (is (= 2 (:failure-count result)))        ; first batch
                  (is (= [2 1 1] @observed-batches))))))

          (testing "exits once max-run time elapses, even if dlq is full"
            (add-gate-to-dlq! pgvector index-metadata @index-id-ref)
            (vreset! clock-ref (.plus (.instant clock) semantic.dlq/initial-backoff))
            (with-redefs [semantic.dlq/transient-policy (semantic.dlq/linear-policy Duration/ZERO)
                          semantic.index/upsert-index!  (fn [& _]
                                                          ;; important: simulate time passing on each attempt
                                                          (vreset! clock-ref (.plus (.instant clock) (Duration/ofMillis 1)))
                                                          (throw (RuntimeException. "Boom")))]
              (let [result (semantic.dlq/dlq-retry-loop! pgvector index-metadata index @index-id-ref
                                                         :max-run-duration (Duration/ofMillis 10)
                                                         :max-batch-size 10)]
                (is (= :ran-out-of-time (:exit-reason result)))
                (is (= 0 (:success-count result)))
                (is (pos? (:failure-count result)))))))))))

(deftest try-batch-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        model          semantic.tu/mock-embedding-model
        index          (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
        gate-docs      [{:id             "card_1"
                         :model          "card"
                         :model_id       "1"
                         :document       (doto (PGobject.)
                                           (.setType "jsonb")
                                           (.setValue (json/encode {:model           "card"
                                                                    :name            "hey"
                                                                    :id              "1"
                                                                    :searchable_text "foo"
                                                                    :embeddable_text "foo"})))
                         :gated_at       (ts "2025-01-04T09:00:00Z")
                         :error_gated_at (ts "2025-01-04T09:00:00Z")}
                        {:id             "card_2"
                         :model          "card"
                         :model_id       "2"
                         :document       nil                ; deletion
                         :gated_at       (ts "2025-01-04T09:00:00Z")
                         :error_gated_at (ts "2025-01-04T09:00:00Z")}]]

    (with-open [_ (semantic.tu/open-metadata! pgvector index-metadata)
                _ (semantic.tu/open-index! pgvector index)]

      (testing "batch processing singles out orphans (dlq entry with no associated gate record)"
        (let [outcome (semantic.dlq/try-batch! pgvector index gate-docs)]
          (is (= {"card_1" 1 "card_2" 1} (frequencies (map :id (:successes outcome)))))
          (is (= {} (frequencies (map :gate_id (:failures outcome)))))))

      (testing "failures across upsert/delete are aggregated"
        (with-redefs [semantic.index/upsert-index!      (fn [& _] (throw (RuntimeException. "Upsert failed")))
                      semantic.index/delete-from-index! (fn [& _] (throw (RuntimeException. "Delete failed")))]
          (let [outcome (semantic.dlq/try-batch! pgvector index gate-docs)]
            (is (= {"card_1" 1 "card_2" 1} (frequencies (map (comp :gate_id :dlq-entry) (:failures outcome)))))
            (is (= {} (frequencies (map :id (:successes outcome))))))))

      (testing "partial failure is representable"
        (with-redefs [semantic.index/upsert-index! (fn [& _] (throw (RuntimeException. "Upsert failed")))]
          (let [outcome (semantic.dlq/try-batch! pgvector index gate-docs)]
            (is (= {"card_1" 1} (frequencies (map (comp :gate_id :dlq-entry) (:failures outcome)))))
            (is (= {"card_2" 1} (frequencies (map :id (:successes outcome))))))))

      (testing "failure increments retry count"
        (let [now (Instant/parse "2025-01-01T13:14:33Z")]
          (doseq [[ex policy] [[(RuntimeException. "Upsert failed") semantic.dlq/transient-policy]
                               [(AssertionError. "Assert") semantic.dlq/permanent-policy]]]
            (with-redefs [rand                         (constantly 1.0)
                          semantic.index/upsert-index! (fn [& _] (throw ex))
                          semantic.dlq/clock           (reify InstantSource (instant [_] now))]
              (let [outcome (semantic.dlq/try-batch! pgvector index (map #(assoc % :retry_count 42) gate-docs))
                    [dlq-entry :as dlq-docs] (map :dlq-entry (:failures outcome))]
                (is (= 1 (count dlq-docs)))
                (is (= 43 (:retry_count dlq-entry)))
                (is (= now (:last_attempted_at dlq-entry)))
                (is (= (.plus now ^Duration (semantic.dlq/next-delay 43 policy)) (:attempt_at dlq-entry)))))))))))
