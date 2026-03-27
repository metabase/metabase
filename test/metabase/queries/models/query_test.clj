(ns metabase.queries.models.query-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.queries.models.query :as query]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel query->database-and-table-ids-test
  (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id)
                                                   :type     :query
                                                   :query    {:source-table (mt/id :venues)}}}]
    (doseq [[message {:keys [expected query]}]
            {"A basic query"
             {:expected {:database-id 1, :table-id 1}
              :query    {:database 1
                         :type     :query
                         :query    {:source-table 1}}}

             "For native queries, table-id should be nil"
             {:expected {:database-id 1, :table-id nil}
              :query    {:database 1
                         :type     :native
                         :native   {:query "SELECT * FROM some_table;"}}}

             "If the query has a card__id source table, we should fetch database and table ID from the Card"
             {:expected {:database-id (mt/id)
                         :table-id    (mt/id :venues)}
              :query    {:database 1000
                         :type     :query
                         :query    {:source-table (format "card__%d" (:id card))}}}

             "If the query has a source-query we should recursively look at the database/table ID of the source query"
             {:expected {:database-id 5, :table-id 6}
              :query    {:database 5
                         :type     :query
                         :query    {:source-query {:source-table 6}}}}}]
      (testing message
        (is (=? expected
                (into {} (query/query->database-and-table-ids (lib/query
                                                               (lib.tu/mock-metadata-provider
                                                                {:database (assoc meta/database :id (:database query))})
                                                               query)))))))))

(deftest ^:parallel query->database-and-table-ids-mbql5-test
  (testing "Should work for MBQL 5 queries"
    (let [venues (lib.metadata/table meta/metadata-provider (meta/id :venues))
          query  (lib/query meta/metadata-provider venues)]
      (is (= {:database-id (meta/id), :table-id (meta/id :venues)}
             (query/query->database-and-table-ids query))))))

(deftest ^:parallel query->database-and-table-ids-mbql5-source-card-test
  (testing "Should handle source-card lookup for MBQL 5 queries"
    (let [metadata-provider      (lib.tu/metadata-provider-with-cards-for-queries
                                  meta/metadata-provider
                                  [(lib/query meta/metadata-provider (lib.metadata/table meta/metadata-provider (meta/id :venues)))])
          query-with-source-card (lib/query metadata-provider (lib.metadata/card metadata-provider 1))]
      (is (=? {:stages [{:lib/type :mbql.stage/mbql, :source-card 1}]}
              query-with-source-card))
      (is (= {:database-id (meta/id), :table-id (meta/id :venues)}
             (query/query->database-and-table-ids query-with-source-card))))))

;;; ---------------------------------------- Rolling Average Math ----------------------------------------

(deftest ^:parallel combined-rolling-average-params-test
  (let [combined-rolling-average-params #'query/combined-rolling-average-params]
    (testing "single time"
      (let [{:keys [decay weighted-sum]} (combined-rolling-average-params [100])]
        (is (== 0.9 decay))
        (is (== 10.0 weighted-sum))
        (testing "applied to an existing avg of 200 gives 0.9*200 + 10 = 190"
          (is (== 190.0 (+ (* decay 200) weighted-sum))))))
    (testing "two times — equivalent to sequential application"
      (let [{:keys [decay weighted-sum]} (combined-rolling-average-params [100 200])]
        ;; Sequential: start=200, after t=100 → 0.9*200+0.1*100=190, after t=200 → 0.9*190+0.1*200=191
        ;; Batch: 0.81*200 + 29 = 191
        (is (== 0.81 decay))
        (is (== 29.0 weighted-sum))
        (is (== 191.0 (+ (* decay 200) weighted-sum)))))
    (testing "three times — equivalent to three sequential applications"
      (let [{:keys [decay weighted-sum]} (combined-rolling-average-params [100 100 100])]
        ;; Sequential from avg=1000: 910 → 829 → 756.1
        ;; Batch: 0.729*1000 + 27.1 = 756.1
        (is (< (Math/abs (- 0.729 decay)) 1e-9))
        (is (< (Math/abs (- 27.1 weighted-sum)) 1e-9))
        (is (< (Math/abs (- 756.1 (+ (* decay 1000) weighted-sum))) 1e-9))))))

;;; ---------------------------------------- Batch Avg Execution Time ----------------------------------------

(defn- make-query-hash
  "Create a deterministic byte-array hash for testing."
  [n]
  (byte-array (map #(bit-and (+ n %) 0xFF) (range 32))))

(deftest batch-save-query-and-update-average-execution-time-test
  (let [hash-a (make-query-hash 1)
        hash-b (make-query-hash 2)
        query-a {:database 1, :type :native, :native {:query "SELECT 1"}}
        query-b {:database 1, :type :native, :native {:query "SELECT 2"}}]
    ;; Clean up any pre-existing rows for our test hashes
    (t2/delete! :model/Query :query_hash [:in [hash-a hash-b]])
    (try
      (testing "insert path — new hashes get inserted with correct avg"
        (query/batch-save-query-and-update-average-execution-time!
         [{:query query-a :query-hash hash-a :running-time 100}
          {:query query-b :query-hash hash-b :running-time 200}])
        (is (= 100 (query/average-execution-time-ms hash-a)))
        (is (= 200 (query/average-execution-time-ms hash-b))))
      (testing "update path — existing hashes get rolling average applied"
        (query/batch-save-query-and-update-average-execution-time!
         [{:query query-a :query-hash hash-a :running-time 200}])
        ;; 0.9*100 + 0.1*200 = 110
        (is (= 110 (query/average-execution-time-ms hash-a)))
        (testing "other hash unchanged"
          (is (= 200 (query/average-execution-time-ms hash-b)))))
      (testing "mixed path — some new, some existing in one batch"
        (let [hash-c (make-query-hash 3)
              query-c {:database 1, :type :native, :native {:query "SELECT 3"}}]
          (t2/delete! :model/Query :query_hash hash-c)
          (try
            (query/batch-save-query-and-update-average-execution-time!
             [{:query query-a :query-hash hash-a :running-time 300}
              {:query query-c :query-hash hash-c :running-time 500}])
            ;; hash-a: 0.9*110 + 0.1*300 = 129
            (is (= 129 (query/average-execution-time-ms hash-a)))
            ;; hash-c: new, so just 500
            (is (= 500 (query/average-execution-time-ms hash-c)))
            (finally
              (t2/delete! :model/Query :query_hash hash-c)))))
      (testing "duplicate hashes in single batch — combined correctly"
        ;; Reset hash-a to a known value
        (t2/update! :model/Query {:query_hash hash-a} {:average_execution_time 1000})
        (query/batch-save-query-and-update-average-execution-time!
         [{:query query-a :query-hash hash-a :running-time 100}
          {:query query-a :query-hash hash-a :running-time 100}])
        ;; Sequential: 0.9*1000+0.1*100=910, then 0.9*910+0.1*100=829
        ;; Batch combined: 0.81*1000 + 0.1*(0.9*100 + 100) = 810+19 = 829
        (is (= 829 (query/average-execution-time-ms hash-a))))
      (finally
        (t2/delete! :model/Query :query_hash [:in [hash-a hash-b]])))))
