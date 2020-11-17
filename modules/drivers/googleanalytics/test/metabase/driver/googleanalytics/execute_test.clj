(ns metabase.driver.googleanalytics.execute-test
  (:require [clojure.test :refer :all]
            [metabase.driver.googleanalytics.execute :as ga.execute])
  (:import com.google.api.services.analytics.model.GaData$ColumnHeaders))

(defn- column-name->getter [column-name]
  (#'ga.execute/header->getter-fn (doto (GaData$ColumnHeaders.)
                                    (.setName column-name))))

(deftest parse-temporal-result-values-test
  (testing "day (int)"
    (is (= 10
           ((column-name->getter "ga:day") "10"))))
  (testing "day of week (int)"
    (is (= 2
           ((column-name->getter "ga:dayOfWeek") "1"))))
  (testing "hour (int)"
    (is (= 5
           ((column-name->getter "ga:hour") "05"))))
  (testing "minute (int)"
    (is (= 26
           ((column-name->getter "ga:minute") "26"))))
  (testing "month (int)"
    (is (= 1
           ((column-name->getter "ga:month") "01"))))
  (testing "week (int)"
    (is (= 3
           ((column-name->getter "ga:week") "3"))))
  (testing "year (int)"
    (is (= 2020
           ((column-name->getter "ga:year") "2020"))))
  (testing "date (`yyyyMMdd`)"
    (is (= #t "2020-01-10"
           ((column-name->getter "ga:date") "20200110"))))
  (testing "date hour (`yyyyMMddHH`)"
    (is (= #t "2020-01-10T11:00:00"
           ((column-name->getter "ga:dateHour") "2020011011"))))
  (testing "date hour minute (`yyyyMMddHHmm`)"
    (is (= #t "2020-01-10T11:25:00"
           ((column-name->getter "ga:dateHourMinute") "202001101125"))))
  (testing "year weeks"
    (testing "ISO year weeks (#9244)"
      (let [f (column-name->getter "ga:isoYearIsoWeek")]
        (is (= #t "2018-12-31"
               (f "201901")))
        (is (= #t "2019-12-09"
               (f "201950")))))
    (testing "non-ISO year weeks"
      (let [f (column-name->getter "ga:yearWeek")]
        (is (= #t "2018-12-30"
               (f "201901")))
        (is (= #t "2019-12-08"
               (f "201950"))))))
  (testing "year month (`yyyyMM`) (#11489)"
    (is (= #t "2020-01-01"
           ((column-name->getter "ga:yearMonth") "202001")))))
