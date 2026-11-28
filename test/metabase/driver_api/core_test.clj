(ns metabase.driver-api.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver-api.core :as driver-api]
   [metabase.test :as mt]))

(deftest date-extract-week-of-year-test
  (testing "a date's week of year is the week queries group it into"
    (mt/with-temporary-setting-values [start-of-week :sunday]
      (is (= [52 52 1]
             (map #(driver-api/date-extract % :week-of-year)
                  [#t "2018-12-30" #t "2019-01-01" #t "2019-01-06"]))))))
