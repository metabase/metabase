(ns metabase.query-processor.middleware.format-rows-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [query-processor-test :as qp.test]
             [test :as mt]]
            [metabase.query-processor.middleware.format-rows :as format-rows]))

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/supports? [::timezone-driver :set-timezone] [_ _] true)

;; TIMEZONE FIXME
(def ^:private dbs-exempt-from-format-rows-tests
  "DBs to skip the tests below for. TIMEZONE FIXME — why are so many databases not running these tests? Most of these
  should be able to pass with a few tweaks."
  #{:oracle :mongo :redshift :presto :sparksql :snowflake})

(deftest format-rows-test
  (mt/test-drivers (mt/normal-drivers-except dbs-exempt-from-format-rows-tests)
    (mt/dataset test-data-with-time
      (testing "without report timezone"
        (is (= (if (= driver/*driver* :sqlite)
                 ;; TIMEZONE FIXME
                 [[1 "Plato Yeshua"        "2014-04-01T00:00:00Z" "08:30:00"]
                  [2 "Felipinho Asklepios" "2014-12-05T00:00:00Z" "15:15:00"]
                  [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00Z" "16:15:00"]
                  [4 "Simcha Yan"          "2014-01-01T00:00:00Z" "08:30:00"]
                  [5 "Quentin Sören"       "2014-10-03T00:00:00Z" "17:30:00"]]
                 [[1 "Plato Yeshua"        "2014-04-01T00:00:00Z" "08:30:00Z"]
                  [2 "Felipinho Asklepios" "2014-12-05T00:00:00Z" "15:15:00Z"]
                  [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00Z" "16:15:00Z"]
                  [4 "Simcha Yan"          "2014-01-01T00:00:00Z" "08:30:00Z"]
                  [5 "Quentin Sören"       "2014-10-03T00:00:00Z" "17:30:00Z"]])
               (mt/rows
                 (mt/run-mbql-query users
                   {:order-by [[:asc $id]]
                    :limit    5})))))
      (testing "with report timezone"
        (mt/with-report-timezone-id "America/Los_Angeles"
          (is (= (cond
                   (= driver/*driver* :sqlite)
                   [[1 "Plato Yeshua"        "2014-04-01T00:00:00Z" "08:30:00"]
                    [2 "Felipinho Asklepios" "2014-12-05T00:00:00Z" "15:15:00"]
                    [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00Z" "16:15:00"]
                    [4 "Simcha Yan"          "2014-01-01T00:00:00Z" "08:30:00"]
                    [5 "Quentin Sören"       "2014-10-03T00:00:00Z" "17:30:00"]]

                   ;; TIMEZONE FIXME -- the value of this changes based on whether we are in DST. This is B R O K E N
                   (qp.test/supports-report-timezone? driver/*driver*)
                   (let [offset (t/zone-offset (t/zoned-date-time (t/local-date) (t/local-time) (t/zone-id "America/Los_Angeles")))]
                     [[1 "Plato Yeshua"        "2014-04-01T00:00:00-07:00" (str "08:30:00" offset)]
                      [2 "Felipinho Asklepios" "2014-12-05T00:00:00-08:00" (str "15:15:00" offset)]
                      [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00-08:00" (str "16:15:00" offset)]
                      [4 "Simcha Yan"          "2014-01-01T00:00:00-08:00" (str "08:30:00" offset)]
                      [5 "Quentin Sören"       "2014-10-03T00:00:00-07:00" (str "17:30:00" offset)]])

                   :else
                   [[1 "Plato Yeshua"        "2014-04-01T00:00:00Z" "08:30:00Z"]
                    [2 "Felipinho Asklepios" "2014-12-05T00:00:00Z" "15:15:00Z"]
                    [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00Z" "16:15:00Z"]
                    [4 "Simcha Yan"          "2014-01-01T00:00:00Z" "08:30:00Z"]
                    [5 "Quentin Sören"       "2014-10-03T00:00:00Z" "17:30:00Z"]])
                 (mt/rows
                   (mt/run-mbql-query users
                     {:order-by [[:asc $id]]
                      :limit    5})))))))))

(deftest format-value-test
  (doseq [[t expected zone]
          [[(t/zoned-date-time 2011 4 18 0 0 0 0 (t/zone-id "Asia/Tokyo"))
            "2011-04-17T15:00:00Z"
            "UTC"]

           [(t/zoned-date-time 2011 4 18 0 0 0 0 (t/zone-id "Asia/Tokyo"))
            "2011-04-18T00:00:00+09:00"
            "Asia/Tokyo"]

           [(t/zoned-date-time 2011 4 18 0 0 0 0 (t/zone-id "UTC"))
            "2011-04-18T09:00:00+09:00"
            "Asia/Tokyo"]

           [(t/zoned-date-time 2011 4 18 0 0 0 0 (t/zone-id "UTC"))
            "2011-04-18T00:00:00Z"
            "UTC"]

           [(t/offset-date-time 2011 4 18 0 0 0 0 (t/zone-offset 9))
            "2011-04-17T15:00:00Z"
            "UTC"]

           [(t/offset-date-time 2011 4 18 0 0 0 0 (t/zone-offset 9))
            "2011-04-18T00:00:00+09:00"
            "Asia/Tokyo"]

           [(t/offset-date-time 2011 4 18 0 0 0 0 (t/zone-offset 0))
            "2011-04-18T09:00:00+09:00"
            "Asia/Tokyo"]

           [(t/instant (t/offset-date-time 2011 4 18 0 0 0 0 (t/zone-offset 0)))
            "2011-04-18T00:00:00Z"
            "UTC"]

           [(t/instant (t/offset-date-time 2011 4 18 0 0 0 0 (t/zone-offset 0)))
            "2011-04-18T09:00:00+09:00"
            "Asia/Tokyo"]

           [(t/instant (t/offset-date-time 2011 4 18 0 0 0 0 (t/zone-offset 0)))
            "2011-04-18T00:00:00Z"
            "UTC"]

           [(t/local-date-time 2011 4 18 0 0 0 0)
            "2011-04-18T00:00:00+09:00"
            "Asia/Tokyo"]

           [(t/local-date-time 2011 4 18 0 0 0 0)
            "2011-04-18T00:00:00Z"
            "UTC"]

           [(t/local-date 2011 4 18)
            "2011-04-18T00:00:00+09:00"
            "Asia/Tokyo"]

           [(t/local-date 2011 4 18)
            "2011-04-18T00:00:00Z"
            "UTC"]

           ;; formatting `OffsetTime` currently doesn't adjust the time into the results timezone, because that can't
           ;; be done without knowing the date (e.g., because of DST boundaries)
           [(t/offset-time 19 55 0 0 (t/zone-offset 9))
            "19:55:00+09:00"
            "UTC"]

           [(t/offset-time 19 55 0 0 (t/zone-offset 9))
            "19:55:00+09:00"
            "Asia/Tokyo"]

           [(t/offset-time 19 55 0 0 (t/zone-offset 0))
            "19:55:00Z"
            "UTC"]

           [(t/offset-time 19 55 0 0 (t/zone-offset 0))
            "19:55:00Z"
            "Asia/Tokyo"]

           [(t/local-time 19 55)
            "19:55:00Z"
            "UTC"]

           [(t/local-time 19 55)
            "19:55:00+09:00"
            "Asia/Tokyo"]]]
    ;; results should be completely independent of the system clock
    (doseq [[clock-instant clock-zone] [["2019-07-01T00:00:00Z" "UTC"]
                                        ["2019-01-01T00:00:00Z" "US/Pacific"]
                                        ["2019-07-01T00:00:00Z" "US/Pacific"]
                                        ["2019-07-01T13:14:15Z" "UTC"]
                                        ["2019-07-01T13:14:15Z" "US/Pacific"]]]
      (testing (format "system clock = %s; system timezone = %s" clock-instant clock-zone)
        (mt/with-clock (t/mock-clock (t/instant clock-instant) clock-zone)
          (is (= expected
                 (format-rows/format-value t (t/zone-id zone)))
              (format "format %s '%s' with results timezone ID '%s'" (.getName (class t)) t zone)))))))

(deftest results-timezone-test
  (testing "Make sure ISO-8601 timestamps are written correctly based on the report-timezone"
    (driver/with-driver ::timezone-driver
      (doseq [[timezone-id expected-rows] {"UTC"        [["2011-04-18T10:12:47.232Z"
                                                          "2011-04-18T00:00:00Z"
                                                          "2011-04-18T10:12:47.232Z"]]
                                           "Asia/Tokyo" [["2011-04-18T19:12:47.232+09:00"
                                                          "2011-04-18T00:00:00+09:00"
                                                          "2011-04-18T19:12:47.232+09:00"]]}]
        (mt/with-results-timezone-id timezone-id
          (testing (format "timezone ID '%s'" timezone-id)
            (let [query   {}
                  rows    [[(t/instant "2011-04-18T10:12:47.232Z")
                            (t/local-date 2011 4 18)
                            (t/offset-date-time "2011-04-18T10:12:47.232Z")]]
                  results (mt/test-qp-middleware format-rows/format-rows query rows)]
              (is (= expected-rows
                     (:post results))))))))))
