(ns metabase.driver.googleanalytics.query-processor-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.driver.googleanalytics.query-processor :as ga.qp]
            [metabase.test :as mt])
  (:import com.google.api.services.analytics.model.GaData$ColumnHeaders))

(deftest built-in-segment-test
  (is (= "ga::WOW"
         (#'ga.qp/built-in-segment {:filter [:segment "ga::WOW"]})))
  (testing "should work recursively"
    (is (= "gaid::A"
           (#'ga.qp/built-in-segment {:filter [:and [:= [:field-id 1] 2] [:segment "gaid::A"]]}))))
  (testing "should throw Exception if more than one segment is matched"
    (is (thrown? Exception
                 (#'ga.qp/built-in-segment {:filter [:and [:segment "gaid::A"] [:segment "ga::B"]]}))))
  (testing "should ignore Metabase segments"
    (is (= "ga::B"
           (#'ga.qp/built-in-segment {:filter [:and [:segment 100] [:segment "ga::B"]]})))))

(defn- column-name->getter [column-name]
  (#'ga.qp/header->getter-fn (doto (GaData$ColumnHeaders.)
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

(deftest filter-test
  (mt/with-report-timezone-id nil
    (testing "\nabsolute datetimes"
      (doseq [[filter-type expected] {:=  {:start-date "2019-11-18", :end-date "2019-11-18"}
                                      :<  {:end-date "2019-11-17"}
                                      :<= {:end-date "2019-11-18"}
                                      :>  {:start-date "2019-11-19"}
                                      :>= {:start-date "2019-11-18"}}]
        (let [filter-clause [filter-type [:datetime-field 'field :day] [:absolute-datetime (t/local-date "2019-11-18") :day]]]
          (testing filter-clause
            (is (= expected
                   (#'ga.qp/parse-filter:interval filter-clause)))))))
    (testing "\nrelative datetimes"
      (mt/with-database-timezone-id "UTC"
        (mt/with-clock (t/mock-clock (t/instant "2019-11-18T22:31:00Z") (t/zone-id "UTC"))
          (doseq [[filter-type {:keys [expected message]}]
                  {:=  {:message  "`=` filter — Month is 4 months ago, i.e. July 2019"
                        :expected {:start-date "2019-07-01", :end-date "2019-07-31"}}
                   :<  {:message  "`<` filter — month is less than 4 months ago, i.e. before July 2019"
                        :expected {:end-date "2019-06-30"}}
                   :<= {:message  "`<=` filter — month is less than or equal to 4 months ago, i.e. before August 2019"
                        :expected {:end-date "2019-07-31"}}
                   :>  {:message  "`>` filter — month is greater than 4 months ago, i.e. after July 2019"
                        :expected {:start-date "2019-08-01"}}
                   :>= {:message  "`>=` filter — month is greater than or equal to 4 months ago, i.e. after June 2019"
                        :expected {:start-date "2019-07-01"}}}]
            (testing (str "\n" message)
              (let [filter-clause [filter-type [:datetime-field 'field :month] [:relative-datetime -4 :month]]]
                (testing filter-clause
                  (is (= expected
                         (#'ga.qp/parse-filter:interval filter-clause)))))))
          (testing "\ndatetime-field bucketing unit != relative-datetime bucketing unit"
            (testing "Day == 4 months ago, i.e. July 18th"
              (let [filter-clause [:= [:datetime-field 'field :day] [:relative-datetime -4 :month]]]
                (testing filter-clause
                  (is (= {:start-date "2019-07-18", :end-date "2019-07-18"}
                         (#'ga.qp/parse-filter:interval filter-clause)))))))
          (testing "\n:between filter"
            (is (= {:start-date "2019-07-01", :end-date "2019-10-31"}
                   (#'ga.qp/parse-filter:interval [:between
                                                   [:datetime-field 'field :month]
                                                   [:relative-datetime -4 :month]
                                                   [:relative-datetime -1 :month]]))
                ":between is inclusive!!!!")))
        (testing "\nthis week should be based on the report timezone — see #9467"
          (testing "\nSanity check - with UTC timezone, current week *should* be different when going from 11 PM Sat -> 1 AM Sun"
            (is (not= (mt/with-clock (t/mock-clock (t/instant "2019-11-30T23:00:00Z") (t/zone-id "UTC"))
                        (#'ga.qp/parse-filter:interval [:= [:datetime-field 'field :week] [:relative-datetime 0 :week]]))
                      (mt/with-clock (t/mock-clock (t/instant "2019-12-01T01:00:00Z") (t/zone-id "UTC"))
                        (#'ga.qp/parse-filter:interval [:= [:datetime-field 'field :week] [:relative-datetime 0 :week]])))))
          (testing (str "\nthis week at Saturday 6PM local time (Saturday 11PM UTC) should be the same as this week "
                        "Saturday 8PM local time (Sunday 1 AM UTC)")
            (mt/with-report-timezone-id "US/Eastern"
              (doseq [system-timezone ["US/Eastern" "UTC"]]
                (testing "\nGoogle Analytics should prefer report timezone (if set) to system timezone"
                  (testing (format "\nSystem timezone = %s" system-timezone)
                    (is (= {:start-date "2019-11-24", :end-date "2019-11-30"}
                           (mt/with-clock (t/mock-clock (t/instant "2019-11-30T23:00:00Z") (t/zone-id system-timezone))
                             (#'ga.qp/parse-filter:interval [:= [:datetime-field 'field :week] [:relative-datetime 0 :week]]))
                           (mt/with-clock (t/mock-clock (t/instant "2019-12-01T01:00:00Z") (t/zone-id system-timezone))
                             (#'ga.qp/parse-filter:interval [:= [:datetime-field 'field :week] [:relative-datetime 0 :week]]))))))))))))))
