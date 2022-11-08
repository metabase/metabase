(ns metabase.pulse.render.datetime-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.pulse.render.datetime :as datetime]))

(def ^:private now "2020-07-16T18:04:00Z[UTC]")

(defn- format-temporal-string-pair
  [unit datetime-str-1 datetime-str-2]
  (t/with-clock (t/mock-clock (t/zoned-date-time now) (t/zone-id "UTC"))
    (datetime/format-temporal-string-pair "UTC" [datetime-str-1 datetime-str-2] {:unit unit})))

;; I don't know what exactly this is used for but we should at least make sure it's working correctly, see (#10326)
(deftest format-temporal-string-pair-test
  (testing "check that we can render relative timestamps for the various units we support"
    (is (= ["Yesterday" "Previous day"]
           (format-temporal-string-pair :day "2020-07-15T18:04:00Z" nil)))
    (is (= ["Today" "Previous day"]
           (format-temporal-string-pair :day now nil)))
    (is (= ["Saturday, July 18, 2020" "Monday, July 20, 2020"]
           (format-temporal-string-pair :day "2020-07-18T18:04:00Z" "2020-07-20T18:04:00Z")))
    (is (= ["Last week" "Previous week"]
           (format-temporal-string-pair :week "2020-07-09T18:04:00Z" nil)))
    (is (= ["This week" "Previous week"]
           (format-temporal-string-pair :week now nil)))
    (is (= ["Week 5 - 2020" "Week 13 - 2020"]
           (format-temporal-string-pair :week "2020-02-01T18:04:00Z" "2020-03-25T18:04:00Z")))
    (is (= ["This month" "Previous month"]
           (format-temporal-string-pair :month "2020-07-16T18:04:00Z" nil)))
    (is (= ["This month" "Previous month"]
           (format-temporal-string-pair :month now nil)))
    (is (= ["July, 2021" "July, 2022"]
           (format-temporal-string-pair :month "2021-07-16T18:04:00Z" "2022-07-16T18:04:00Z")))
    (is (= ["Last quarter" "Previous quarter"]
           (format-temporal-string-pair :quarter "2020-05-16T18:04:00Z" nil)))
    (is (= ["This quarter" "Previous quarter"]
           (format-temporal-string-pair :quarter now nil)))
    (is (= ["Q3 - 2018" "Q3 - 2019"]
           (format-temporal-string-pair :quarter "2018-07-16T18:04:00Z" "2019-07-16T18:04:00Z")))
    (is (= ["Last year" "Previous year"]
           (format-temporal-string-pair :year "2019-07-16T18:04:00Z" nil)))
    (is (= ["This year" "Previous year"]
           (format-temporal-string-pair :year now nil)))
    (is (= ["2018" "2021"]
           (format-temporal-string-pair :year "2018-07-16T18:04:00Z" "2021-07-16T18:04:00Z")))))

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
