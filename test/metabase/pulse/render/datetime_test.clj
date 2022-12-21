(ns metabase.pulse.render.datetime-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.pulse.render.datetime :as datetime]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [metabase.test :as mt]))

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

(deftest format-temporal-str-column-viz-settings-test
  (testing "Written Date Formatting"
    (let [fmt (fn [col-viz]
                (datetime/format-temporal-str "UTC" now {:field_ref      [:column_name "created_at"]
                                                         :effective_type :type/Date}
                                              {::mb.viz/column-settings
                                               {{::mb.viz/column-name "created_at"} col-viz}}))]
      (doseq [[ date-style normal-result abbreviated-result]
              [["MMMM D, YYYY" "July 16, 2020" "Jul 16, 2020"]
               ["D MMMM, YYYY" "16 July, 2020" "16 Jul, 2020"]
               ["dddd, MMMM D, YYYY" "Thursday, July 16, 2020" "Thu, Jul 16, 2020"] ;; Render datetimes with Day of Week option. (#27105)
               [nil "July 16, 2020" "Jul 16, 2020"]]] ;; Render abbreviated date styles when no other style data is explicitly set. (#27020)
        (testing (str "Date style: " date-style " correctly formats.")
          (is (= normal-result
                 (fmt (when date-style {::mb.viz/date-style date-style})))))
        (testing (str "Date style: " date-style " with abbreviation correctly formats.")
          (is (= abbreviated-result
                 (fmt (merge {::mb.viz/date-abbreviate true}
                             (when date-style {::mb.viz/date-style date-style})))))))))
  (testing "Numerical Date Formatting"
    (let [fmt (fn [col-viz]
                (datetime/format-temporal-str "UTC" now {:field_ref      [:column_name "created_at"]
                                                         :effective_type :type/Date}
                                              {::mb.viz/column-settings
                                               {{::mb.viz/column-name "created_at"} col-viz}}))]
      (doseq [[ date-style slash-result dash-result dot-result]
              [["M/D/YYYY" "7/16/2020" "7-16-2020" "7.16.2020"]
               ["D/M/YYYY" "16/7/2020" "16-7-2020" "16.7.2020"]
               ["YYYY/M/D" "2020/7/16" "2020-7-16" "2020.7.16"]
               [nil "July 16, 2020" "July 16, 2020" "July 16, 2020"]] ;; nil date-style does not blow up when date-separator exists
              date-separator ["/" "-" "."]]
        (testing (str "Date style: " date-style " with '" date-separator "' correctly formats.")
          (is (= (get {"/" slash-result
                       "-" dash-result
                       "." dot-result} date-separator)
                 (fmt (merge {::mb.viz/date-separator date-separator}
                             (when date-style {::mb.viz/date-style date-style})))))))
      (testing "Default date separator is '/'"
        (is (= "7/16/2020"
               (fmt {::mb.viz/date-style "M/D/YYYY"}))))))
  (testing "Custom Formatting options are respected as defaults."
    (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_style "MMMM D, YYYY"
                                                                                  :date_abbreviate true}}]
      (is (= "Jul 16, 2020"
             (datetime/format-temporal-str "UTC" now nil nil))))
    (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_style "M/DD/YYYY"
                                                                                    :date_separator "-"}}]
      (is (= "7-16-2020"
             (datetime/format-temporal-str "UTC" now nil nil))))))
