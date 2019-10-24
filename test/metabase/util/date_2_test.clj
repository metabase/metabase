(ns metabase.util.date-2-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.util.date-2 :as u.date]))

(deftest date-extract-test
  (is (= 1
         (u.date/extract :hour-of-day (t/offset-date-time 2019 10 24 1))))
  (is (= 1
         (u.date/extract :hour-of-day (t/offset-date-time 2019 10 24 1) "UTC")))
  (is (= 18
         (u.date/extract :hour-of-day (t/offset-date-time 2019 10 24 1) "US/Pacific")))
  (is (= 1
         (u.date/extract :hour-of-day (t/local-date-time 2019 10 24 1))))
  (is (= 1
         (u.date/extract :hour-of-day (t/local-date-time 2019 10 24 1) "UTC")))
  ;; TODO - not sure if this is right ??
  (is (= 8
         (u.date/extract :hour-of-day (t/local-date-time 2019 10 24 1) "US/Pacific"))))
