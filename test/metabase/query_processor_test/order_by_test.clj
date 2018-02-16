(ns metabase.query-processor-test.order-by-test
  "Tests for the `:order-by` clause."
  (:require [clojure.math.numeric-tower :as math]
            [metabase.query-processor-test :refer :all]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets :refer [*engine*]]))

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
  (->> (data/run-query checkins
         (ql/fields $venue_id $user_id $id)
         (ql/order-by (ql/asc $venue_id)
                      (ql/desc $user_id)
                      (ql/asc $id))
         (ql/limit 10))
       rows (format-rows-by [int int int])))


;;; ------------------------------------------------------------ order_by aggregate fields ------------------------------------------------------------

;;; order_by aggregate ["count"]
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
  (->> (data/run-query venues
         (ql/aggregation (ql/count))
         (ql/breakout $price)
         (ql/order-by (ql/asc (ql/aggregate-field 0))))
       booleanize-native-form
       (format-rows-by [int int])))


;;; order_by aggregate ["sum" field-id]
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
  (->> (data/run-query venues
         (ql/aggregation (ql/sum $id))
         (ql/breakout $price)
         (ql/order-by (ql/desc (ql/aggregate-field 0))))
       booleanize-native-form
       (format-rows-by [int int])))


;;; order_by aggregate ["distinct" field-id]
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
  (->> (data/run-query venues
         (ql/aggregation (ql/distinct $id))
         (ql/breakout $price)
         (ql/order-by (ql/asc (ql/aggregate-field 0))))
       booleanize-native-form
       (format-rows-by [int int])))


;;; order_by aggregate ["avg" field-id]
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
  (->> (data/run-query venues
         (ql/aggregation (ql/avg $category_id))
         (ql/breakout $price)
         (ql/order-by (ql/asc (ql/aggregate-field 0))))
       booleanize-native-form
       :data (format-rows-by [int int])))

;;; ### order_by aggregate ["stddev" field-id]
;; SQRT calculations are always NOT EXACT (normal behavior) so round everything to the nearest int.
;; Databases might use different versions of SQRT implementations
(datasets/expect-with-engines (non-timeseries-engines-with-feature :standard-deviation-aggregations)
  {:columns     [(data/format-name "price")
                 "stddev"]
   :rows        [[3 (if (contains? #{:mysql :crate} *engine*) 25 26)]
                 [1 24]
                 [2 21]
                 [4 (if (contains? #{:mysql :crate} *engine*) 14 15)]]
   :cols        [(breakout-col (venues-col :price))
                 (aggregate-col :stddev (venues-col :category_id))]
   :native_form true}
  (->> (data/run-query venues
         (ql/aggregation (ql/stddev $category_id))
         (ql/breakout $price)
         (ql/order-by (ql/desc (ql/aggregate-field 0))))
       booleanize-native-form
       :data (format-rows-by [int (comp int math/round)])))
