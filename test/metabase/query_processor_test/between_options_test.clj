(ns ^:mb/driver-tests metabase.query-processor-test.between-options-test
  "End-to-end tests for :between filter with min/max inclusive options"
  (:require
   [clojure.test :refer :all]
   [metabase.lib.convert :as lib.convert]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]))

(deftest between-filter-desugaring-test
  (testing ":between filter with options gets desugared to compound comparisons"
    (mt/dataset test-data
      (testing "Exclusive min boundary"
        (let [query        (mt/mbql-query venues
                             {:filter [:between [:field (mt/id :venues :price) nil] 1 3
                                       {:min-inclusive false}]})
              preprocessed (qp.preprocess/preprocess query)]
          (testing "Desugared to :and with :> and :<="
            (is (= [:and
                    [:> [:field (mt/id :venues :price) nil] [:value 1 :any]]
                    [:<= [:field (mt/id :venues :price) nil] [:value 3 :any]]]
                   (-> (get-in preprocessed [:query :filter])
                       (update-in [1 2] (constantly [:value 1 :any]))
                       (update-in [2 2] (constantly [:value 3 :any]))))))
          (testing "Query executes successfully"
            (let [result (qp/process-query query)]
              (is (map? result))
              (is (contains? result :data))
              (is (pos? (count (get-in result [:data :rows])))))))))))

(deftest between-filter-sql-generation-test
  (testing ":between filter options affect generated SQL"
    (mt/dataset test-data
      (doseq [[test-case filter-clause expected-pattern]
              [["Default (both inclusive)"
                [:between [:field (mt/id :venues :price) nil] 1 3]
                #"\"PRICE\" BETWEEN"]

               ["Min exclusive"
                [:between [:field (mt/id :venues :price) nil] 1 3 {:min-inclusive false}]
                #"\"PRICE\" > 1.* AND .*\"PRICE\" <="]

               ["Max exclusive"
                [:between [:field (mt/id :venues :price) nil] 1 3 {:max-inclusive false}]
                #"\"PRICE\" >= 1.* AND .*\"PRICE\" <"]

               ["Both exclusive"
                [:between [:field (mt/id :venues :price) nil] 1 3 {:min-inclusive false :max-inclusive false}]
                #"\"PRICE\" > 1.* AND .*\"PRICE\" < 3"]]]
        (testing test-case
          (let [query        (mt/mbql-query venues
                               {:filter filter-clause
                                :limit  1})
                compiled     (qp.compile/compile query)
                native-query (:query compiled)]
            (when (string? native-query)
              (is (re-find expected-pattern native-query)
                  (str "SQL should match pattern for " test-case ": " native-query)))))))))

(deftest between-filter-results-test
  (testing ":between filter with options returns correct results"
    (mt/dataset test-data
      (let [price-index 5
            run-query (fn [min max options]
                        (mt/rows
                         (mt/run-mbql-query venues
                           {:filter   (into [:between [:field (mt/id :venues :price) nil] min max]
                                            (when options [options]))
                            :order-by [[:asc [:field (mt/id :venues :price) nil]]]})))]
        (doseq [[test-name
                 min max options expected-prices]
                [["Default inclusive returns boundary values"
                  2 3 nil #{2 3}]

                 ["Min exclusive excludes lower boundary"
                  2 3 {:min-inclusive false} #{3}]

                 ["Max exclusive excludes upper boundary"
                  2 3 {:max-inclusive false} #{2}]

                 ["Both exclusive excludes both boundaries"
                  1 4 {:min-inclusive false :max-inclusive false} #{2 3}]]]
          (testing test-name
            (let [result (run-query min max options)]
              (is (pos? (count result)))
              (is (every? #(expected-prices (nth % price-index)) result)))))))))

(deftest between-filter-pmbql-roundtrip-test
  (testing ":between filter options survive pMBQL roundtrip"
    (mt/dataset test-data
      (testing "Options preserved through query processing"
        (let [pmbql-query {:lib/type :mbql/query
                           :database (mt/id)
                           :stages   [{:lib/type     :mbql.stage/mbql
                                       :source-table (mt/id :venues)
                                       :filters      [[:between
                                                       {:min-inclusive false
                                                        :max-inclusive true}
                                                       [:field {} (mt/id :venues :price)]
                                                       1 3]]}]}
              legacy-query (lib.convert/->legacy-MBQL pmbql-query)
              processed-query (qp/process-query legacy-query)]
          (testing "Legacy query has options in correct position"
            (is (= [:between
                    [:field (mt/id :venues :price) nil]
                    1 3
                    {:min-inclusive false :max-inclusive true}]
                   (get-in legacy-query [:query :filter]))))

          (testing "Query executes successfully"
            (is (map? processed-query))
            (is (contains? processed-query :data)))

          (testing "Options preserved in processed query metadata"
            (let [filter-from-processed (get-in processed-query [:data :query :filter])]
              (when (and (vector? filter-from-processed)
                         (= :between (first filter-from-processed))
                         (= 5 (count filter-from-processed)))
                (is (= {:min-inclusive false :max-inclusive true}
                       (last filter-from-processed)))))))))))

(deftest between-filter-dataset-api-test
  (testing ":between filter with options works through dataset API"
    (mt/dataset test-data
      (let [test-between-case (fn [test-name options expected-prices expected-sql-patterns]
                                (testing test-name
                                  (let [query       (mt/mbql-query venues
                                                      {:filter (into [:between [:field (mt/id :venues :price) nil] 1 3]
                                                                     (when options [options]))})
                                        result      (mt/user-http-request :rasta :post 202 "dataset" query)
                                        price-index 5
                                        rows        (get-in result [:data :rows])
                                        prices      (set (map #(nth % price-index) rows))]
                                    (is (= expected-prices prices)
                                        (str test-name " should return prices " expected-prices))

                                    (testing "Native query shows correct SQL"
                                      (let [native-form (get-in result [:data :native_form :query])]
                                        (is (string? native-form))
                                        (doseq [pattern expected-sql-patterns]
                                          (is (re-find pattern native-form))))))))]
        (test-between-case "Default inclusive boundaries"
                           nil
                           #{1 2 3}
                           [#"\"PRICE\" BETWEEN 1 AND 3"])
        (test-between-case "Min-inclusive false"
                           {:min-inclusive false}
                           #{2 3}
                           [#"\"PRICE\" > 1" #"\"PRICE\" <= 3"])
        (test-between-case "Max-inclusive false"
                           {:max-inclusive false}
                           #{1 2}
                           [#"\"PRICE\" >= 1" #"\"PRICE\" < 3"])
        (test-between-case "Both boundaries exclusive"
                           {:min-inclusive false :max-inclusive false}
                           #{2}
                           [#"\"PRICE\" > 1" #"\"PRICE\" < 3"])))))

(deftest between-filter-api-test
  (testing ":between filter with options works through API card execution"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
      (mt/dataset test-data
        (let [test-api-case (fn [test-name options expected-prices]
                              (testing test-name
                                (mt/with-temp [:model/Card card {:dataset_query
                                                                 (mt/mbql-query venues
                                                                   {:filter (into [:between [:field (mt/id :venues :price) nil] 1 3]
                                                                                  (when options [options]))})}]
                                  (let [result      (mt/user-http-request :rasta :post 202
                                                                          (format "card/%d/query" (:id card)))
                                        price-index 5
                                        rows        (get-in result [:data :rows])
                                        prices      (set (map #(nth % price-index) rows))]
                                    (is (= expected-prices prices)
                                        (str test-name " should return prices " expected-prices))))))]
          (test-api-case "Default inclusive boundaries"
                         nil
                         #{1 2 3})
          (test-api-case "Min-inclusive false"
                         {:min-inclusive false}
                         #{2 3})
          (test-api-case "Max-inclusive false"
                         {:max-inclusive false}
                         #{1 2})
          (test-api-case "Both boundaries exclusive"
                         {:min-inclusive false :max-inclusive false}
                         #{2}))))))
