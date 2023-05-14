(ns metabase.lib.temporal-bucket-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]))

(deftest ^:parallel describe-temporal-interval-test
  (doseq [unit [:day nil]]
    (testing unit
      (are [n expected] (= expected
                           (lib.temporal-bucket/describe-temporal-interval n unit))
        -2 "Previous 2 Days"
        -1 "Yesterday"
        0  "Today"
        1  "Tomorrow"
        2  "Next 2 Days")))
  (testing :month
    (are [n expected] (= expected
                         (lib.temporal-bucket/describe-temporal-interval n :month))
      -2 "Previous 2 Months"
      -1 "Previous Month"
      0  "This Month"
      1  "Next Month"
      2  "Next 2 Months"))
  (testing "unknown unit"
    (are [n expected] (= expected
                         (lib.temporal-bucket/describe-temporal-interval n :century))
      -2 "Previous 2 Century"
      -1 "Previous Century"
      0  "This Century"
      1  "Next Century"
      2  "Next 2 Century")))

(deftest ^:parallel describe-relative-datetime-test
  (doseq [unit [:day nil]]
    (testing unit
      (are [n expected] (= expected
                           (lib.temporal-bucket/describe-relative-datetime n unit))
        -2 "2 days ago"
        -1 "1 day ago"
        0  "Now"
        1  "1 day from now"
        2  "2 days from now")))
  (testing "unknown unit"
    (are [n expected] (= expected
                         (lib.temporal-bucket/describe-relative-datetime n :century))
      -2 "2 century ago"
      -1 "1 century ago"
      0  "Now"
      1  "1 century from now"
      2  "2 century from now")))

(deftest ^:parallel describe-temporal-unit-test
  (is (= ""
         (lib.temporal-bucket/describe-temporal-unit nil)))
  (is (= "Day of month"
         (lib.temporal-bucket/describe-temporal-unit :day-of-month)))
  (is (= "Day"
         (lib.temporal-bucket/describe-temporal-unit :day)
         (lib.temporal-bucket/describe-temporal-unit 1 :day)
         (lib.temporal-bucket/describe-temporal-unit -1 :day)))
  (is (= "Days"
         (lib.temporal-bucket/describe-temporal-unit 2 :day)))
  (is (= "Unknown unit"
         (lib.temporal-bucket/describe-temporal-unit :unknown-unit)
         (lib.temporal-bucket/describe-temporal-unit 2 :unknown-unit))))
