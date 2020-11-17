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
    (is (= ["Jul 18, 2020" "Jul 20, 2020"]
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
    (is (= ["July 2021" "July 2022"]
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
    (testing "No special formatting for year? :shrug:"
      (is (= ["2018-07-16T18:04:00Z" "2021-07-16T18:04:00Z"]
             (format-temporal-string-pair :year "2018-07-16T18:04:00Z" "2021-07-16T18:04:00Z"))))))

(deftest format-temporal-str-test
  (testing "Null values do not blow up"
    (is (= ""
           (datetime/format-temporal-str "UTC" nil :now))))
  (testing "Not-null values work"
    (is (= "Jul 16, 2020"
           (datetime/format-temporal-str "UTC" now :day)))))