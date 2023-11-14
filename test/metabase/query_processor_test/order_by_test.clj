(ns metabase.query-processor-test.order-by-test
  "Tests for the `:order-by` clause."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]))

(deftest ^:parallel order-by-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= [[1 12 375]
            [1  9 139]
            [1  1  72]
            [2 15 129]
            [2 12 471]
            [2 11 325]
            [2  9 590]
            [2  9 833]
            [2  8 380]
            [2  5 719]]
           (mt/formatted-rows [int int int]
             (mt/run-mbql-query checkins
               {:fields   [$venue_id $user_id $id]
                :order-by [[:asc $venue_id]
                           [:desc $user_id]
                           [:asc $id]]
                :limit    10}))))))

(deftest ^:parallel order-by-aggregate-fields-test
  (mt/test-drivers (mt/normal-drivers)
    (testing :count
      (is (= [[4  6]
              [3 13]
              [1 22]
              [2 59]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:count]]
                  :breakout    [$price]
                  :order-by    [[:asc [:aggregation 0]]]})))))))

(deftest ^:parallel order-by-aggregate-fields-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing :sum
      (is (= [[2 2855]
              [1 1211]
              [3  615]
              [4  369]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum $id]]
                  :breakout    [$price]
                  :order-by    [[:desc [:aggregation 0]]]})))))))

(deftest ^:parallel order-by-aggregate-fields-test-3
  (mt/test-drivers (mt/normal-drivers)
    (testing :distinct
      (is (= [[4  6]
              [3 13]
              [1 22]
              [2 59]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:distinct $id]]
                  :breakout    [$price]
                  :order-by    [[:asc [:aggregation 0]]]})))))))

(deftest ^:parallel order-by-aggregate-fields-test-4
  (mt/test-drivers (mt/normal-drivers)
    (testing :avg
      (let [driver-floors-average? (#{:redshift :sqlserver} driver/*driver*)]
        (is (= [[3 22.0]
                [2 (if driver-floors-average? 28.0 28.3)]
                [1 (if driver-floors-average? 32.0 32.8)]
                [4 (if driver-floors-average? 53.0 53.5)]]
               (mt/formatted-rows [int 1.0]
                 (mt/run-mbql-query venues
                   {:aggregation [[:avg $category_id]]
                    :breakout    [$price]
                    :order-by    [[:asc [:aggregation 0]]]}))))))))

(deftest ^:parallel order-by-aggregate-fields-test-5
  (mt/test-drivers (mt/normal-drivers-with-feature :standard-deviation-aggregations)
    (testing :stddev
      ;; standard deviation calculations are always NOT EXACT (normal behavior) so just test that the results are in a
      ;; certain RANGE.
      (letfn [(row-schema [price lower-bound upper-bound]
                [:tuple
                 [:= price]
                 [:fn
                  {:error/message (format "%.1f < value < %.1f" lower-bound upper-bound)}
                  #(< lower-bound % upper-bound)]])]
        (is (malli= [:tuple
                     (row-schema 3 23.0 27.0)
                     (row-schema 1 22.0 26.0)
                     (row-schema 2 19.0 23.0)
                     (row-schema 4 12.0 16.0)]
                    (mt/formatted-rows [int 1.0]
                      (mt/run-mbql-query venues
                        {:aggregation [[:stddev $category_id]]
                         :breakout    [$price]
                         :order-by    [[:desc [:aggregation 0]]]}))))))))
