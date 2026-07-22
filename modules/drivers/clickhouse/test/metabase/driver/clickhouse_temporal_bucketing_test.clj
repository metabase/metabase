(ns ^:mb/driver-tests metabase.driver.clickhouse-temporal-bucketing-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.driver.clickhouse-temporal-bucketing-test]}
                                                            metabase.test.data/run-mbql-query {:namespaces [metabase.driver.clickhouse-temporal-bucketing-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.core :as qp]
   [metabase.test :as mt]))

(mt/defdataset temporal_bucketing_db
  [["temporal_bucketing_server_tz"
    [{:field-name "start_of_year", :base-type :type/DateTime}
     {:field-name "mid_of_year", :base-type :type/DateTime}
     {:field-name "end_of_year", :base-type :type/DateTime}]
    [[#t "2022-01-01 00:00:00" #t "2022-06-20 06:32:54" #t "2022-12-31 23:59:59"]]]
   ["temporal_bucketing_column_tz"
    [{:field-name "start_of_year", :base-type {:native "DateTime('America/Los_Angeles')"}}
     {:field-name "mid_of_year", :base-type {:native "DateTime('America/Los_Angeles')"}}
     {:field-name "end_of_year", :base-type {:native "DateTime('America/Los_Angeles')"}}]
    [[#t "2022-01-01 00:00:00[America/Los_Angeles]" #t "2022-06-20 06:32:54[America/Los_Angeles]" #t "2022-12-31 23:59:59[America/Los_Angeles]"]]]])

;; See temporal_bucketing table definition
;; Fields values are (both in server and column timezones):
;; start_of_year == '2022-01-01 00:00:00'
;; mid_of_year   == '2022-06-20 06:32:54'
;; end_of_year   == '2022-12-31 23:59:59'
(deftest clickhouse-temporal-bucketing-server-tz
  (mt/test-driver :clickhouse
    (mt/dataset temporal_bucketing_db
      (defn- start-of-year! [unit]
        (->> {:breakout [[:field %start_of_year {:temporal-unit unit}]]}
             (mt/run-mbql-query temporal_bucketing_server_tz)
             mt/rows))
      (defn- mid-year! [unit]
        (->> {:breakout [[:field %mid_of_year {:temporal-unit unit}]]}
             (mt/run-mbql-query temporal_bucketing_server_tz)
             mt/rows))
      (defn- end-of-year! [unit]
        (->> {:breakout [[:field %end_of_year {:temporal-unit unit}]]}
             (mt/run-mbql-query temporal_bucketing_server_tz)
             mt/rows))
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
                 (end-of-year! :quarter-of-year))))))))

(deftest clickhouse-temporal-bucketing-column-tz
  (mt/test-driver :clickhouse
    (mt/dataset temporal_bucketing_db
      (defn- start-of-year! [unit]
        (->> {:breakout [[:field %start_of_year {:temporal-unit unit}]]}
             (mt/run-mbql-query temporal_bucketing_column_tz)
             mt/rows))
      (defn- mid-year! [unit]
        (->> {:breakout [[:field %mid_of_year {:temporal-unit unit}]]}
             (mt/run-mbql-query temporal_bucketing_column_tz)
             mt/rows))
      (defn- end-of-year! [unit]
        (->> {:breakout [[:field %end_of_year {:temporal-unit unit}]]}
             (mt/run-mbql-query temporal_bucketing_column_tz)
             mt/rows))
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
                 (end-of-year! :quarter-of-year))))))))

(deftest clickhouse-uses-report-timezone-bucketing-source-query-test
  (mt/test-driver :clickhouse
    (mt/with-report-timezone-id! "Europe/London"
      (let [mp           (mt/metadata-provider)]
        (mt/with-temp [:model/Card card {:dataset_query (->> (mt/id :orders)
                                                             (lib.metadata/table mp)
                                                             (lib/query mp))}]
          (let [base       (lib/query mp (lib.metadata/card mp (:id card)))
                created-at (m/find-first #(= {:table-id (mt/id :orders) :name "created_at"}
                                             (select-keys % [:table-id :name]))
                                         (lib/breakoutable-columns base))]
            (are [bucket start-date end-date expected]
                 (= expected
                    (-> base
                        (lib/filter (lib/between created-at start-date end-date))
                        (lib/aggregate (lib/count))
                        (lib/breakout (lib/with-temporal-bucket created-at bucket))
                        (qp/process-query)
                        (mt/rows)))
              :day "2016-07-26" "2016-07-31"
              [["2016-07-26T00:00:00+01:00" 1]
               ["2016-07-27T00:00:00+01:00" 3]
               ["2016-07-28T00:00:00+01:00" 2]
               ["2016-07-29T00:00:00+01:00" 4]
               ["2016-07-30T00:00:00+01:00" 7]
               ["2016-07-31T00:00:00+01:00" 3]]

              :week "2016-09-04" "2016-10-01"
              [["2016-09-04T00:00:00+01:00" 20]
               ["2016-09-11T00:00:00+01:00" 23]
               ["2016-09-18T00:00:00+01:00" 18]
               ["2016-09-25T00:00:00+01:00" 32]])))))))
