(ns metabase.pulse.render.datetime-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.render.datetime :as datetime]))

(def ^:private now "2020-07-16T18:04:00Z[UTC]")

;; I don't know what exactly this is used for but we should at least make sure it's working correctly, see (#10326)

(deftest format-temporal-str-test
  (testing "Null values do not blow up"
    (is (= ""
           (datetime/format-temporal-str "UTC" nil :now))))
  (testing "Temporal Units are formatted"
    (testing :minute
      (is (= "July, 2020, 6:04 PM"
             (datetime/format-temporal-str "UTC" now {:unit :minute}))))
    (testing :hour
      (is (= "July, 2020, 6 PM"
             (datetime/format-temporal-str "UTC" now {:unit :hour}))))
    (testing :day
      (is (= "Thursday, July 16, 2020"
             (datetime/format-temporal-str "UTC" now {:unit :day}))))
    (testing :week
      (is (= "Week 29 - 2020"
             (datetime/format-temporal-str "UTC" now {:unit :week}))))
    (testing :month
      (is (= "July, 2020"
             (datetime/format-temporal-str "UTC" now {:unit :month}))))
    (testing :quarter
      (is (= "Q3 - 2020"
             (datetime/format-temporal-str "UTC" now {:unit :quarter}))))
    (testing :year
      (is (= "2020"
             (datetime/format-temporal-str "UTC" now {:unit :year})))))
  (testing "x-of-y Temporal Units are formatted"
    (testing :minute-of-hour
      (is (= "1st"
             (datetime/format-temporal-str "UTC" "1" {:unit :minute-of-hour}))))
    (testing :day-of-month
      (is (= "2nd"
             (datetime/format-temporal-str "UTC" "2" {:unit :day-of-month}))))
    (testing :day-of-year
      (is (= "203rd"
             (datetime/format-temporal-str "UTC" "203" {:unit :day-of-year}))))
    (testing :week-of-year
      (is (= "44th"
             (datetime/format-temporal-str "UTC" "44" {:unit :week-of-year}))))
    (testing :day-of-week
      (is (= "Thursday"
             (datetime/format-temporal-str "UTC" "4" {:unit :day-of-week}))))
    (testing :month-of-year
      (is (= "May"
             (datetime/format-temporal-str "UTC" "5" {:unit :month-of-year}))))
    (testing :quarter-of-year
      (is (= "Q3"
             (datetime/format-temporal-str "UTC" "3" {:unit :quarter-of-year}))))
    (testing :hour-of-day
      (is (= "4 AM"
             (datetime/format-temporal-str "UTC" "4" {:unit :hour-of-day})))))
  (testing "Can render time types (#15146)"
    (is (= "08:05:06"
           (datetime/format-temporal-str "UTC" "08:05:06Z"
                                         {:effective_type :type/Time})))))
