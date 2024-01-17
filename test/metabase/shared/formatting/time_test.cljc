(ns metabase.shared.formatting.time-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest]]
   [metabase.shared.formatting.time :as time]))

(deftest format-time-test
  ;; some JVMs use non-breaking space (nbsp) in their formatted strings
  ;; which can cause confusing looking test failures.
  ;; A string replace normalizes on the ascii space char
  (are [exp input] (= exp (str/replace (time/format-time input) \u202f \space))
    "1:02 AM"  "01:02:03.456+07:00"
    "1:02 AM"  "01:02"
    "10:29 PM" "22:29:59.26816+01:00"
    "10:29 PM" "22:29:59.412459+01:00"
    "7:14 PM"  "19:14:42.926221+01:00"
    "7:14 PM"  "19:14:42.13202+01:00"
    "1:38 PM"  "13:38:58.987352+01:00"
    "1:38 PM"  "13:38:58.001001+01:00"
    "5:01 PM"  "17:01:23+01:00"))

(deftest format-time-with-unit
  (are [exp input opts] (= exp (time/format-time-with-unit input (merge {:unit "hour-of-day"} opts)))
    "8:00 AM"  8  nil
    ;; 24-hour
    "08:00"    8  {:time-style "HH:mm"}
    "18:00"    18 {:time-style "HH:mm"}
    "18:00:00" 18 {:time-style "HH:mm" :time-enabled "seconds"}))
