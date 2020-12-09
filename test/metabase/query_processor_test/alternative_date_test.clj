(ns metabase.query-processor-test.alternative-date-test
  "Tests for columns that mimic dates: integral types as UNIX timestamps and string columns as ISO8601DateTimeString and
  related types."
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]))

(deftest filter-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= 10
           ;; There's a race condition with this test. If we happen to grab a
           ;; connection that is in a session with the timezone set to pacific,
           ;; we'll get 9 results even when the above if statement is true. It
           ;; seems to be pretty rare, but explicitly specifying UTC will make
           ;; the issue go away
           (mt/with-temporary-setting-values [report-timezone "UTC"]
             (count (mt/rows (mt/dataset sad-toucan-incidents
                               (mt/run-mbql-query incidents
                                 {:filter   [:= [:datetime-field $timestamp :day] "2015-06-02"]
                                  :order-by [[:asc $timestamp]]}))))))
        "There were 10 'sad toucan incidents' on 2015-06-02 in UTC")))

(deftest results-test
  (mt/test-drivers (mt/normal-drivers)
    (is (= (cond
             (= :sqlite driver/*driver*)
             [["2015-06-01"  6]
              ["2015-06-02" 10]
              ["2015-06-03"  4]
              ["2015-06-04"  9]
              ["2015-06-05"  9]
              ["2015-06-06"  8]
              ["2015-06-07"  8]
              ["2015-06-08"  9]
              ["2015-06-09"  7]
              ["2015-06-10"  9]]

             (qp.test/tz-shifted-driver-bug? driver/*driver*)
             [["2015-06-01T00:00:00-07:00" 6]
              ["2015-06-02T00:00:00-07:00" 10]
              ["2015-06-03T00:00:00-07:00" 4]
              ["2015-06-04T00:00:00-07:00" 9]
              ["2015-06-05T00:00:00-07:00" 9]
              ["2015-06-06T00:00:00-07:00" 8]
              ["2015-06-07T00:00:00-07:00" 8]
              ["2015-06-08T00:00:00-07:00" 9]
              ["2015-06-09T00:00:00-07:00" 7]
              ["2015-06-10T00:00:00-07:00" 9]]

             (qp.test/supports-report-timezone? driver/*driver*)
             [["2015-06-01T00:00:00-07:00" 8]
              ["2015-06-02T00:00:00-07:00" 9]
              ["2015-06-03T00:00:00-07:00" 9]
              ["2015-06-04T00:00:00-07:00" 4]
              ["2015-06-05T00:00:00-07:00" 11]
              ["2015-06-06T00:00:00-07:00" 8]
              ["2015-06-07T00:00:00-07:00" 6]
              ["2015-06-08T00:00:00-07:00" 10]
              ["2015-06-09T00:00:00-07:00" 6]
              ["2015-06-10T00:00:00-07:00" 10]]

             :else
             [["2015-06-01T00:00:00Z" 6]
              ["2015-06-02T00:00:00Z" 10]
              ["2015-06-03T00:00:00Z" 4]
              ["2015-06-04T00:00:00Z" 9]
              ["2015-06-05T00:00:00Z" 9]
              ["2015-06-06T00:00:00Z" 8]
              ["2015-06-07T00:00:00Z" 8]
              ["2015-06-08T00:00:00Z" 9]
              ["2015-06-09T00:00:00Z" 7]
              ["2015-06-10T00:00:00Z" 9]])
           (mt/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
             (->> (mt/dataset sad-toucan-incidents
                    (mt/run-mbql-query incidents
                      {:aggregation [[:count]]
                       :breakout    [$timestamp]
                       :limit       10}))
                  mt/rows (mt/format-rows-by [identity int])))))))

(deftest substitute-native-parameters-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
    (testing "Make sure `:date/range` SQL field filters work correctly with UNIX timestamps (#11934)"
      (mt/dataset tupac-sightings
        (let [query (mt/native-query
                      (merge (mt/count-with-field-filter-query driver/*driver* :sightings :timestamp)
                             (mt/$ids sightings
                               {:template-tags {"timestamp" {:name         "timestamp"
                                                             :display-name "Sighting Timestamp"
                                                             :type         :dimension
                                                             :dimension    $timestamp
                                                             :widget-type  :date/range}}
                                :parameters    [{:type   :date/range
                                                 :target [:dimension [:template-tag "timestamp"]]
                                                 :value  "2014-02-01~2015-02-29"}]})))]
          (testing (format "\nquery = %s" (u/pprint-to-str query))
            (is (= [[41]]
                   (mt/formatted-rows [int]
                     (qp/process-query query))))))))))


;;; :type/ISO8601DateTimeString tests

(mt/defdataset just-dates
  [["just_dates" [{:field-name "name"
                   :base-type :type/Text}
                  {:field-name "ts"
                   :base-type :type/Text
                   :special-type :type/ISO8601DateTimeString}
                  {:field-name "d"
                   :base-type :type/Text
                   :special-type :type/ISO8601DateString}]
    [["foo" "2004-10-19 10:23:54" "2004-10-19"]
     ["bar" "2008-10-19 10:23:54" "2008-10-19"]
     ["baz" "2012-10-19 10:23:54" "2012-10-19"]]]])

(mt/defdataset string-times
  [["times" [{:field-name "name"
             :base-type :type/Text}
            {:field-name "ts"
             :base-type :type/Text
             :special-type :type/ISO8601DateTimeString}
            {:field-name "d"
             :base-type :type/Text
             :special-type :type/ISO8601DateString}
            {:field-name "t"
             :base-type :type/Text
             :special-type :type/ISO8601TimeString}]
  [["foo" "2004-10-19 10:23:54" "2004-10-19" "10:23:54"]
   ["bar" "2008-10-19 10:23:54" "2008-10-19" "10:23:54"]
   ["baz" "2012-10-19 10:23:54" "2012-10-19" "10:23:54"]]]])

(deftest iso-8601-text-fields
  (testing "text fields with special_type :type/ISO8601DateTimeString"
    (testing "return as dates"
      (mt/test-drivers (disj (sql-jdbc.tu/sql-jdbc-drivers) :sqlite :oracle :sparksql)
        (is (= [[1 "foo" #t "2004-10-19T10:23:54" #t "2004-10-19" #t "10:23:54"]
                [2 "bar" #t "2008-10-19T10:23:54" #t "2008-10-19" #t "10:23:54"]
                [3 "baz" #t "2012-10-19T10:23:54" #t "2012-10-19" #t "10:23:54"]]
               ;; string-times dataset has three text fields, ts, d, t for timestamp, date, and time
               (mt/rows (mt/dataset string-times
                          (qp/process-query
                            (assoc (mt/mbql-query times)
                                   :middleware {:format-rows? false})))))))
      (testing "sparksql adds UTC"
        (mt/test-drivers #{:sparksql}
          (is (= #{[1 "foo" #t "2004-10-19T10:23:54Z[UTC]" #t "2004-10-19T00:00Z[UTC]"]
                   [3 "baz" #t "2012-10-19T10:23:54Z[UTC]" #t "2012-10-19T00:00Z[UTC]"]
                   [2 "bar" #t "2008-10-19T10:23:54Z[UTC]" #t "2008-10-19T00:00Z[UTC]"]}
                 ;; order seems to be nondeterministic
                 (set (mt/rows (mt/dataset just-dates
                                 (qp/process-query
                                   (assoc (mt/mbql-query just-dates)
                                          :middleware {:format-rows? false})))))))))
      (testing "oracle doesn't have a time type"
        (mt/test-drivers #{:oracle}
          (is (= [[1M "foo" #t "2004-10-19T10:23:54" #t "2004-10-19T00:00"]
                  [2M "bar" #t "2008-10-19T10:23:54" #t "2008-10-19T00:00"]
                  [3M "baz" #t "2012-10-19T10:23:54" #t "2012-10-19T00:00"]]
                 ;; string-times dataset has three text fields, ts, d, t for timestamp, date, and time
                 (mt/rows (mt/dataset just-dates
                            (qp/process-query
                              (assoc (mt/mbql-query just-dates)
                                     :middleware {:format-rows? false}))))))))
      (testing "sqlite returns as strings"
        (mt/test-drivers #{:sqlite}
          (is (= [[1 "foo" "2004-10-19 10:23:54" "2004-10-19" "10:23:54"]
                  [2 "bar" "2008-10-19 10:23:54" "2008-10-19" "10:23:54"]
                  [3 "baz" "2012-10-19 10:23:54" "2012-10-19" "10:23:54"]]
                 ;; string-times dataset has three text fields, ts, d, t for timestamp, date, and time
                 (mt/rows (mt/dataset string-times
                            (qp/process-query
                              (assoc (mt/mbql-query times)
                                     :middleware {:format-rows? false})))))))))
    (testing "are queryable as dates"
      (testing "a datetime field"
        ;; TODO: why does this fail on oracle? gives a NPE
        (mt/test-drivers (disj (sql-jdbc.tu/sql-jdbc-drivers) :oracle :sparksql)
          (is (= 1
                 (count (mt/rows (mt/dataset string-times
                                   (mt/run-mbql-query times
                                     {:filter   [:= [:datetime-field $ts :day] "2008-10-19"]}))))))))
      (testing "a date field"
        (mt/test-drivers (disj (sql-jdbc.tu/sql-jdbc-drivers) :oracle :sparksql)
          (is (= 1
                 (count (mt/rows (mt/dataset string-times
                                   (mt/run-mbql-query times
                                     {:filter   [:= [:datetime-field $d :day] "2008-10-19"]})))))))))))
