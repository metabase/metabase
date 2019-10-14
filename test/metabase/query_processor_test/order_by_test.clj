(ns metabase.query-processor-test.order-by-test
  "Tests for the `:order-by` clause."
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor-test :as qp.test :refer :all]]
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

(deftest order-by-average-aggregation-test
  (datasets/test-drivers qp.test/non-timeseries-drivers
    (let [{:keys [rows cols]}    (qp.test/rows-and-cols
                                   (qp.test/format-rows-by [int 1.0]
                                     (data/run-mbql-query venues
                                       {:aggregation [[:avg $category_id]]
                                        :breakout    [$price]
                                        :order-by    [[:asc [:aggregation 0]]]})))
          driver-floors-average? (#{:h2 :redshift :sqlserver} driver/*driver*)]
      (is (= [[3 22.0]
              [2 (if driver-floors-average? 28.0 28.3)]
              [1 (if driver-floors-average? 32.0 32.8)]
              [4 (if driver-floors-average? 53.0 53.5)]]
             rows))
      (is (= [(qp.test/breakout-col :venues :price)
              (qp.test/aggregate-col :avg :venues :category_id)]
             cols)))))

(deftest order-by-standard-deviation-aggregation-test
  (datasets/test-drivers (qp.test/non-timeseries-drivers-with-feature :standard-deviation-aggregations)
    (let [{:keys [rows cols]} (qp.test/rows-and-cols
                                (qp.test/format-rows-by [int 0.0]
                                  (data/run-mbql-query venues
                                    {:aggregation [[:stddev $category_id]]
                                     :breakout    [$price]
                                     :order-by    [[:desc [:aggregation 0]]]})))]
      ;; standard deviation calculations are always NOT EXACT (normal behavior) so round results to nearest whole
      ;; number.
      (is (= [[3 (if (= driver/*driver* :mysql) 25.0 26.0)]
              [1 24.0]
              [2 21.0]
              [4 (if (= driver/*driver* :mysql) 14.0 15.0)]]
             rows))
      (is (= [(qp.test/breakout-col :venues :price)
              (qp.test/aggregate-col :stddev (qp.test/col :venues :category_id))]
             cols)))))
