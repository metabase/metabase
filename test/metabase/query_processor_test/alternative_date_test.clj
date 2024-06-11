(ns metabase.query-processor-test.alternative-date-test
  "Tests for columns that mimic dates: integral types as UNIX timestamps and string columns as ISO8601DateTimeString and
  related types."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(deftest ^:parallel semantic-type->unix-timestamp-unit-test
  (testing "every descendant of `:Coercion/UNIXTime->Temporal` has a unit associated with it"
    (doseq [semantic-type (descendants :Coercion/UNIXTime->Temporal)]
      (is (sql.qp/semantic-type->unix-timestamp-unit semantic-type))))
  (testing "throws if argument is not a descendant of `:Coercion/UNIXTime->Temporal`"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Semantic type must be a UNIXTimestamp"
         (sql.qp/semantic-type->unix-timestamp-unit :type/Integer)))))

(mt/defdataset toucan-ms-incidents
  [["incidents" [{:field-name "severity"
                  :base-type  :type/Integer}
                 {:field-name        "timestamp"
                  :base-type         :type/BigInteger
                  :effective-type    :type/DateTime
                  :coercion-strategy :Coercion/UNIXMicroSeconds->DateTime}]
    [[4 1433587200000000]
     [0 1433965860000000]]]])

(deftest double-coercion-through-model
  (testing "Ensure that coerced values only get coerced once. #33861"
    (mt/dataset
      toucan-ms-incidents
      (t2.with-temp/with-temp [:model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                                          :type     :query
                                                                          :query    {:source-table (mt/id :incidents)}}}]
        (is (= [[1 4 "2015-06-06T10:40:00Z"]
                [2 0 "2015-06-10T19:51:00Z"]]
               (mt/rows (qp/process-query {:database (mt/id)
                                           :type     :query
                                           :query    {:source-table (str "card__" card-id)}}))))))))

(deftest ^:parallel microseconds-test
  (mt/test-drivers (disj (mt/normal-drivers) :sqlite)
    (let [results (get {:sqlite #{[1 4 "2015-06-06 10:40:00"] [2 0 "2015-06-10 19:51:00"]}
                        :oracle #{[1M 4M "2015-06-06T10:40:00Z"] [2M 0M "2015-06-10T19:51:00Z"]}}
                       driver/*driver*
                       ;; default result shape
                       #{[1 4 "2015-06-06T10:40:00Z"] [2 0 "2015-06-10T19:51:00Z"]})]
      (is (= results
             (set (mt/rows (mt/dataset toucan-ms-incidents
                             (mt/run-mbql-query incidents)))))))))

(deftest filter-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset sad-toucan-incidents
      (let [query (mt/mbql-query incidents
                     {:filter   [:= !day.timestamp "2015-06-02"]
                      :order-by [[:asc $timestamp]]})]
        ;; There's a race condition with this test. If we happen to grab a connection that is in a session with the
        ;; timezone set to pacific, we'll get 9 results even when the above if statement is true. It seems to be pretty
        ;; rare, but explicitly specifying UTC will make the issue go away
        (mt/with-temporary-setting-values [report-timezone "UTC"]
          (testing "There were 10 'sad toucan incidents' on 2015-06-02 in UTC"
            (mt/with-native-query-testing-context query
              (is (= 10
                     (count (mt/rows (qp/process-query query))))))))))))

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

             (qp.test-util/tz-shifted-driver-bug? driver/*driver*)
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

             (qp.test-util/supports-report-timezone? driver/*driver*)
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

(deftest ^:parallel substitute-native-parameters-test
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
  [["just_dates" [{:field-name     "name"
                   :base-type      :type/Text
                   :effective-type :type/Text}
                  {:field-name        "ts"
                   :base-type         :type/Text
                   :effective-type    :type/DateTime
                   :coercion-strategy :Coercion/ISO8601->DateTime}
                  {:field-name        "d"
                   :base-type         :type/Text
                   :effective-type    :type/Date
                   :coercion-strategy :Coercion/ISO8601->Date}]
    [["foo" "2004-10-19 10:23:54" "2004-10-19"]
     ["bar" "2008-10-19 10:23:54" "2008-10-19"]
     ["baz" "2012-10-19 10:23:54" "2012-10-19"]]]])

(mt/defdataset string-times
  [["times" [{:field-name "name"
              :effective-type :type/Text
              :base-type :type/Text}
             {:field-name "ts"
              :base-type :type/Text
              :effective-type :type/DateTime
              :coercion-strategy :Coercion/ISO8601->DateTime}
             {:field-name "d"
              :base-type :type/Text
              :effective-type :type/Date
              :coercion-strategy :Coercion/ISO8601->Date}
             {:field-name "t"
              :base-type :type/Text
              :effective-type :type/Time
              :coercion-strategy :Coercion/ISO8601->Time}]
    [["foo" "2004-10-19 10:23:54" "2004-10-19" "10:23:54"]
     ["bar" "2008-10-19 10:23:54" "2008-10-19" "10:23:54"]
     ["baz" "2012-10-19 10:23:54" "2012-10-19" "10:23:54"]]]])

;;; TODO -- instead of having 5 different hardcoded versions of the test, maybe we should make a `iso-8601-text-fields`
;;; multimethod with a `:default` implementation and different driver implementations as needed so third-party driver
;;; authors can pass this test too.
(deftest ^:parallel iso-8601-text-fields
  (testing "text fields with semantic_type :type/ISO8601DateTimeString"
    (testing "return as dates"
      (mt/test-drivers (-> (sql-jdbc.tu/normal-sql-jdbc-drivers)
                           (conj :bigquery-cloud-sdk)
                           (disj :sqlite :oracle :sparksql))
        (is (= [[1 "foo" #t "2004-10-19T10:23:54" #t "2004-10-19" #t "10:23:54"]
                [2 "bar" #t "2008-10-19T10:23:54" #t "2008-10-19" #t "10:23:54"]
                [3 "baz" #t "2012-10-19T10:23:54" #t "2012-10-19" #t "10:23:54"]]
               ;; string-times dataset has three text fields, ts, d, t for timestamp, date, and time
               (mt/rows (mt/dataset string-times
                          (qp/process-query
                           (assoc (mt/mbql-query times {:order-by [[:asc $id]]})
                                  :middleware {:format-rows? false})))))))
      (testing "SparkSQL returns ZonedDateTime (which isn't really correct if we asked for :type/DateTime) and doesn't have a TIME type"
        (mt/test-drivers #{:sparksql}
          (is (= [[1 "foo" #t "2004-10-19T10:23:54Z[UTC]" #t "2004-10-19"]
                  [2 "bar" #t "2008-10-19T10:23:54Z[UTC]" #t "2008-10-19"]
                  [3 "baz" #t "2012-10-19T10:23:54Z[UTC]" #t "2012-10-19"]]
                 (mt/rows (mt/dataset just-dates
                            (qp/process-query
                             (assoc (mt/mbql-query just-dates {:order-by [[:asc $id]]})
                                    :middleware {:format-rows? false}))))))))
      (testing "oracle doesn't have a time type"
        (mt/test-drivers #{:oracle}
          (is (= [[1M "foo" #t "2004-10-19T10:23:54" #t "2004-10-19T00:00"]
                  [2M "bar" #t "2008-10-19T10:23:54" #t "2008-10-19T00:00"]
                  [3M "baz" #t "2012-10-19T10:23:54" #t "2012-10-19T00:00"]]
                 ;; string-times dataset has three text fields, ts, d, t for timestamp, date, and time
                 (mt/rows (mt/dataset just-dates
                            (qp/process-query
                             (assoc (mt/mbql-query just-dates {:order-by [[:asc $id]]})
                                    :middleware {:format-rows? false}))))))))

      (testing "sqlite returns as strings"
        (mt/test-drivers #{:sqlite}
          (is (= [[1 "foo" "2004-10-19 10:23:54" "2004-10-19" "10:23:54"]
                  [2 "bar" "2008-10-19 10:23:54" "2008-10-19" "10:23:54"]
                  [3 "baz" "2012-10-19 10:23:54" "2012-10-19" "10:23:54"]]
                 ;; string-times dataset has three text fields, ts, d, t for timestamp, date, and time
                 (mt/rows (mt/dataset string-times
                            (qp/process-query
                             (assoc (mt/mbql-query times {:order-by [[:asc $id]]})
                                    :middleware {:format-rows? false}))))))))

      (testing "mongo only supports datetime"
        (mt/test-drivers #{:mongo}
          (mt/dataset string-times
            (is (= [[(t/instant "2004-10-19T10:23:54Z")]
                    [(t/instant "2008-10-19T10:23:54Z")]
                    [(t/instant "2012-10-19T10:23:54Z")]]
                   (mt/rows (qp/process-query
                             (assoc (mt/mbql-query times
                                      {:order-by [[:asc $id]], :fields [$ts]})
                                    :middleware {:format-rows? false})))))
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"MongoDB does not support parsing strings as dates. Try parsing to a datetime instead"
                 (qp/process-query
                  (mt/mbql-query times {:fields [$d]}))))
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"MongoDB does not support parsing strings as times. Try parsing to a datetime instead"
                 (qp/process-query
                  (mt/mbql-query times {:fields [$t]}))))))))))

(deftest ^:parallel iso-8601-text-fields-should-be-queryable-test
  (testing "text fields with semantic_type :type/ISO8601DateTimeString"
    (testing "are queryable as dates"
      (mt/dataset string-times
        (testing "a datetime field"
          ;; TODO: why does this fail on oracle? gives a NPE
          (mt/test-drivers (disj (sql-jdbc.tu/normal-sql-jdbc-drivers) :oracle :sparksql)
            (is (= 1
                   (->> (mt/run-mbql-query times
                          {:filter [:= !day.ts "2008-10-19"]})
                        mt/rows
                        count))))

          (mt/test-drivers #{:mongo}
            (is (= 1
                   (->> (mt/run-mbql-query times
                          {:filter [:= !day.ts "2008-10-19"]
                           :fields [$ts]})
                        mt/rows
                        count)))))
        (testing "a date field"
          (mt/test-drivers (disj (sql-jdbc.tu/normal-sql-jdbc-drivers) :oracle :sparksql)
            (is (= 1
                   (->> (mt/run-mbql-query times
                          {:filter [:= !day.d "2008-10-19"]})
                        mt/rows
                        count)))))))))

(mt/defdataset yyyymmddhhss-times
  [["times" [{:field-name "name"
              :effective-type :type/Text
              :base-type :type/Text}
             {:field-name "as_text"
              :base-type :type/Text
              :effective-type :type/DateTime
              :coercion-strategy :Coercion/YYYYMMDDHHMMSSString->Temporal}]
    [["foo" "20190421164300"]
     ["bar" "20200421164300"]
     ["baz" "20210421164300"]]]])

(mt/defdataset yyyymmddhhss-binary-times
  [["times" [{:field-name "name"
              :effective-type :type/Text
              :base-type :type/Text}
             {:field-name "as_bytes"
              :base-type {:natives {:postgres "BYTEA"
                                    :h2       "BYTEA"
                                    :mysql    "VARBINARY(100)"}}
              :effective-type :type/DateTime
              :coercion-strategy :Coercion/YYYYMMDDHHMMSSBytes->Temporal}]
    [["foo" (.getBytes "20190421164300")]
     ["bar" (.getBytes "20200421164300")]
     ["baz" (.getBytes "20210421164300")]]]])

(deftest ^:parallel yyyymmddhhmmss-binary-dates
  (mt/test-drivers #{:postgres :h2 :mysql}
    (is (= (case driver/*driver*
             (:h2 :postgres)
             [[1 "foo" (OffsetDateTime/from #t "2019-04-21T16:43Z")]
              [2 "bar" (OffsetDateTime/from #t "2020-04-21T16:43Z")]
              [3 "baz" (OffsetDateTime/from #t "2021-04-21T16:43Z")]]
             (:mysql :sqlserver)
             [[1 "foo" #t "2019-04-21T16:43"]
              [2 "bar" #t "2020-04-21T16:43"]
              [3 "baz" #t "2021-04-21T16:43"]]
             [])
           (sort-by
            first
            (mt/rows (mt/dataset yyyymmddhhss-binary-times
                                 (qp/process-query
                                  (assoc (mt/mbql-query times)
                                         :middleware {:format-rows? false})))))))))

(deftest ^:parallel yyyymmddhhmmss-dates
  (mt/test-drivers #{:mongo :oracle :postgres :h2 :mysql :bigquery-cloud-sdk :snowflake :redshift :sqlserver}
    (is (= (case driver/*driver*
             :mongo
             [[1 "foo" (.toInstant #t "2019-04-21T16:43:00Z")]
              [2 "bar" (.toInstant #t "2020-04-21T16:43:00Z")]
              [3 "baz" (.toInstant #t "2021-04-21T16:43:00Z")]]
             (:mysql :sqlserver :bigquery-cloud-sdk)
             [[1 "foo" #t "2019-04-21T16:43"]
              [2 "bar" #t "2020-04-21T16:43"]
              [3 "baz" #t "2021-04-21T16:43"]]
             (:redshift)
             [[1 "foo" #t "2019-04-21T16:43Z[UTC]"]
              [2 "bar" #t "2020-04-21T16:43Z[UTC]"]
              [3 "baz" #t "2021-04-21T16:43Z[UTC]"]]
             (:h2 :postgres)
             [[1 "foo" (OffsetDateTime/from #t "2019-04-21T16:43Z")]
              [2 "bar" (OffsetDateTime/from #t "2020-04-21T16:43Z")]
              [3 "baz" (OffsetDateTime/from #t "2021-04-21T16:43Z")]]
             :oracle
             [[1M "foo" #t "2019-04-21T16:43"]
              [2M "bar" #t "2020-04-21T16:43"]
              [3M "baz" #t "2021-04-21T16:43"]]
             :snowflake
             [[1 "foo" #t "2609-10-23T10:19:24.300"]
              [2 "bar" #t "2610-02-16T04:06:04.300"]
              [3 "baz" #t "2610-06-11T21:52:44.300"]])
           ;; string-times dataset has three text fields, ts, d, t for timestamp, date, and time
           (sort-by
            first
            (mt/rows (mt/dataset yyyymmddhhss-times
                                 (qp/process-query
                                  (assoc (mt/mbql-query times)
                                         :middleware {:format-rows? false})))))))))
