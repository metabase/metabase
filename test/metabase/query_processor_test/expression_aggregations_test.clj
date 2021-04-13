(ns metabase.query-processor-test.expression-aggregations-test
  "Tests for expression aggregations and for named aggregations."
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.models.metric :refer [Metric]]
            [metabase.query-processor-test :as qp.test]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest sum-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "sum, *"
      (is (= [[1 1211]
              [2 5710]
              [3 1845]
              [4 1476]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum [:* $id $price]]]
                  :breakout    [$price]})))))))

(deftest min-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "min, +"
      (is (= [[1 10]
              [2  4]
              [3  4]
              [4 20]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:min [:+ $id $price]]]
                  :breakout    [$price]})))))))

(deftest max-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "max, /"
      (is (= [[1 94]
              [2 50]
              [3 26]
              [4 20]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:max [:/ $id $price]]]
                  :breakout    [$price]})))))))

(deftest avg-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "avg, -"
      (is (= (if (= driver/*driver* :h2)
               [[1  55]
                [2  97]
                [3 142]
                [4 246]]
               [[1  55]
                [2  96]
                [3 141]
                [4 246]])
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:avg [:* $id $price]]]
                  :breakout    [$price]})))))))

(deftest post-aggregation-math-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "post-aggregation math"
      (testing "w/ 2 args: count + sum"
        (is (= [[1  44]
                [2 177]
                [3  52]
                [4  30]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:+
                                   [:count $id]
                                   [:sum $price]]]
                    :breakout    [$price]})))))

      (testing "w/ 3 args: count + sum + count"
        (is (= [[1  66]
                [2 236]
                [3  65]
                [4  36]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:+ [:count $id] [:sum $price] [:count $price]]]
                    :breakout    [$price]})))))

      (testing "w/ a constant: count * 10"
        (is (= [[1 220]
                [2 590]
                [3 130]
                [4  60]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:* [:count $id] 10]]
                    :breakout    [$price]})))))

      (testing "w/ avg: count + avg"
        (is (= (if (= driver/*driver* :h2)
                 [[1  77]
                  [2 107]
                  [3  60]
                  [4  68]]
                 [[1  77]
                  [2 107]
                  [3  60]
                  [4  67]])
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:+ [:count $id] [:avg $id]]]
                    :breakout    [$price]}))))))))

(deftest nested-post-aggregation-mat-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "nested post-aggregation math: count + (count * sum)"
      (is (= [[1  506]
              [2 7021]
              [3  520]
              [4  150]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:+
                                 [:count $id]
                                 [:* [:count $id] [:sum $price]]]]
                  :breakout    [$price]})))))))

(deftest math-inside-aggregations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "post aggregation math + math inside aggregations: max(venue_price) + min(venue_price - id)"
      (is (= [[1 -92]
              [2 -96]
              [3 -74]
              [4 -73]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:+ [:max $price] [:min [:- $price $id]]]]
                  :breakout    [$price]})))))))

(deftest aggregation-without-field-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "aggregation w/o field"
      (is (= [[1 23]
              [2 60]
              [3 14]
              [4  7]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:+ 1 [:count]]]
                  :breakout    [$price]})))))))

(deftest sort-by-unnamed-aggregate-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "Sorting by an un-named aggregate expression"
      (is (= [[1 2] [2 2] [12 2] [4 4] [7 4] [10 4] [11 4] [8 8]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query users
                 {:aggregation [[:* [:count] 2]]
                  :breakout    [[:datetime-field $last_login :month-of-year]]
                  :order-by    [[:asc [:aggregation 0]]]})))))))

(deftest math-inside-the-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "aggregation with math inside the aggregation :scream_cat:"
      (is (= [[1  44]
              [2 177]
              [3  52]
              [4  30]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum [:+ $price 1]]]
                  :breakout    [$price]})))))))

(deftest named-expression-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "check that we can name an expression aggregation w/ aggregation at top-level"
      (is (= {:rows    [[1  44]
                        [2 177]
                        [3  52]
                        [4  30]]
              :columns [(mt/format-name "price")
                        "sum_of_price"]}
             (mt/format-rows-by [int int]
               (mt/rows+column-names
                 (mt/run-mbql-query venues
                   {:aggregation [[:aggregation-options [:sum [:+ $price 1]] {:name "sum_of_price"}]]
                    :breakout    [$price]}))))))

    (testing "check that we can name an expression aggregation w/ expression at top-level"
      (is (= {:rows    [[1 -19]
                        [2  77]
                        [3  -2]
                        [4 -17]]
              :columns [(mt/format-name "price")
                        "sum_41"]}
             (mt/format-rows-by [int int]
               (mt/rows+column-names
                 (mt/run-mbql-query venues
                   {:aggregation [[:aggregation-options [:- [:sum $price] 41] {:name "sum_41"}]]
                    :breakout    [$price]}))))))))

(deftest metrics-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "check that we can handle Metrics inside expression aggregation clauses"
      (mt/with-temp Metric [metric {:table_id   (mt/id :venues)
                                    :definition {:aggregation [:sum [:field-id (mt/id :venues :price)]]
                                                 :filter      [:> [:field-id (mt/id :venues :price)] 1]}}]
        (is (= [[2 119]
                [3  40]
                [4  25]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [:+ [:metric (u/the-id metric)] 1]
                    :breakout    [[:field-id $price]]}))))))

    (testing "check that we can handle Metrics inside an `:aggregation-options` clause"
      (mt/with-temp Metric [metric {:table_id   (mt/id :venues)
                                    :definition {:aggregation [:sum [:field-id (mt/id :venues :price)]]
                                                 :filter      [:> [:field-id (mt/id :venues :price)] 1]}}]
        (is (= {:rows    [[2 118]
                          [3  39]
                          [4  24]]
                :columns [(mt/format-name "price")
                          "auto_generated_name"]}
               (mt/format-rows-by [int int]
                 (mt/rows+column-names
                   (mt/run-mbql-query venues
                     {:aggregation [[:aggregation-options [:metric (u/the-id metric)] {:name "auto_generated_name"}]]
                      :breakout    [[:field-id $price]]})))))))

    (testing "check that Metrics with a nested aggregation still work inside an `:aggregation-options` clause"
      (mt/with-temp Metric [metric (mt/$ids venues
                                     {:table_id   $$venues
                                      :definition {:aggregation [[:sum $price]]
                                                   :filter      [:> $price 1]}})]
        (is (= {:rows    [[2 118]
                          [3  39]
                          [4  24]]
                :columns [(mt/format-name "price")
                          "auto_generated_name"]}
               (mt/format-rows-by [int int]
                 (mt/rows+column-names
                   (mt/run-mbql-query venues
                     {:aggregation [[:aggregation-options [:metric (u/the-id metric)] {:name "auto_generated_name"}]]
                      :breakout    [[:field-id $price]]})))))))))

(deftest named-aggregations-metadata-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "check that named aggregations come back with the correct column metadata (#4002)"
      (is (= (assoc (qp.test/aggregate-col :count)
                    :name         "auto_generated_name"
                    :display_name "Count of Things")
             (-> (mt/run-mbql-query venues
                   {:aggregation [[:aggregation-options ["COUNT"]
                                   {:name "auto_generated_name"
                                    :display-name "Count of Things"}]]})
                 mt/cols
                 first))))))

(deftest cumulative-count-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "check that we can use cumlative count in expression aggregations"
      (is (= [[1000]]
             (mt/format-rows-by [int]
               (mt/rows
                 (mt/run-mbql-query venues
                   {:aggregation [["*" ["cum_count"] 10]]}))))))))

(deftest named-expressions-inside-expression-aggregations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "can we use named expressions inside expression aggregations?"
      (is (= [[406]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum [:expression "double-price"]]]
                  :expressions {"double-price" [:* $price 2]}})))))))

#_(deftest multiple-cumulative-sums-test
  ;; sample-dataset doesn't work on Redshift yet -- see #14784
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :expression-aggregations) :redshift)
    (testing "The results of divide or multiply two CumulativeSum should be correct (#15118)"
      (mt/dataset sample-dataset
        (is (= [["2016-01-01T00:00:00Z" 3236  2458.0  5694.0   1]
                ["2017-01-01T00:00:00Z" 17587 14995.0 32582.0  2]
                ["2018-01-01T00:00:00Z" 40381 35366.5 75747.5  3]
                ["2019-01-01T00:00:00Z" 65835 58002.7 123837.7 4]
                ["2020-01-01T00:00:00Z" 69540 64923.0 134463.0 5]]
               (mt/formatted-rows [identity int 2.0 2.0 int]
                 (mt/run-mbql-query orders
                   {:aggregation
                    [[:aggregation-options [:cum-sum $quantity] {:display-name "C1"}]
                     [:aggregation-options
                      [:cum-sum $product_id->products.rating]
                      {:display-name "C2"}]
                     [:aggregation-options
                      [:+
                       [:cum-sum $quantity]
                       [:cum-sum $product_id->products.rating]]
                      {:display-name "C3"}]
                     [:aggregation-options
                      [:*
                       [:cum-sum $quantity]
                       [:cum-sum $product_id->products.rating]]
                      {:display-name "C4"}]]
                    :breakout [!year.created_at]}))))))))
