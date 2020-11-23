(ns metabase.driver.googleanalytics.query-processor-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.driver.googleanalytics.query-processor :as ga.qp]
            [metabase.test :as mt]))

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
