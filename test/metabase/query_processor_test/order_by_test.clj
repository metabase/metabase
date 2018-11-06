(ns metabase.query-processor-test.order-by-test
  "Tests for the `:order-by` clause."
  (:require [clojure.math.numeric-tower :as math]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor-test :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets :refer [*engine*]]
            [metabase.test.util :as tu]))

(expect-with-non-timeseries-dbs
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
  (->> (data/run-mbql-query checkins
         {:fields   [$venue_id $user_id $id]
          :order-by [[:asc $venue_id]
                     [:desc $user_id]
                     [:asc $id]]
          :limit    10})
       rows (format-rows-by [int int int])))


;;; ------------------------------------------- order-by aggregate fields --------------------------------------------

;;; order-by aggregate ["count"]
(qp-expect-with-all-engines
  {:columns     [(data/format-name "price")
                 "count"]
   :rows        [[4  6]
                 [3 13]
                 [1 22]
                 [2 59]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :count)]
   :native_form true}
  (->> (data/run-mbql-query venues
         {:aggregation [[:count]]
          :breakout    [$price]
          :order-by    [[:asc [:aggregation 0]]]})
       booleanize-native-form
       (format-rows-by [int int])
       tu/round-fingerprint-cols))


;;; order-by aggregate ["sum" field-id]
(qp-expect-with-all-engines
  {:columns     [(data/format-name "price")
                 "sum"]
   :rows        [[2 2855]
                 [1 1211]
                 [3  615]
                 [4  369]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :sum (venues-col :id))]
   :native_form true}
  (->> (data/run-mbql-query venues
         {:aggregation [[:sum $id]]
          :breakout    [$price]
          :order-by    [[:desc [:aggregation 0]]]})
       booleanize-native-form
       (format-rows-by [int int])
       tu/round-fingerprint-cols))


;;; order-by aggregate ["distinct" field-id]
(qp-expect-with-all-engines
  {:columns     [(data/format-name "price")
                 "count"]
   :rows        [[4  6]
                 [3 13]
                 [1 22]
                 [2 59]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :count (Field (data/id :venues :id)))]
   :native_form true}
  (->> (data/run-mbql-query venues
         {:aggregation [[:distinct $id]]
          :breakout    [$price]
          :order-by    [[:asc [:aggregation 0]]]})
       booleanize-native-form
       (format-rows-by [int int])
       tu/round-fingerprint-cols))


;;; order-by aggregate ["avg" field-id]
(expect-with-non-timeseries-dbs
  {:columns     [(data/format-name "price")
                 "avg"]
   :rows        [[3 22]
                 [2 28]
                 [1 32]
                 [4 53]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :avg (venues-col :category_id))]
   :native_form true}
  (->> (data/run-mbql-query venues
         {:aggregation [[:avg $category_id]]
          :breakout    [$price]
          :order-by    [[:asc [:aggregation 0]]]})
       booleanize-native-form
       data
       (format-rows-by [int int])
       tu/round-fingerprint-cols))

;;; ### order-by aggregate ["stddev" field-id]
;; SQRT calculations are always NOT EXACT (normal behavior) so round everything to the nearest int.
;; Databases might use different versions of SQRT implementations
(datasets/expect-with-engines (non-timeseries-engines-with-feature :standard-deviation-aggregations)
  {:columns     [(data/format-name "price")
                 "stddev"]
   :rows        [[3 (if (#{:mysql :crate} *engine*) 25 26)]
                 [1 24]
                 [2 21]
                 [4 (if (#{:mysql :crate} *engine*) 14 15)]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :stddev (venues-col :category_id))]
   :native_form true}
  (->> (data/run-mbql-query venues
         {:aggregation [[:stddev $category_id]]
          :breakout    [$price]
          :order-by    [[:desc [:aggregation 0]]]})
       booleanize-native-form
       data
       (format-rows-by [int (comp int math/round)])
       tu/round-fingerprint-cols))
