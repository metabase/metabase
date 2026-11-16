(ns metabase.formatter.duration-test
  (:require
   [clojure.test :refer :all]
   [metabase.formatter.duration :as duration]
   [metabase.test :as mt]))

(defn- format-duration
  ([value]
   (format-duration value {}))
  ([value options]
   (format-duration value options ".,"))
  ([value options [decimal grouping]]
   (duration/format-duration value (assoc options :decimal decimal :grouping grouping))))

(deftest ^:parallel digital-style-test
  (testing "seconds format as clock by default"
    (is (= "0:00:00" (format-duration 0)))
    (is (= "0:01:12" (format-duration 72)))
    (is (= "1:02:03" (format-duration 3723))))
  (testing "hours keep counting past one day"
    (is (= "30:04:05" (format-duration 108245)))
    (is (= "1,234:05:06" (format-duration 4442706)))))

(deftest ^:parallel duration-unit-test
  (are [value unit expected] (= expected (format-duration value {:unit unit}))
    72000000000 "nanosecond"  "0:01:12"
    72000000    "microsecond" "0:01:12"
    72000       "millisecond" "0:01:12"
    62          "minute"      "1:02:00"
    1.5         "hour"        "1:30:00"
    1           "day"         "24:00:00"
    1           "week"        "168:00:00"
    72N         "second"      "0:01:12"
    72.0M       "second"      "0:01:12"))

(deftest ^:parallel duration-precision-test
  (are [value precision expected] (= expected (format-duration value {:precision precision}))
    3723.25 "minute"      "1:02"
    3723.25 "second"      "1:02:03"
    3723.25 "millisecond" "1:02:03.250"
    59.6    "second"      "0:01:00"))

(deftest ^:parallel narrow-style-test
  (are [value options expected] (= expected (format-duration value (assoc options :style "narrow")))
    3723    {}                          "1h 2m 3s"
    108245  {}                          "1d 6h 4m 5s"
    3600    {}                          "1h"
    3723.25 {:precision "millisecond"} "1h 2m 3s 250ms"
    3723.25 {:precision "minute"}      "1h 2m"
    0       {}                          "0s"
    10      {:precision "minute"}      "0m"
    0.0002  {:precision "millisecond"} "0ms"))

(deftest ^:parallel negative-value-test
  (is (= "-0:01:12" (format-duration -72)))
  (is (= "-1m 12s" (format-duration -72 {:style "narrow"})))
  (is (= "0:00:00" (format-duration -0.2))))

(deftest ^:parallel number-separators-test
  (is (= "1.234:05:06,500"
         (format-duration 4442706.5 {:precision "millisecond"} ",.")))
  (is (= "1234:05:06" (format-duration 4442706 {} ".")))
  (is (= "1 000d" (format-duration 86400000 {:style "narrow"} ", "))))

(deftest ^:parallel unknown-options-test
  (is (= "0:01:12" (format-duration 72 {:unit "second", :style "clock", :precision "hours"})))
  (is (= "0:01:12" (format-duration 72 {:unit nil, :style nil, :precision nil}))))

(deftest ^:parallel large-value-test
  (is (string? (format-duration 9.3e15)))
  (is (string? (format-duration Double/POSITIVE_INFINITY)))
  (is (string? (format-duration Long/MAX_VALUE {:unit "week", :style "narrow"}))))

(deftest narrow-digits-test
  (mt/with-user-locale "fa"
    (is (= "1d 6h 4m 5s" (format-duration 108245 {:style "narrow"})))))

(deftest ^:parallel duration-days-test
  (is (= 1.0 (duration/duration-days 86400 nil nil)))
  (is (= 1.0 (duration/duration-days 24 "hour" nil)))
  (is (= 7.0 (duration/duration-days 1 "week" nil)))
  (is (= -1.0 (duration/duration-days -86400 nil nil)))
  (testing "value is rounded to precision"
    (is (= (/ 1.0 24) (duration/duration-days 3599.5 nil "minute")))))
