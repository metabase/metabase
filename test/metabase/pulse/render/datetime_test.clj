(ns metabase.pulse.render.datetime-test
  (:require [clojure.test :refer :all]
            [metabase.pulse.render.datetime :as datetime]
            [metabase.shared.models.visualization-settings :as mb.viz]))

(def ^:private now "2020-07-16T18:04:00Z[UTC]")

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
                                         {:effective_type :type/Time}))))
  (testing "Can render abbreviated date styles when no other style data is explicitly set. (#27020)"
    (is (= "Jul 16, 2020"
           (datetime/format-temporal-str "UTC" now
                                         {:field_ref      [:column_name "created_at"]
                                          :effective_type :type/Date}
                                         {::mb.viz/column-settings
                                          {{::mb.viz/column-name "created_at"}
                                           {::mb.viz/date-abbreviate true}}}))))
  (testing "Can render datetimes with Day of Week option. (#27105)"
    (is (= "Thursday, July 16, 2020"
           (datetime/format-temporal-str "UTC" now
                                         {:field_ref      [:column_name "created_at"]
                                          :effective_type :type/Date}
                                         {::mb.viz/column-settings
                                          {{::mb.viz/column-name "created_at"}
                                           {::mb.viz/date-style "dddd, MMMM D, YYYY"}}})))))

(deftest format-temporal-str-column-viz-settings-test
  (testing "Written Date Formatting"
    (let [fmt (fn [col-viz]
                (datetime/format-temporal-str "UTC" now {:field_ref      [:column_name "created_at"]
                                                         :effective_type :type/Date}
                                              {::mb.viz/column-settings
                                               {{::mb.viz/column-name "created_at"} col-viz}}))]
      (doseq [[date-style normal-result abbreviated-result]
              [["MMMM D, YYYY" "July 16, 2020" "Jul 16, 2020"]
               ["D MMMM, YYYY" "16 July, 2020" "16 Jul, 2020"]
               ["dddd, MMMM D, YYYY" "Thursday, July 16, 2020" "Thu, Jul 16, 2020"]
               [nil "July 16, 2020" "Jul 16, 2020"]]]
        (testing (str "Date style: " date-style " correctly formats.")
          (is (= normal-result
                 (fmt (when date-style {::mb.viz/date-style date-style})))))
        (testing (str "Date style: " date-style " with abbreviation correctly formats.")
          (is (= abbreviated-result
                 (fmt (merge {::mb.viz/date-abbreviate true}
                             (when date-style {::mb.viz/date-style date-style}))))))))))
