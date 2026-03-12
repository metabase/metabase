(ns ^:mb/driver-tests metabase.query-processor.case-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- test-case
  ([expr]
   (some->> (mt/run-mbql-query venues {:aggregation [expr]})
            mt/rows
            ffirst
            double))

  ([mp expr]
   (let [query (lib/query mp (mt/mbql-query venues {:aggregation [expr]}))]
     (some->> (qp/process-query query)
              mt/rows
              ffirst
              double))))

(deftest ^:parallel test-case-aggregations
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 116.0 (test-case [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 2] 2]
                                          [[:< [:field (mt/id :venues :price) nil] 4] 1]]]])))))

(deftest ^:parallel test-case-aggregations-fields-as-values
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Can we use fields as values"
      (is (= 179.0 (test-case [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 2] [:field (mt/id :venues :price) nil]]
                                            [[:< [:field (mt/id :venues :price) nil] 4] [:field (mt/id :venues :price) nil]]]]]))))))

(deftest ^:parallel test-case-aggregations-else
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Test else clause"
      (is (= 122.0 (test-case [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 2] 2]]
                                     {:default 1}]]))))))

(deftest ^:parallel test-case-aggregations-implicit-else
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Test implicit else (= nil) clause"
      ;; Some DBs return 0 for sum of nulls.
      (is ((some-fn nil? zero?) (test-case [:sum [:case [[[:> [:field (mt/id :venues :price) nil] 200] 2]]]]))))))

(deftest ^:parallel test-case-aggregations-complex-filters
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Test complex filters"
      (is (= 34.0 (test-case [:sum
                              [:case [[[:and [:< [:field (mt/id :venues :price) nil] 4]
                                        [:or [:starts-with [:field (mt/id :venues :name) nil] "M"]
                                         [:ends-with [:field (mt/id :venues :name) nil] "t"]]]
                                       [:field (mt/id :venues :price) nil]]]]]))))))

(deftest ^:parallel test-case-aggregations-in-segments
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Can we use segments in case"
      (let [mp (lib.tu/mock-metadata-provider
                (mt/metadata-provider)
                {:segments [{:id         1
                             :table-id   (mt/id :venues)
                             :definition (lib/query (mt/metadata-provider)
                                                    (mt/mbql-query venues
                                                      {:filter [:< [:field (mt/id :venues :price) nil] 4]}))}]})]
        (is (= 179.0
               (test-case mp [:sum [:case [[[:segment 1] [:field (mt/id :venues :price) nil]]]]])))))))

(deftest ^:parallel test-case-aggregations-in-metric
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (testing "Can we use case in metric"
      (let [dataset-query (mt/mbql-query venues
                            {:aggregation [:sum
                                           [:case [[[:< $price 4]
                                                    $price]]]]})
            mp            (lib.tu/mock-metadata-provider
                           (mt/metadata-provider)
                           {:cards [{:id            1
                                     :type          :metric
                                     :dataset_query dataset-query}]})]
        (is (= 179.0
               (some->> (lib/query
                         mp
                         (mt/mbql-query venues {:aggregation  [[:metric 1]]
                                                :source-table "card__1"}))
                        qp/process-query
                        mt/rows
                        ffirst
                        double)))))))

(deftest ^:parallel test-case-aggregations-in-breakout
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
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

(deftest ^:parallel test-case-aggregations+expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Can we use case in metric expressions"
      (is (= 90.5  (test-case [:+ [:/ [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 4] [:field (mt/id :venues :price) nil]]]
                                             {:default 0}]] 2] 1]))))))

(deftest ^:parallel test-case-aggregations+expressions-2
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations :expressions)
    (testing "Can use expressions as values"
      (is (= 194.5 (test-case [:sum [:case [[[:< [:field (mt/id :venues :price) nil] 2] [:+ [:field (mt/id :venues :price) nil] 1]]
                                            [[:< [:field (mt/id :venues :price) nil] 4] [:+ [:/ [:field (mt/id :venues :price) nil] 2] 1]]]]]))))))

(deftest ^:parallel test-case-normalization
  (mt/test-drivers (mt/normal-drivers-with-feature :basic-aggregations)
    (is (= 116.0 (test-case ["sum" ["case" [[["<" ["field-id" (mt/id :venues :price)] 2] 2]
                                            [["<" ["field-id" (mt/id :venues :price)] 4] 1]]]])))))

(deftest ^:parallel test-case-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
    (is (= [nil -2.0 -1.0]
           (->> {:expressions {"case_test" [:case [[[:< [:field (mt/id :venues :price) nil] 2] -1.0]
                                                   [[:< [:field (mt/id :venues :price) nil] 3] -2.0]]]}
                 :fields [[:expression "case_test"]]}
                (mt/run-mbql-query venues)
                mt/rows
                (map (comp #(some-> % double) first))
                distinct
                sort)))))

(deftest ^:parallel two-case-functions-test
  (testing "We should support expressions with two case statements (#15107)"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
      (is (= [[1] [0]]
             (mt/formatted-rows
              [int]
              (mt/run-mbql-query products
                {:fields      [[:expression "two-cases"]]
                 :expressions {"two-cases" [:+
                                            [:case [[[:= $category "Widget"] 1]] {:default 0}]
                                            [:case [[[:> $rating 4] 1]] {:default 0}]]}
                 :limit    2
                 :order-by [[:asc $id]]})))))))

(deftest ^:parallel if-test
  (testing "If should work as syntactic sugar for case"
    (mt/test-drivers (mt/normal-drivers-with-feature :expressions)
      (let [query (mt/mbql-query products
                    {:expressions {"If"
                                   [:if [[[:= $id 1] "First"]
                                         [[:= $id 2] "Second"]]
                                    {:default "Other"}]}
                     :fields      [$id
                                   [:expression "If"]]
                     :filter      [:= [:expression "If" {:base-type :type/Text}] "Other"]
                     :order-by    [[:asc $id]]
                     :limit       2})]
        (is (= [[3 "Other"]
                [4 "Other"]]
               (mt/formatted-rows [int str] (qp/process-query query))))))))
