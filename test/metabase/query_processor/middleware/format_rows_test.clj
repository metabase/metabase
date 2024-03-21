(ns metabase.query-processor.middleware.format-rows-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.query-processor.middleware.format-rows :as format-rows]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(driver/register! ::timezone-driver, :abstract? true)

(defmethod driver/database-supports? [::timezone-driver :set-timezone] [_driver _feature _db] true)

;; TIMEZONE FIXME
(def ^:private dbs-exempt-from-format-rows-tests
  "DBs to skip the tests below for. TIMEZONE FIXME — why are so many databases not running these tests? Most of these
  should be able to pass with a few tweaks. Some of them are excluded because they do not have a TIME data type and
  can't load the `time-test-data` dataset; but that's not true of ALL of these. Please make sure you add a note
  as to why a certain database is explicitly skipped if you skip it -- Cam"
  #{:bigquery-cloud-sdk :oracle :mongo :redshift :sparksql :snowflake})

(deftest format-rows-test
  (mt/test-drivers (filter mt/supports-time-type? (mt/normal-drivers-except dbs-exempt-from-format-rows-tests))
    (mt/dataset time-test-data
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
        (mt/with-report-timezone-id! "America/Los_Angeles"
          (is (= (cond
                   (= driver/*driver* :sqlite)
                   [[1 "Plato Yeshua"        "2014-04-01T00:00:00Z" "08:30:00"]
                    [2 "Felipinho Asklepios" "2014-12-05T00:00:00Z" "15:15:00"]
                    [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00Z" "16:15:00"]
                    [4 "Simcha Yan"          "2014-01-01T00:00:00Z" "08:30:00"]
                    [5 "Quentin Sören"       "2014-10-03T00:00:00Z" "17:30:00"]]

                   ;; TIMEZONE FIXME -- the value of this changes based on whether we are in DST. This is B R O K E N
                   (qp.test-util/supports-report-timezone? driver/*driver*)
                   [[1 "Plato Yeshua"        "2014-04-01T00:00:00-07:00" "08:30:00-08:00"]
                    [2 "Felipinho Asklepios" "2014-12-05T00:00:00-08:00" "15:15:00-08:00"]
                    [3 "Kaneonuskatew Eiran" "2014-11-06T00:00:00-08:00" "16:15:00-08:00"]
                    [4 "Simcha Yan"          "2014-01-01T00:00:00-08:00" "08:30:00-08:00"]
                    [5 "Quentin Sören"       "2014-10-03T00:00:00-07:00" "17:30:00-08:00"]]

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

(deftest ^:parallel format-value-test
  ;; `t` = original value
  ;; `expected` = the same value when shifted to `zone`
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

           [(t/offset-time 19 55 0 0 (t/zone-offset 9))
            "10:55:00Z"
            "UTC"]

           [(t/offset-time 19 55 0 0 (t/zone-offset 9))
            "19:55:00+09:00"
            "Asia/Tokyo"]

           [(t/offset-time 19 55 0 0 (t/zone-offset 0))
            "19:55:00Z"
            "UTC"]

           [(t/offset-time 19 55 0 0 (t/zone-offset 0))
            "04:55:00+09:00"
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
          (testing (format "\nformat %s '%s' with results timezone ID '%s'" (.getName (class t)) t zone)
            (is (= expected
                   (format-rows/format-value t (t/zone-id zone)))))))))
  (testing "can handle infinity dates (#12761)"
    (is (format-rows/format-value java.time.OffsetDateTime/MAX (t/zone-id "UTC")))
    (is (format-rows/format-value java.time.OffsetDateTime/MIN (t/zone-id "UTC")))))

(defn- format-rows
  [rows metadata]
  (let [rff (format-rows/format-rows {} (constantly conj))
        rf  (rff metadata)]
    (transduce identity rf rows)))

(deftest results-timezone-test
  (driver/with-driver ::timezone-driver
    (testing "Make sure ISO-8601 timestamps are written correctly based on the report-timezone"
      (doseq [[timezone-id expected-rows] {"UTC"        [["2011-04-18T10:12:47.232Z"
                                                          "2011-04-18T00:00:00Z"
                                                          "2011-04-18T10:12:47.232Z"]]
                                           "Asia/Tokyo" [["2011-04-18T19:12:47.232+09:00"
                                                          "2011-04-18T00:00:00+09:00"
                                                          "2011-04-18T19:12:47.232+09:00"]]}]
        (mt/with-results-timezone-id timezone-id
          (testing (format "timezone ID '%s'" timezone-id)
            (let [rows [[(t/instant "2011-04-18T10:12:47.232Z")
                         (t/local-date 2011 4 18)
                         (t/offset-date-time "2011-04-18T10:12:47.232Z")]]]
              (is (= expected-rows
                     (format-rows rows {:cols [{}{}{}]}))))))))

    (testing "Make sure ISO-8601 timestamps respects the converted_timezone metadata"
      (doseq [timezone-id ["UTC" "Asia/Tokyo"]]
        (mt/with-results-timezone-id timezone-id
          (testing (format "timezone ID '%s'" timezone-id)
            (let [rows [[(t/instant "2011-04-18T10:12:47.232Z")
                         (t/local-date 2011 4 18)
                         (t/offset-date-time "2011-04-18T10:12:47.232Z")]]]
              (is (= [["2011-04-18T12:12:47.232+02:00"
                       "2011-04-18T00:00:00+07:00"
                       "2011-04-18T10:12:47.232Z"]]
                     (format-rows rows {:cols [{:converted_timezone "Europe/Rome"}
                                               {:converted_timezone "Asia/Ho_Chi_Minh"}
                                               {:converted_timezone "UTC"}]}))))))))))
