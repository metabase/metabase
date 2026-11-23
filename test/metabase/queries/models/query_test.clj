(ns metabase.queries.models.query-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.queries.models.query :as query]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/Query]
    (let [new-hash (fn [] (let [bytes (byte-array 32)] (.nextBytes (java.security.SecureRandom.) bytes) bytes))
          query    (fn [] {:database (mt/id) :type :query :query {:source-table (mt/id :venues)}})
          entries  (fn [n]
                     (let [rows (mapv (fn [i] {:query (query) :query-hash (new-hash) :execution-time-ms (* 100 (inc i))}) (range n))]
                       (t2/insert! :model/Query (mapv (fn [{:keys [query-hash]}] {:query_hash query-hash :average_execution_time 100})
                                                      (take-nth 3 (drop 1 rows))))
                       (t2/insert! :model/Query (mapv (fn [{:keys [query query-hash]}] {:query query :query_hash query-hash :average_execution_time 100})
                                                      (take-nth 3 (drop 2 rows))))
                       (into rows (take 1 rows))))]
      (testing "saving queries, some new, some up to date and some of before their text was stored"
        (events.tu/statement-count! #(query/save-queries-and-update-average-execution-times! (entries 3)))
        (let [small (entries 3)
              large (entries 12)]
          (is (= (events.tu/statement-count! #(query/save-queries-and-update-average-execution-times! small))
                 (events.tu/statement-count! #(query/save-queries-and-update-average-execution-times! large)))))))))
