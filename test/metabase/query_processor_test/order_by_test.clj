(ns metabase.query-processor-test.order-by-test
  "Tests for the `:order-by` clause."
  (:require [clojure.math.numeric-tower :as math]
            [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

(qp.test/expect-with-non-timeseries-dbs
  [[1 12 375]
   [1  9 139]
   [1  1  72]
   [2 15 129]
   [2 12 471]
   [2 11 325]
   [2  9 590]
   [2  9 833]
   [2  8 380]
   [2  5 719]]
  (qp.test/format-rows-by [int int int]
    (qp.test/rows
      (data/run-mbql-query checkins
        {:fields   [$venue_id $user_id $id]
         :order-by [[:asc $venue_id]
                    [:desc $user_id]
                    [:asc $id]]
         :limit    10}))))


;;; ------------------------------------------- order-by aggregate fields --------------------------------------------

;;; order-by aggregate ["count"]
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[4  6]
          [3 13]
          [1 22]
          [2 59]]
   :cols [(qp.test/breakout-col :venues :price)
          (qp.test/aggregate-col :count)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int]
      (data/run-mbql-query venues
        {:aggregation [[:count]]
         :breakout    [$price]
         :order-by    [[:asc [:aggregation 0]]]}))))


;;; order-by aggregate ["sum" field-id]
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[2 2855]
          [1 1211]
          [3  615]
          [4  369]]
   :cols [(qp.test/breakout-col :venues :price)
          (qp.test/aggregate-col :sum :venues :id)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int]
      (data/run-mbql-query venues
        {:aggregation [[:sum $id]]
         :breakout    [$price]
         :order-by    [[:desc [:aggregation 0]]]}))))


;;; order-by aggregate ["distinct" field-id]
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[4  6]
          [3 13]
          [1 22]
          [2 59]]
   :cols [(qp.test/breakout-col :venues :price)
          (qp.test/aggregate-col :distinct :venues :id)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int]
      (data/run-mbql-query venues
        {:aggregation [[:distinct $id]]
         :breakout    [$price]
         :order-by    [[:asc [:aggregation 0]]]}))))


;;; order-by aggregate ["avg" field-id]
(qp.test/expect-with-non-timeseries-dbs
  {:rows [[3 22]
          [2 28]
          [1 32]
          [4 53]]
   :cols [(qp.test/breakout-col :venues :price)
          (qp.test/aggregate-col :avg :venues :category_id)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int]
      (data/run-mbql-query venues
        {:aggregation [[:avg $category_id]]
         :breakout    [$price]
         :order-by    [[:asc [:aggregation 0]]]}))))

;;; ### order-by aggregate ["stddev" field-id]
;; SQRT calculations are always NOT EXACT (normal behavior) so round everything to the nearest int.
;; Databases might use different versions of SQRT implementations
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :standard-deviation-aggregations)
  {:rows [[3 (if (= :mysql driver/*driver*) 25 26)]
          [1 24]
          [2 21]
          [4 (if (= :mysql driver/*driver*) 14 15)]]
   :cols [(qp.test/breakout-col :venues :price)
          (qp.test/aggregate-col :stddev (qp.test/col :venues :category_id))]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int (comp int math/round)]
      (data/run-mbql-query venues
        {:aggregation [[:stddev $category_id]]
         :breakout    [$price]
         :order-by    [[:desc [:aggregation 0]]]}))))
