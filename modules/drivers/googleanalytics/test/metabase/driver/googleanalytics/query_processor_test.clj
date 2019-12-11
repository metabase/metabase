(ns metabase.driver.googleanalytics.query-processor-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.driver.googleanalytics.query-processor :as ga.qp]))

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

(deftest parse-year-week-test
  (testing "Make sure we properly parse isoYearIsoWeeks (#9244)"
    (let [f (#'ga.qp/ga-dimension->date-format-fn "ga:isoYearIsoWeek")]
      (is (= #t "2018-12-31"
             (f "201901")))
      (is (= #t "2019-12-09"
             (f "201950")))))
  (testing "Make sure we properly parse (non-ISO) yearWeeks"
    (let [f (#'ga.qp/ga-dimension->date-format-fn "ga:yearWeek")]
      (is (= #t "2018-12-30"
             (f "201901")))
      (is (= #t "2019-12-08"
             (f "201950"))))))

(deftest filter-test
  (testing "absolute datetimes"
    (doseq [[filter-type expected] {:=  {:start-date "2019-11-18", :end-date "2019-11-18"}
                                    :<  {:end-date "2019-11-17"}
                                    :<= {:end-date "2019-11-18"}
                                    :>  {:start-date "2019-11-19"}
                                    :>= {:start-date "2019-11-18"}}]
      (let [filter-clause [filter-type [:datetime-field 'field :day] [:absolute-datetime (t/local-date "2019-11-18") :day]]]
        (testing filter-clause
          (is (= expected
                 (#'ga.qp/parse-filter:interval filter-clause)))))))
  (testing "relative datetimes"
    (t/with-clock (t/mock-clock (t/instant "2019-11-18T22:31:00Z"))
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
        (testing message
          (let [filter-clause [filter-type [:datetime-field 'field :month] [:relative-datetime -4 :month]]]
            (testing filter-clause
              (is (= expected
                     (#'ga.qp/parse-filter:interval filter-clause)))))))
      (testing "datetime-field bucketing unit != relative-datetime bucketing unit"
        (testing "Day == 4 months ago, i.e. July 18th"
          (let [filter-clause [:= [:datetime-field 'field :day] [:relative-datetime -4 :month]]]
            (testing filter-clause
              (is (= {:start-date "2019-07-18", :end-date "2019-07-18"}
                     (#'ga.qp/parse-filter:interval filter-clause)))))))
      (testing ":between filter"
        (is (= {:start-date "2019-07-01", :end-date "2019-10-31"}
               (#'ga.qp/parse-filter:interval [:between
                                               [:datetime-field 'field :month]
                                               [:relative-datetime -4 :month]
                                               [:relative-datetime -1 :month]]))
            ":between is inclusive!!!!")))))
