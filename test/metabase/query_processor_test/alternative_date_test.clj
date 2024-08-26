(ns metabase.query-processor-test.alternative-date-test
  "Tests for columns that mimic dates: integral types as UNIX timestamps and string columns as ISO8601DateTimeString and
  related types."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
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

(defmulti microseconds-test-expected-rows
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod microseconds-test-expected-rows :default
  [_driver]
  [[1 4 "2015-06-06T10:40:00Z"]
   [2 0 "2015-06-10T19:51:00Z"]])

(defmethod microseconds-test-expected-rows :sqlite
  [_driver]
  [[1 4 "2015-06-06 10:40:00"]
   [2 0 "2015-06-10 19:51:00"]])

(deftest ^:parallel microseconds-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/dataset toucan-ms-incidents
      (is (= (microseconds-test-expected-rows driver/*driver*)
             (sort-by first (mt/formatted-rows
                             [int int str]
                             (mt/run-mbql-query incidents))))))))

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

(defmulti results-test-expected-rows
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod results-test-expected-rows :default
  [driver]
  (cond
    (qp.test-util/tz-shifted-driver-bug? driver)
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

    (qp.test-util/supports-report-timezone? driver)
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
     ["2015-06-10T00:00:00Z" 9]]))

(defmethod results-test-expected-rows :sqlite
  [_driver]
  [["2015-06-01"  6]
   ["2015-06-02" 10]
   ["2015-06-03"  4]
   ["2015-06-04"  9]
   ["2015-06-05"  9]
   ["2015-06-06"  8]
   ["2015-06-07"  8]
   ["2015-06-08"  9]
   ["2015-06-09"  7]
   ["2015-06-10"  9]])

(deftest results-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (mt/dataset sad-toucan-incidents
        (is (= (results-test-expected-rows driver/*driver*)
               (mt/formatted-rows
                [identity int]
                (mt/run-mbql-query incidents
                  {:aggregation [[:count]]
                   :breakout    [$timestamp]
                   :limit       10}))))))))

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
                   (mt/formatted-rows
                    [int]
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

(defmulti iso-8601-text-fields-query
  "The query to run for the [[iso-8601-text-fields]] test below."
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod iso-8601-text-fields-query :default
  [_driver]
  (assoc (mt/mbql-query times {:order-by [[:asc $id]]})
         :middleware {:format-rows? false}))

(defmethod iso-8601-text-fields-query :mongo
  [_driver]
  (assoc (mt/mbql-query times
           {:order-by [[:asc $id]], :fields [$ts]})
         :middleware {:format-rows? false}))

(doseq [driver [:oracle :sparksql]]
  (defmethod iso-8601-text-fields-query driver
    [_driver]
    (mt/dataset just-dates
      (assoc (mt/mbql-query just-dates {:order-by [[:asc $id]]})
             :middleware {:format-rows? false}))))

(defmulti iso-8601-text-fields-expected-rows
  "Expected rows for the [[iso-8601-text-fields]] test below."
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod iso-8601-text-fields-expected-rows :default
  [_driver]
  [[1 "foo" #t "2004-10-19T10:23:54" #t "2004-10-19" #t "10:23:54"]
   [2 "bar" #t "2008-10-19T10:23:54" #t "2008-10-19" #t "10:23:54"]
   [3 "baz" #t "2012-10-19T10:23:54" #t "2012-10-19" #t "10:23:54"]])

;;; SparkSQL returns ZonedDateTime (which isn't really correct if we asked for :type/DateTime) and doesn't have a TIME
;;; type
(defmethod iso-8601-text-fields-expected-rows :sparksql
  [_driver]
  [[1 "foo" #t "2004-10-19T10:23:54Z[UTC]" #t "2004-10-19"]
   [2 "bar" #t "2008-10-19T10:23:54Z[UTC]" #t "2008-10-19"]
   [3 "baz" #t "2012-10-19T10:23:54Z[UTC]" #t "2012-10-19"]])

;;; oracle doesn't have a time type
(defmethod iso-8601-text-fields-expected-rows :oracle
  [_driver]
  [[1M "foo" #t "2004-10-19T10:23:54" #t "2004-10-19T00:00"]
   [2M "bar" #t "2008-10-19T10:23:54" #t "2008-10-19T00:00"]
   [3M "baz" #t "2012-10-19T10:23:54" #t "2012-10-19T00:00"]])

;;; sqlite returns as strings
(defmethod iso-8601-text-fields-expected-rows :sqlite
  [_driver]
  [[1 "foo" "2004-10-19 10:23:54" "2004-10-19" "10:23:54"]
   [2 "bar" "2008-10-19 10:23:54" "2008-10-19" "10:23:54"]
   [3 "baz" "2012-10-19 10:23:54" "2012-10-19" "10:23:54"]])

;;; mongo only supports datetime
(defmethod iso-8601-text-fields-expected-rows :mongo
  [_driver]
  [[(t/instant "2004-10-19T10:23:54Z")]
   [(t/instant "2008-10-19T10:23:54Z")]
   [(t/instant "2012-10-19T10:23:54Z")]])

;;; TODO -- instead of having 5 different hardcoded versions of the test, maybe we should make a `iso-8601-text-fields`
;;; multimethod with a `:default` implementation and different driver implementations as needed so third-party driver
;;; authors can pass this test too.
(deftest ^:parallel iso-8601-text-fields
  (testing "text fields with semantic_type :type/ISO8601DateTimeString"
    (testing "return as dates"
      (mt/test-drivers (mt/normal-drivers)
        (mt/dataset string-times
          (let [query (iso-8601-text-fields-query driver/*driver*)]
            (mt/with-native-query-testing-context query
              (is (= (iso-8601-text-fields-expected-rows driver/*driver*)
                     ;; string-times dataset has three text fields, ts, d, t for timestamp, date, and time
                     (mt/rows (qp/process-query query)))))))))))

(defmethod driver/database-supports? [::driver/driver ::iso-8601-test-fields-are-queryable]
  [_driver _feature _database]
  true)

;;; TODO: why does this fail on oracle? gives a NPE
(doseq [driver [:oracle :sparksql]]
  (defmethod driver/database-supports? [driver ::iso-8601-test-fields-are-queryable]
    [_driver _feature _database]
    false))

(defmulti iso-8601-text-fields-should-be-queryable-datetime-test-query
  "Query to run for [[iso-8601-text-fields-should-be-queryable-datetime-test]]."
  {:arglists '([driver])}
  mt/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod iso-8601-text-fields-should-be-queryable-datetime-test-query :default
  [_driver]
  (mt/mbql-query times
    {:filter [:= !day.ts "2008-10-19"]}))

(defmethod iso-8601-text-fields-should-be-queryable-datetime-test-query :mongo
  [_driver]
  (mt/mbql-query times
    {:filter [:= !day.ts "2008-10-19"]
     :fields [$ts]}))

(deftest ^:parallel iso-8601-text-fields-should-be-queryable-datetime-test
  (testing "text fields with semantic_type :type/ISO8601DateTimeString"
    (testing "are queryable as dates"
      (mt/dataset string-times
        (testing "a datetime field"
          (mt/test-drivers (mt/normal-drivers-with-feature ::iso-8601-test-fields-are-queryable)
            (let [query (iso-8601-text-fields-should-be-queryable-datetime-test-query driver/*driver*)]
              (mt/with-native-query-testing-context query
                (is (= 1
                       (->> (qp/process-query query)
                            mt/rows
                            count)))))))))))

(defmethod driver/database-supports? [::driver/driver ::parse-string-to-date]
  [_driver _feature _database]
  true)

;;; MongoDB does not support parsing strings as dates
(defmethod driver/database-supports? [:mongo ::parse-string-to-date]
  [_driver _feature _database]
  false)

(deftest ^:parallel iso-8601-text-fields-should-be-queryable-date-test
  (testing "text fields with semantic_type :type/ISO8601DateTimeString"
    (testing "are queryable as dates"
      (mt/dataset string-times
        (testing "a date field"
          (mt/test-drivers (mt/normal-drivers-with-feature ::iso-8601-test-fields-are-queryable ::parse-string-to-date)
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

;;; by default, run the test below against drivers that implement [[sql.qp/cast-temporal-byte]] for
;;; `:Coercion/YYYYMMDDHHMMSSBytes->Temporal` are
(defmethod driver/database-supports? [::driver/driver ::yyyymmddhhss-binary-timestamps]
  [_driver _feature _database]
  false)

(defmethod driver/database-supports? [:sql-jdbc ::yyyymmddhhss-binary-timestamps]
  [driver _feature _database]
  (not= (get-method sql.qp/cast-temporal-byte [driver :Coercion/YYYYMMDDHHMMSSBytes->Temporal])
        (get-method sql.qp/cast-temporal-byte :default)))

;;; Currently broken for Presto. See #46848
(defmethod driver/database-supports? [:presto-jdbc ::yyyymmddhhss-binary-timestamps]
  [_driver _feature _database]
  false)

;;; Not working for Redshift either. See #46850
(defmethod driver/database-supports? [:redshift ::yyyymmddhhss-binary-timestamps]
  [_driver _feature _database]
  false)

(defmulti yyyymmddhhmmss-binary-dates-expected-rows
  "Expected rows for the [[yyyymmddhhmmss-binary-dates]] test below."
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod yyyymmddhhmmss-binary-dates-expected-rows :default
  [_driver]
  [])

(doseq [driver [:h2 :postgres]]
  (defmethod yyyymmddhhmmss-binary-dates-expected-rows driver
    [_driver]
    [[1 "foo" (OffsetDateTime/from #t "2019-04-21T16:43Z")]
     [2 "bar" (OffsetDateTime/from #t "2020-04-21T16:43Z")]
     [3 "baz" (OffsetDateTime/from #t "2021-04-21T16:43Z")]]))

(doseq [driver [:mysql :sqlserver]]
  (defmethod yyyymmddhhmmss-binary-dates-expected-rows driver
    [_driver]
    [[1 "foo" #t "2019-04-21T16:43"]
     [2 "bar" #t "2020-04-21T16:43"]
     [3 "baz" #t "2021-04-21T16:43"]]))

(deftest ^:parallel yyyymmddhhmmss-binary-dates
  (mt/test-drivers (mt/normal-drivers-with-feature ::yyyymmddhhss-binary-timestamps)
    (is (= (yyyymmddhhmmss-binary-dates-expected-rows driver/*driver*)
           (sort-by
            first
            (mt/rows (mt/dataset yyyymmddhhss-binary-times
                       (qp/process-query
                        (assoc (mt/mbql-query times)
                               :middleware {:format-rows? false})))))))))

(defmethod driver/database-supports? [::driver/driver ::yyyymmddhhss-string-timestamps]
  [_driver _feature _database]
  false)

;;; TODO -- it would be better if we just made this feature `true` by default and opted out for the drivers that DO NOT
;;; support this feature. That way new drivers get the test automatically without having to opt in.
(doseq [driver #{:mongo :oracle :postgres :h2 :mysql :bigquery-cloud-sdk :snowflake :redshift :sqlserver}]
  (defmethod driver/database-supports? [driver ::yyyymmddhhss-string-timestamps]
    [_driver _feature _database]
    true))

(defmulti yyyymmddhhmmss-dates-expected-rows
  "Expected rows for the [[yyyymmddhhmmss-dates]] test below."
  {:arglists '([driver])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod yyyymmddhhmmss-dates-expected-rows :mongo
  [_driver]
  [[1 "foo" (.toInstant #t "2019-04-21T16:43:00Z")]
   [2 "bar" (.toInstant #t "2020-04-21T16:43:00Z")]
   [3 "baz" (.toInstant #t "2021-04-21T16:43:00Z")]])

(doseq [driver [:mysql :sqlserver :bigquery-cloud-sdk]]
  (defmethod yyyymmddhhmmss-dates-expected-rows driver
    [_driver]
    [[1 "foo" #t "2019-04-21T16:43"]
     [2 "bar" #t "2020-04-21T16:43"]
     [3 "baz" #t "2021-04-21T16:43"]]))

(defmethod yyyymmddhhmmss-dates-expected-rows :redshift
  [_driver]
  [[1 "foo" #t "2019-04-21T16:43Z[UTC]"]
   [2 "bar" #t "2020-04-21T16:43Z[UTC]"]
   [3 "baz" #t "2021-04-21T16:43Z[UTC]"]])

(doseq [driver [:h2 :postgres]]
  (defmethod yyyymmddhhmmss-dates-expected-rows driver
    [_driver]
    [[1 "foo" (OffsetDateTime/from #t "2019-04-21T16:43Z")]
     [2 "bar" (OffsetDateTime/from #t "2020-04-21T16:43Z")]
     [3 "baz" (OffsetDateTime/from #t "2021-04-21T16:43Z")]]))

(defmethod yyyymmddhhmmss-dates-expected-rows :oracle
  [_driver]
  [[1M "foo" #t "2019-04-21T16:43"]
   [2M "bar" #t "2020-04-21T16:43"]
   [3M "baz" #t "2021-04-21T16:43"]])

(defmethod yyyymmddhhmmss-dates-expected-rows :snowflake
  [_driver]
  [[1 "foo" #t "2609-10-23T10:19:24.300"]
   [2 "bar" #t "2610-02-16T04:06:04.300"]
   [3 "baz" #t "2610-06-11T21:52:44.300"]])

(deftest ^:parallel yyyymmddhhmmss-dates
  (mt/test-drivers (mt/normal-drivers-with-feature ::yyyymmddhhss-string-timestamps)
    (mt/dataset yyyymmddhhss-times
      (is (= (yyyymmddhhmmss-dates-expected-rows driver/*driver*)
             ;; string-times dataset has three text fields, ts, d, t for timestamp, date, and time
             (sort-by
              first
              (mt/rows (qp/process-query
                        (assoc (mt/mbql-query times)
                               :middleware {:format-rows? false})))))))))
