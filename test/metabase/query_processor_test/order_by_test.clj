(ns metabase.query-processor-test.order-by-test
  "Tests for the `:order-by` clause."
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [test :as mt]]))

(deftest order-by-test
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

(deftest order-by-aggregate-fields-test
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
                  :order-by    [[:asc [:aggregation 0]]]})))))

    (testing :sum
      (is (= [[2 2855]
              [1 1211]
              [3  615]
              [4  369]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:sum $id]]
                  :breakout    [$price]
                  :order-by    [[:desc [:aggregation 0]]]})))))


    (testing :distinct
      (is (= [[4  6]
              [3 13]
              [1 22]
              [2 59]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:aggregation [[:distinct $id]]
                  :breakout    [$price]
                  :order-by    [[:asc [:aggregation 0]]]})))))

    (testing :avg
      (let [driver-floors-average? (#{:h2 :redshift :sqlserver} driver/*driver*)]
        (is (= [[3 22.0]
                [2 (if driver-floors-average? 28.0 28.3)]
                [1 (if driver-floors-average? 32.0 32.8)]
                [4 (if driver-floors-average? 53.0 53.5)]]
               (mt/formatted-rows [int 1.0]
                 (mt/run-mbql-query venues
                   {:aggregation [[:avg $category_id]]
                    :breakout    [$price]
                    :order-by    [[:asc [:aggregation 0]]]})))))))

  (testing :stddev
    (mt/test-drivers (mt/normal-drivers-with-feature :standard-deviation-aggregations)
      ;; standard deviation calculations are always NOT EXACT (normal behavior) so round results to nearest whole
      ;; number.
      (is (= [[3 25.0]
              [1 24.0]
              [2 21.0]
              [4 14.0]]
             (mt/formatted-rows [int 0.0]
               (mt/run-mbql-query venues
                 {:aggregation [[:stddev $category_id]]
                  :breakout    [$price]
                  :order-by    [[:desc [:aggregation 0]]]})))))))
