(ns ^:mb/driver-tests metabase.driver.clickhouse-temporal-bucketing-test
  #_{:clj-kondo/ignore [:unsorted-required-namespaces]}
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.test-util :as qp.test]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.clickhouse :as ctd]))

;; See temporal_bucketing table definition
;; Fields values are (both in server and column timezones):
;; start_of_year == '2022-01-01 00:00:00'
;; mid_of_year   == '2022-06-20 06:32:54'
;; end_of_year   == '2022-12-31 23:59:59'
(deftest clickhouse-temporal-bucketing-server-tz
  (mt/test-driver
    :clickhouse
    (defn- start-of-year! [unit]
      (qp.test/rows
       (ctd/do-with-test-db!
        (fn [db]
          (data/with-db db
            (data/run-mbql-query
              temporal_bucketing_server_tz
              {:breakout [[:field %start_of_year {:temporal-unit unit}]]}))))))
    (defn- mid-year! [unit]
      (qp.test/rows
       (ctd/do-with-test-db!
        (fn [db]
          (data/with-db db
            (data/run-mbql-query
              temporal_bucketing_server_tz
              {:breakout [[:field %mid_of_year {:temporal-unit unit}]]}))))))
    (defn- end-of-year! [unit]
      (qp.test/rows
       (ctd/do-with-test-db!
        (fn [db]
          (data/with-db db
            (data/run-mbql-query
              temporal_bucketing_server_tz
              {:breakout [[:field %end_of_year {:temporal-unit unit}]]}))))))
    (testing "truncate to"
      (testing "minute"
        (is (= [["2022-06-20T06:32:00Z"]]
               (mid-year! :minute))))
      (testing "hour"
        (is (= [["2022-06-20T06:00:00Z"]]
               (mid-year! :hour))))
      (testing "day"
        (is (= [["2022-06-20T00:00:00Z"]]
               (mid-year! :day))))
      (testing "month"
        (is (= [["2022-06-01T00:00:00Z"]]
               (mid-year! :month))))
      (testing "quarter"
        (is (= [["2022-04-01T00:00:00Z"]]
               (mid-year! :quarter))))
      (testing "year"
        (is (= [["2022-01-01T00:00:00Z"]]
               (mid-year! :year)))))
    (testing "extract"
      (testing "minute of hour"
        (is (= [[0]]
               (start-of-year! :minute-of-hour)))
        (is (= [[32]]
               (mid-year! :minute-of-hour)))
        (is (= [[59]]
               (end-of-year! :minute-of-hour))))
      (testing "hour of day"
        (is (= [[0]]
               (start-of-year! :hour-of-day)))
        (is (= [[6]]
               (mid-year! :hour-of-day)))
        (is (= [[23]]
               (end-of-year! :hour-of-day))))
      (testing "day of month"
        (is (= [[1]]
               (start-of-year! :day-of-month)))
        (is (= [[20]]
               (mid-year! :day-of-month)))
        (is (= [[31]]
               (end-of-year! :day-of-month))))
      (testing "day of year"
        (is (= [[1]]
               (start-of-year! :day-of-year)))
        (is (= [[171]]
               (mid-year! :day-of-year)))
        (is (= [[365]]
               (end-of-year! :day-of-year))))
      (testing "month of year"
        (is (= [[1]]
               (start-of-year! :month-of-year)))
        (is (= [[6]]
               (mid-year! :month-of-year)))
        (is (= [[12]]
               (end-of-year! :month-of-year))))
      (testing "quarter of year"
        (is (= [[1]]
               (start-of-year! :quarter-of-year)))
        (is (= [[2]]
               (mid-year! :quarter-of-year)))
        (is (= [[4]]
               (end-of-year! :quarter-of-year)))))))

(deftest clickhouse-temporal-bucketing-column-tz
  (mt/test-driver
    :clickhouse
    (defn- start-of-year! [unit]
      (qp.test/rows
       (ctd/do-with-test-db!
        (fn [db]
          (data/with-db db
            (data/run-mbql-query
              temporal_bucketing_column_tz
              {:breakout [[:field %start_of_year {:temporal-unit unit}]]}))))))
    (defn- mid-year! [unit]
      (qp.test/rows
       (ctd/do-with-test-db!
        (fn [db]
          (data/with-db db
            (data/run-mbql-query
              temporal_bucketing_column_tz
              {:breakout [[:field %mid_of_year {:temporal-unit unit}]]}))))))
    (defn- end-of-year! [unit]
      (qp.test/rows
       (ctd/do-with-test-db!
        (fn [db]
          (data/with-db db
            (data/run-mbql-query
              temporal_bucketing_column_tz
              {:breakout [[:field %end_of_year {:temporal-unit unit}]]}))))))
    (testing "truncate to"
      (testing "minute"
        (is (= [["2022-06-20T13:32:00Z"]]
               (mid-year! :minute))))
      (testing "hour"
        (is (= [["2022-06-20T13:00:00Z"]]
               (mid-year! :hour))))
      (testing "day"
        (is (= [["2022-06-20T07:00:00Z"]]
               (mid-year! :day))))
      (testing "month"
        (is (= [["2022-06-01T00:00:00Z"]]
               (mid-year! :month))))
      (testing "quarter"
        (is (= [["2022-04-01T00:00:00Z"]]
               (mid-year! :quarter))))
      (testing "year"
        (is (= [["2022-01-01T00:00:00Z"]]
               (mid-year! :year)))))
    (testing "extract"
      (testing "minute of hour"
        (is (= [[0]]
               (start-of-year! :minute-of-hour)))
        (is (= [[32]]
               (mid-year! :minute-of-hour)))
        (is (= [[59]]
               (end-of-year! :minute-of-hour))))
      (testing "hour of day"
        (is (= [[0]]
               (start-of-year! :hour-of-day)))
        (is (= [[6]]
               (mid-year! :hour-of-day)))
        (is (= [[23]]
               (end-of-year! :hour-of-day))))
      (testing "day of month"
        (is (= [[1]]
               (start-of-year! :day-of-month)))
        (is (= [[20]]
               (mid-year! :day-of-month)))
        (is (= [[31]]
               (end-of-year! :day-of-month))))
      (testing "day of year"
        (is (= [[1]]
               (start-of-year! :day-of-year)))
        (is (= [[171]]
               (mid-year! :day-of-year)))
        (is (= [[365]]
               (end-of-year! :day-of-year))))
      (testing "month of year"
        (is (= [[1]]
               (start-of-year! :month-of-year)))
        (is (= [[6]]
               (mid-year! :month-of-year)))
        (is (= [[12]]
               (end-of-year! :month-of-year))))
      (testing "quarter of year"
        (is (= [[1]]
               (start-of-year! :quarter-of-year)))
        (is (= [[2]]
               (mid-year! :quarter-of-year)))
        (is (= [[4]]
               (end-of-year! :quarter-of-year)))))))
