(ns metabase.query-processor-test.case-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Metric Segment]]
            [metabase.test :as mt]))

(defn- test-case
  [expr]
  (some->> (mt/run-mbql-query venues {:aggregation [expr]})
           mt/rows
           ffirst
           double))

(deftest test-case-aggregations
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 116.0 (test-case [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 2] 2]
                                          [[:< [:field (mt/id :venues :price) nil] 4] 1]]]])))
    (testing "Can we use fields as values"
      (is (= 179.0 (test-case [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 2] [:field (mt/id :venues :price) nil]]
                                            [[:< [:field (mt/id :venues :price) nil] 4] [:field (mt/id :venues :price) nil]]]]]))))
    (testing "Test else clause"
      (is (= 122.0 (test-case [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 2] 2]]
                                     {:default 1}]]))))
    (testing "Test implicit else (= nil) clause"
      ;; Some DBs return 0 for sum of nulls.
      (is ((some-fn nil? zero?) (test-case [:sum [:case [[[:> [:field (mt/id :venues :price) nil] 200] 2]]]]))))

    (testing "Test complex filters"
      (is (= 34.0 (test-case [:sum
                              [:case [[[:and [:< [:field (mt/id :venues :price) nil] 4]
                                        [:or [:starts-with [:field (mt/id :venues :name) nil] "M"]
                                         [:ends-with [:field (mt/id :venues :name) nil] "t"]]]
                                       [:field (mt/id :venues :price) nil]]]]]))))
    (testing "Can we use segments in case"
      (mt/with-temp Segment [{segment-id :id} {:table_id   (mt/id :venues)
                                               :definition {:source-table (mt/id :venues)
                                                            :filter       [:< [:field (mt/id :venues :price) nil] 4]}}]
        (is (=  179.0  (test-case [:sum [:case [[[:segment segment-id] [:field (mt/id :venues :price) nil]]]]])))))
    (testing "Can we use case in metric"
      (mt/with-temp Metric [{metric-id :id} {:table_id   (mt/id :venues)
                                             :definition {:source-table (mt/id :venues)
                                                          :aggregation  [:sum
                                                                         [:case [[[:< [:field (mt/id :venues :price) nil] 4]
                                                                                  [:field (mt/id :venues :price) nil]]]]]}}]
        (is (= 179.0 (test-case [:metric metric-id])))))
    (testing "Can we use case with breakout"
      (is (= [[2 0.0]
              [3 0.0]
              [4 1.0]
              [5 1.0]]
             (->> {:aggregation [[:sum [:case [[[:< [:field (mt/id :venues :price) nil] 2] [:field (mt/id :venues :price) nil]]]
                                        {:default 0}]]]
                   :breakout    [[:field (mt/id :venues :category_id) nil]]
                   :limit       4}
                  (mt/run-mbql-query venues)
                  (mt/round-all-decimals 2)
                  mt/rows
                  (map (fn [[k v]]
                         [(long k) (double v)]))))))))

(deftest test-case-aggregations+expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Can we use case in metric expressions"
      (is (= 90.5  (test-case [:+ [:/ [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 4] [:field (mt/id :venues :price) nil]]]
                                             {:default 0}]] 2] 1]))))
    (testing "Can use expressions as values"
      (is (= 194.5 (test-case [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 2] [:+ [:field (mt/id :venues :price) nil] 1]]
                                            [[:< [:field (mt/id :venues :price) nil] 4] [:+ [:/ [:field (mt/id :venues :price) nil] 2] 1]]]]]))))))

(deftest test-case-normalization
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 116.0 (test-case ["sum" ["case" [[["<" ["field-id" (mt/id :venues :price)] 2] 2]
                                            [["<" ["field-id" (mt/id :venues :price)] 4] 1]]]])))))

(deftest test-case-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= [nil -2.0 -1.0]
           (->> {:expressions {"case_test" [:case [[[:< [:field (mt/id :venues :price) nil] 2] -1.0]
                                                   [[:< [:field (mt/id :venues :price) nil] 3] -2.0]] ]}
                 :fields [[:expression "case_test"]]}
                (mt/run-mbql-query venues)
                mt/rows
                (map (comp #(some-> % double) first))
                distinct
                sort)))))
