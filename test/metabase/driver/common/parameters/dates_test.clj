(ns metabase.driver.common.parameters.dates-test
  (:require
   [clojure.test :refer :all]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters.dates :as params.dates]))

(deftest ^:parallel date-string->filter-test
  (testing "year and month"
    (is (= [:between
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"
            "2019-04-30"]
           (params.dates/date-string->filter "2019-04" [:field "field" {:base-type :type/DateTime}]))))
  (testing "quarter year"
    (is (= [:between
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"
            "2019-06-30"]
           (params.dates/date-string->filter "Q2-2019" [:field "field" {:base-type :type/DateTime}]))))
  (testing "single day"
    (is (= [:=
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"]
           (params.dates/date-string->filter "2019-04-01" [:field "field" {:base-type :type/DateTime}]))))
  (testing "single minute"
    (is (= [:=
            [:field "field" {:base-type :type/DateTime, :temporal-unit :minute}]
            "2019-04-01T09:33:00"]
           (params.dates/date-string->filter "2019-04-01T09:33:00" [:field "field" {:base-type :type/DateTime}]))))
  (testing "day range"
    (is (= [:between
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"
            "2019-04-03"]
           (params.dates/date-string->filter "2019-04-01~2019-04-03" [:field "field" {:base-type :type/DateTime}]))))
  (testing "datetime range"
    (is (= [:between
            [:field "field" {:base-type :type/DateTime, :temporal-unit :default}]
            "2019-04-01T12:30:00"
            "2019-04-03T16:30:00"]
           (params.dates/date-string->filter "2019-04-01T12:30~2019-04-03T16:30" [:field "field" {:base-type :type/DateTime}]))))
  (testing "after day"
    (is (= [:>
            [:field "field" {:base-type :type/DateTime, :temporal-unit :day}]
            "2019-04-01"]
           (params.dates/date-string->filter "2019-04-01~" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (past) exclusive"
    (is (= [:time-interval
            [:field "field" {:base-type :type/DateTime}]
            -3
            :day
            {:include-current false}]
           (params.dates/date-string->filter "past3days" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (past) inclusive"
    (is (= [:time-interval [:field "field" {:base-type :type/DateTime}]
            -3
            :day
            {:include-current true}]
           (params.dates/date-string->filter "past3days~" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (next) exclusive"
    (is (= [:time-interval [:field "field" {:base-type :type/DateTime}]
            3
            :day
            {:include-current false}]
           (params.dates/date-string->filter "next3days" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (next) inclusive"
    (is (= [:time-interval [:field "field" {:base-type :type/DateTime}]
            3
            :day
            {:include-current true}]
           (params.dates/date-string->filter "next3days~" [:field "field" {:base-type :type/DateTime}]))))
  (testing "quarters (#21083)"
    (is (= [:time-interval [:field "field" {:base-type :type/DateTime}] -30 :quarter {:include-current false}]
           (params.dates/date-string->filter "past30quarters" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (past) with starting from "
    (is (= [:relative-time-interval
            [:field "field" {:base-type :type/DateTime}]
            -3
            :day
            -3
            :year]
           (params.dates/date-string->filter "past3days-from-3years" [:field "field" {:base-type :type/DateTime}]))))
  (testing "relative (next) with starting from"
    (is (= [:relative-time-interval
            [:field "field" {:base-type :type/DateTime}]
            7
            :hour
            13
            :month]
           (params.dates/date-string->filter "next7hours-from-13months" [:field "field" {:base-type :type/DateTime}]))))
  (testing "exclusions"
    (testing "hours"
      (is (= [:!=
              [:field "field" {:base-type :type/DateTime, :temporal-unit :hour-of-day}]
              0]
             (params.dates/date-string->filter "exclude-hours-0" [:field "field" {:base-type :type/DateTime}])))
      (is (= [:!=
              [:field "field" {:base-type :type/DateTime, :temporal-unit :hour-of-day}]
              0
              23]
             (params.dates/date-string->filter "exclude-hours-0-23" [:field "field" {:base-type :type/DateTime}])))
      (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-hours-\""
                   (params.dates/date-string->filter "exclude-hours-" [:field "field" {:base-type :type/DateTime}])))
      (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-hours-24-3\""
                   (params.dates/date-string->filter "exclude-hours-24-3" [:field "field" {:base-type :type/DateTime}]))))
    (testing "quarters"
      (is (= [:!=
              [:field "field" {:base-type :type/DateTime, :temporal-unit :quarter-of-year}]
              1]
             (params.dates/date-string->filter "exclude-quarters-1" [:field "field" {:base-type :type/DateTime}])))
      (is (= [:!=
              [:field "field" {:base-type :type/DateTime, :temporal-unit :quarter-of-year}]
              2
              3
              4]
             (params.dates/date-string->filter "exclude-quarters-2-3-4" [:field "field" {:base-type :type/DateTime}])))
      (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-quarters-Q1\""
                   (params.dates/date-string->filter "exclude-quarters-Q1" [:field "field" {:base-type :type/DateTime}]))))
    (testing "days (with default start-of-week = Sunday: Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6, Sat=7)"
      (is (= [:!=
              [:field "field" {:base-type :type/DateTime, :temporal-unit :day-of-week}]
              6
              3]
             (params.dates/date-string->filter "exclude-days-Fri-Tue" [:field "field" {:base-type :type/DateTime}])))
      (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-days-Friday\""
                   (params.dates/date-string->filter "exclude-days-Friday" [:field "field" {:base-type :type/DateTime}]))))
    (testing "months"
      (is (= [:!=
              [:field "field" {:base-type :type/DateTime, :temporal-unit :month-of-year}]
              12
              4
              9]
             (params.dates/date-string->filter "exclude-months-Dec-Apr-Sep" [:field "field" {:base-type :type/DateTime}])))
      (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-months-April\""
                   (params.dates/date-string->filter "exclude-months-April" [:field "field" {:base-type :type/DateTime}]))))
    (testing "minutes"
      (is (thrown? clojure.lang.ExceptionInfo #"Don't know how to parse date string \"exclude-minutes-15-30\""
                   (params.dates/date-string->filter "exclude-minutes-15-30" [:field "field" {:base-type :type/DateTime}]))))))
