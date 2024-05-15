(ns metabase.query-processor-test.expression-aggregations-test
  "Tests for expression aggregations and for named aggregations."
  (:require
   [clojure.test :refer :all]
   [metabase.models.legacy-metric :refer [LegacyMetric]]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel sum-test
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

(deftest ^:parallel min-test
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

(deftest ^:parallel max-test
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

(deftest ^:parallel avg-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "avg, -"
      (is (= [[1  55]
              [2  96]
              [3 141]
              [4 246]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:avg [:* $id $price]]]
                  :breakout    [$price]})))))))

(deftest ^:parallel post-aggregation-math-test
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
                    :breakout    [$price]}))))))))

(deftest ^:parallel post-aggregation-math-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "post-aggregation math"
      (testing "w/ 3 args: count + sum + count"
        (is (= [[1  66]
                [2 236]
                [3  65]
                [4  36]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:+ [:count $id] [:sum $price] [:count $price]]]
                    :breakout    [$price]}))))))))

(deftest ^:parallel post-aggregation-math-test-3
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "post-aggregation math"
      (testing "w/ a constant: count * 10"
        (is (= [[1 220]
                [2 590]
                [3 130]
                [4  60]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:* [:count $id] 10]]
                    :breakout    [$price]}))))))))

(deftest ^:parallel post-aggregation-math-test-4
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "post-aggregation math"
      (testing "w/ avg: count + avg"
        (is (= [[1  77]
                [2 107]
                [3  60]
                [4  67]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:+ [:count $id] [:avg $id]]]
                    :breakout    [$price]}))))))))

(deftest ^:parallel nested-post-aggregation-math-test
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

(deftest ^:parallel nested-post-multi-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "nested post-aggregation math: count + (count * sum)"
      (is (= [[1   990 22 22 2.0]
              [2 10502 59 59 2.0]
              [3   689 13 13 2.0]
              [4   186  6  6 0.0]]
             (mt/formatted-rows [int int int int float]
               (mt/run-mbql-query venues
                 {:aggregation [[:+
                                 [:count $id]
                                 [:* [:count $id] [:sum [:+ $price 1]]]]
                                [:count $id]
                                [:count]
                                [:* 2 [:share [:< $price 4]]]]
                  :breakout    [$price]})))))))

(deftest ^:parallel math-inside-aggregations-test
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

(deftest ^:parallel more-math-inside-aggregations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "post aggregation math, including more than the basic 4 arithmetic ops: round(30 * (count / day(now)))"
      (is (= [[35175]] ;; 18760 orders total. 18760/16 = 1172.5 per day, which extrapolates to 35175.0 a month.
             (mt/formatted-rows [int]
               (mt/run-mbql-query orders
                 {:aggregation [[:round [:* 30 [:/ [:count]
                                                ;; Want to divide by the day of the month, but that's unstable in tests.
                                                ;; So it's the 16th of the month forever.
                                                16 #_[:get-day [:now]]]]]]})))))))

(deftest ^:parallel integer-aggregation-division-test
  (testing "division of two sum aggregations (#30262)"
    (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
      (mt/dataset test-data
        (testing "expression parts not selected"
          (is (= [[27]]
                 (mt/formatted-rows [int]
                   (mt/run-mbql-query orders
                     {:aggregation [[:/ [:sum $product_id] [:sum $quantity]]]})))))
        (testing "expression parts also selected"
         (is (= [[1885900 69540 27]]
                (mt/formatted-rows [int int int]
                  (mt/run-mbql-query orders
                    {:aggregation [[:sum $product_id]
                                   [:sum $quantity]
                                   [:/ [:sum $product_id] [:sum $quantity]]]})))))))))

(deftest ^:parallel aggregation-without-field-test
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

(deftest ^:parallel sort-by-unnamed-aggregate-expression-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "Sorting by an un-named aggregate expression"
      (is (= [[1 2] [2 2] [12 2] [4 4] [7 4] [10 4] [11 4] [8 8]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query users
                 {:aggregation [[:* [:count] 2]]
                  :breakout    [!month-of-year.last_login]
                  :order-by    [[:asc [:aggregation 0]]]})))))))

(deftest ^:parallel math-inside-the-aggregation-test
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

(deftest ^:parallel named-expression-aggregation-test
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
      (t2.with-temp/with-temp [LegacyMetric metric {:table_id   (mt/id :venues)
                                              :definition {:aggregation [:sum [:field (mt/id :venues :price) nil]]
                                                           :filter      [:> [:field (mt/id :venues :price) nil] 1]}}]
        (is (= [[2 119]
                [3  40]
                [4  25]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [:+ [:metric (u/the-id metric)] 1]
                    :breakout    [$price]}))))))

    (testing "check that we can handle Metrics inside an `:aggregation-options` clause"
      (t2.with-temp/with-temp [LegacyMetric metric {:table_id   (mt/id :venues)
                                              :definition {:aggregation [:sum [:field (mt/id :venues :price) nil]]
                                                           :filter      [:> [:field (mt/id :venues :price) nil] 1]}}]
        (is (= {:rows    [[2 118]
                          [3  39]
                          [4  24]]
                :columns [(mt/format-name "price")
                          "auto_generated_name"]}
               (mt/format-rows-by [int int]
                 (mt/rows+column-names
                  (mt/run-mbql-query venues
                    {:aggregation [[:aggregation-options [:metric (u/the-id metric)] {:name "auto_generated_name"}]]
                     :breakout    [$price]})))))))

    (testing "check that Metrics with a nested aggregation still work inside an `:aggregation-options` clause"
      (t2.with-temp/with-temp [LegacyMetric metric (mt/$ids venues
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
                     :breakout    [$price]})))))))))

(deftest ^:parallel named-aggregations-metadata-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "check that named aggregations come back with the correct column metadata (#4002)"
      (is (=? (assoc (qp.test-util/aggregate-col :count)
                     :name         "auto_generated_name"
                     :display_name "Count of Things")
              (-> (mt/run-mbql-query venues
                    {:aggregation [[:aggregation-options ["COUNT"]
                                    {:name "auto_generated_name"
                                     :display-name "Count of Things"}]]})
                  mt/cols
                  first))))))

(deftest ^:parallel cumulative-count-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "check that we can use cumlative count in expression aggregations"
      (is (= [[1000]]
             (mt/format-rows-by [int]
               (mt/rows
                 (mt/run-mbql-query venues
                   {:aggregation [["*" ["cum_count"] 10]]}))))))))

(deftest ^:parallel named-expressions-inside-expression-aggregations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
    (testing "can we use named expressions inside expression aggregations?"
      (is (= [[406]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum [:expression "double-price"]]]
                  :expressions {"double-price" [:* $price 2]}})))))))

(deftest ^:parallel order-by-named-aggregation-test
  (testing "Ordering by a named aggregation whose alias has uppercase letters works (#18211)"
    (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
      (mt/dataset test-data
        (is (= [["Doohickey" 156.6]
                ["Widget" 170.3]
                ["Gadget" 181.9]
                ["Gizmo" 185.5]]
              (mt/formatted-rows [str 1.0]
                (mt/run-mbql-query products
                  {:aggregation [[:aggregation-options [:sum $rating] {:name "MyCE"}]]
                   :breakout    [$category]
                   :order-by    [[:asc [:aggregation 0]]]}))))))))
