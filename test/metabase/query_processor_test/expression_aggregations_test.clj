(ns metabase.query-processor-test.expression-aggregations-test
  "Tests for expression aggregations and for named aggregations."
  (:require [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.models.metric :refer [Metric]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [toucan.util.test :as tt]))

;; sum, *
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1 1211]
   [2 5710]
   [3 1845]
   [4 1476]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:sum [:* $id $price]]]
         :breakout    [$price]}))))

;; min, +
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1 10]
   [2  4]
   [3  4]
   [4 20]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:min [:+ $id $price]]]
         :breakout    [$price]}))))

;; max, /
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1 94]
   [2 50]
   [3 26]
   [4 20]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:max [:/ $id $price]]]
         :breakout    [$price]}))))

;; avg, -
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  (if (= driver/*driver* :h2)
    [[1  55]
     [2  97]
     [3 142]
     [4 246]]
    [[1  55]
     [2  96]
     [3 141]
     [4 246]])
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:avg [:* $id $price]]]
         :breakout    [$price]}))))

;; post-aggregation math w/ 2 args: count + sum
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1  44]
   [2 177]
   [3  52]
   [4  30]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:+
                        [:count $id]
                        [:sum $price]]]
         :breakout    [$price]}))))

;; post-aggregation math w/ 3 args: count + sum + count
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1  66]
   [2 236]
   [3  65]
   [4  36]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:+ [:count $id] [:sum $price] [:count $price]]]
         :breakout    [$price]}))))

;; post-aggregation math w/ a constant: count * 10
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1 220]
   [2 590]
   [3 130]
   [4  60]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:* [:count $id] 10]]
         :breakout    [$price]}))))

;; nested post-aggregation math: count + (count * sum)
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1  506]
   [2 7021]
   [3  520]
   [4  150]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:+
                        [:count $id]
                        [:* [:count $id] [:sum $price]]]]
         :breakout    [$price]}))))

;; post-aggregation math w/ avg: count + avg
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  (if (= driver/*driver* :h2)
    [[1  77]
     [2 107]
     [3  60]
     [4  68]]
    [[1  77]
     [2 107]
     [3  60]
     [4  67]])
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:+ [:count $id] [:avg $id]]]
         :breakout    [$price]}))))

;; post aggregation math + math inside aggregations: max(venue_price) + min(venue_price - id)
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1 -92]
   [2 -96]
   [3 -74]
   [4 -73]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:+ [:max $price] [:min [:- $price $id]]]]
         :breakout    [$price]}))))

;; aggregation w/o field
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1 23]
   [2 60]
   [3 14]
   [4  7]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:+ 1 [:count]]]
         :breakout    [$price]}))))

;; Sorting by an un-named aggregate expression
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1 2] [2 2] [12 2] [4 4] [7 4] [10 4] [11 4] [8 8]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query users
        {:aggregation [[:* [:count] 2]]
         :breakout    [[:datetime-field $last_login :month-of-year]]
         :order-by    [[:asc [:aggregation 0]]]}))))

;; aggregation with math inside the aggregation :scream_cat:
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1  44]
   [2 177]
   [3  52]
   [4  30]]
  (qp.test/format-rows-by [int int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:sum [:+ $price 1]]]
         :breakout    [$price]}))))

;; check that we can name an expression aggregation w/ aggregation at top-level
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  {:rows    [[1  44]
             [2 177]
             [3  52]
             [4  30]]
   :columns [(data/format-name "price")
             "sum_of_price"]}
  (qp.test/format-rows-by [int int]
    (qp.test/rows+column-names
      (data/run-mbql-query venues
                           {:aggregation [[:aggregation-options [:sum [:+ $price 1]] {:name "sum_of_price"}]]
         :breakout    [$price]}))))

;; check that we can name an expression aggregation w/ expression at top-level
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  {:rows    [[1 -19]
             [2  77]
             [3  -2]
             [4 -17]]
   :columns [(data/format-name "price")
             "sum_41"]}
  (qp.test/format-rows-by [int int]
    (qp.test/rows+column-names
      (data/run-mbql-query venues
        {:aggregation [[:aggregation-options [:- [:sum $price] 41] {:name "sum_41"}]]
         :breakout    [$price]}))))

;; check that we can handle Metrics inside expression aggregation clauses
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[2 119]
   [3  40]
   [4  25]]
  (tt/with-temp Metric [metric {:table_id   (data/id :venues)
                                :definition {:aggregation [:sum [:field-id (data/id :venues :price)]]
                                             :filter      [:> [:field-id (data/id :venues :price)] 1]}}]
    (qp.test/format-rows-by [int int]
      (qp.test/rows
        (data/run-mbql-query venues
          {:aggregation [:+ [:metric (u/get-id metric)] 1]
           :breakout    [[:field-id $price]]})))))

;; check that we can handle Metrics inside an `:aggregation-options` clause
;; TODO - Pretty sure this test doesn't belong here (?)
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  {:rows    [[2 118]
             [3  39]
             [4  24]]
   :columns [(data/format-name "price")
             "auto_generated_name"]}
  (tt/with-temp Metric [metric {:table_id   (data/id :venues)
                                :definition {:aggregation [:sum [:field-id (data/id :venues :price)]]
                                             :filter      [:> [:field-id (data/id :venues :price)] 1]}}]
    (qp.test/format-rows-by [int int]
      (qp.test/rows+column-names
        (data/run-mbql-query venues
          {:aggregation [[:aggregation-options [:metric (u/get-id metric)] {:name "auto_generated_name"}]]
           :breakout    [[:field-id $price]]})))))

;; check that Metrics with a nested aggregation still work inside an `:aggregation-options` clause
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  {:rows    [[2 118]
             [3  39]
             [4  24]]
   :columns [(data/format-name "price")
             "auto_generated_name"]}
  (tt/with-temp Metric [metric (data/$ids venues
                                 {:table_id   $$venues
                                  :definition {:aggregation [[:sum $price]]
                                               :filter      [:> $price 1]}})]
    (qp.test/format-rows-by [int int]
      (qp.test/rows+column-names
        (data/run-mbql-query venues
          {:aggregation [[:aggregation-options [:metric (u/get-id metric)] {:name "auto_generated_name"}]]
           :breakout    [[:field-id $price]]})))))

;; check that named aggregations come back with the correct column metadata (#4002)
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  (assoc (qp.test/aggregate-col :count)
    :name         "auto_generated_name"
    :display_name "Count of Things")
  (-> (data/run-mbql-query venues
        {:aggregation [[:aggregation-options ["COUNT"] {:name "auto_generated_name", :display-name "Count of Things"}]]})
      qp.test/cols
      first))

;; check that we can use cumlative count in expression aggregations
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[1000]]
  (qp.test/format-rows-by [int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [["*" ["cum_count"] 10]]}))))

;; can we use named expressions inside expression aggregations?
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :expression-aggregations)
  [[406]]
  (qp.test/format-rows-by [int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:aggregation [[:sum [:expression "double-price"]]]
         :expressions {"double-price" [:* $price 2]}}))))
