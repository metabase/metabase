(ns metabase.driver.clickhouse-data-types-test
  #_{:clj-kondo/ignore [:unsorted-required-namespaces]}
  (:require [cljc.java-time.local-date :as local-date]
            [cljc.java-time.local-date-time :as local-date-time]
            [clojure.test :refer :all]
            [metabase.query-processor.test-util :as qp.test]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.data.clickhouse :as ctd]
            [metabase.test.data.interface :as tx]))

(use-fixtures :once ctd/create-test-db!)

(deftest ^:parallel clickhouse-decimals
  (mt/test-driver
    :clickhouse
    (data/dataset
      (tx/dataset-definition "mbt"
                             ["decimals"
                              [{:field-name "my_money"
                                :base-type {:native "Decimal(12,4)"}}]
                              [[1.0] [23.1337] [42.0] [42.0]]])
      (testing "simple division"
        (is
         (= 21.0
            (-> (data/run-mbql-query decimals
                  {:expressions {:divided [:/ $my_money 2]}
                   :filter [:> [:expression :divided] 1.0]
                   :breakout [[:expression :divided]]
                   :order-by [[:desc [:expression :divided]]]
                   :limit 1})
                qp.test/first-row last float))))
      (testing "divided decimal precision"
        (is
         (= 1.8155331831916208
            (-> (data/run-mbql-query decimals
                  {:expressions {:divided [:/ 42 $my_money]}
                   :filter [:= $id 2]
                   :limit 1})
                qp.test/first-row last double)))))))

(deftest ^:parallel clickhouse-array-string
  (mt/test-driver
    :clickhouse
    (is
     (= "[foo, bar]"
        (-> (data/dataset
              (tx/dataset-definition "metabase_tests_array_string"
                                     ["test-data-array-string"
                                      [{:field-name "my_array"
                                        :base-type {:native "Array(String)"}}]
                                      [[(into-array (list "foo" "bar"))]]])
              (data/run-mbql-query test-data-array-string {:limit 1}))
            qp.test/first-row
            last)))))

(deftest ^:parallel clickhouse-array-uint64
  (mt/test-driver
    :clickhouse
    (is
     (= "[23, 42]"
        (-> (data/dataset
              (tx/dataset-definition "metabase_tests_array_uint"
                                     ["test-data-array-uint64"
                                      [{:field-name "my_array"
                                        :base-type {:native "Array(UInt64)"}}]
                                      [[(into-array (list 23 42))]]])
              (data/run-mbql-query test-data-array-uint64 {:limit 1}))
            qp.test/first-row
            last)))))

(deftest ^:parallel clickhouse-array-of-arrays
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array (list
                            (into-array (list "foo" "bar"))
                            (into-array (list "qaz" "qux"))))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_arrays"
                                                ["test-data-array-of-arrays"
                                                 [{:field-name "my_array_of_arrays"
                                                   :base-type {:native "Array(Array(String))"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-arrays {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[[foo, bar], [qaz, qux]]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-low-cardinality-array
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array (list "foo" "bar"))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_low_cardinality_array"
                                                ["test-data-low-cardinality-array"
                                                 [{:field-name "my_low_card_array"
                                                   :base-type {:native "Array(LowCardinality(String))"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-low-cardinality-array {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[foo, bar]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-nullables
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array (list "foo" nil "bar"))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_nullables"
                                                ["test-data-array-of-nullables"
                                                 [{:field-name "my_array_of_nullables"
                                                   :base-type {:native "Array(Nullable(String))"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-nullables {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[foo, null, bar]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-booleans
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array (list true false true))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_booleans"
                                                ["test-data-array-of-booleans"
                                                 [{:field-name "my_array_of_booleans"
                                                   :base-type {:native "Array(Boolean)"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-booleans {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[true, false, true]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-nullable-booleans
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array (list true false nil))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_nullable_booleans"
                                                ["test-data-array-of-booleans"
                                                 [{:field-name "my_array_of_nullable_booleans"
                                                   :base-type {:native "Array(Nullable(Boolean))"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-booleans {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[true, false, null]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-uint8
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array (list 42 100 2))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_uint8"
                                                ["test-data-array-of-uint8"
                                                 [{:field-name "my_array_of_uint8"
                                                   :base-type {:native "Array(UInt8)"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-uint8 {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[42, 100, 2]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-floats
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array (list 1.2 3.4))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_floats"
                                                ["test-data-array-of-floats"
                                                 [{:field-name "my_array_of_floats"
                                                   :base-type {:native "Array(Float64)"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-floats {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[1.2, 3.4]"], ["[]"]] result)))))

;; NB: timezones in the formatted string are purely cosmetic; it will be fine on the UI
(deftest ^:parallel clickhouse-array-of-dates
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array
                (list
                 (local-date/parse "2022-12-06")
                 (local-date/parse "2021-10-19")))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_dates"
                                                ["test-data-array-of-dates"
                                                 [{:field-name "my_array_of_dates"
                                                   :base-type {:native "Array(Date)"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-dates {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[2022-12-06T00:00Z[UTC], 2021-10-19T00:00Z[UTC]]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-date32
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array
                (list
                 (local-date/parse "2122-12-06")
                 (local-date/parse "2099-10-19")))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_date32"
                                                ["test-data-array-of-date32"
                                                 [{:field-name "my_array_of_date32"
                                                   :base-type {:native "Array(Date32)"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-date32 {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[2122-12-06T00:00Z[UTC], 2099-10-19T00:00Z[UTC]]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-datetime
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array
                (list
                 (local-date-time/parse "2022-12-06T18:28:31")
                 (local-date-time/parse "2021-10-19T13:12:44")))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_datetime"
                                                ["test-data-array-of-datetime"
                                                 [{:field-name "my_array_of_datetime"
                                                   :base-type {:native "Array(DateTime)"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-datetime {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[2022-12-06T18:28:31Z[UTC], 2021-10-19T13:12:44Z[UTC]]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-datetime64
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array
                (list
                 (local-date-time/parse "2022-12-06T18:28:31.123")
                 (local-date-time/parse "2021-10-19T13:12:44.456")))
          row2 (into-array nil)
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_datetime64"
                                                ["test-data-array-of-datetime64"
                                                 [{:field-name "my_array_of_datetime64"
                                                   :base-type {:native "Array(DateTime64(3))"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-datetime64 {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[2022-12-06T18:28:31.123Z[UTC], 2021-10-19T13:12:44.456Z[UTC]]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-decimals
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array (list "12345123.123456789" "78.245"))
          row2 nil
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_decimals"
                                                ["test-data-array-of-decimals"
                                                 [{:field-name "my_array_of_decimals"
                                                   :base-type {:native "Array(Decimal(18, 9))"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-decimals {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[12345123.123456789, 78.245000000]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-of-tuples
  (mt/test-driver
    :clickhouse
    (is (= [["[[foobar, 1234], [qaz, 0]]"]
            ["[]"]]
           (qp.test/formatted-rows
            [str]
            :format-nil-values
            (ctd/do-with-test-db
             (fn [db]
               (data/with-db db
                 (data/run-mbql-query
                   array_of_tuples_test
                   {})))))))))

(deftest ^:parallel clickhouse-array-of-uuids
  (mt/test-driver
    :clickhouse
    (let [row1 (into-array (list "2eac427e-7596-11ed-a1eb-0242ac120002"
                                 "2eac44f4-7596-11ed-a1eb-0242ac120002"))
          row2 nil
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_array_of_uuids"
                                                ["test-data-array-of-uuids"
                                                 [{:field-name "my_array_of_uuids"
                                                   :base-type {:native "Array(UUID)"}}]
                                                 [[row1] [row2]]])
                         (data/run-mbql-query test-data-array-of-uuids {}))
          result (ctd/rows-without-index query-result)]
      (is (= [["[2eac427e-7596-11ed-a1eb-0242ac120002, 2eac44f4-7596-11ed-a1eb-0242ac120002]"], ["[]"]] result)))))

(deftest ^:parallel clickhouse-array-inner-types
  (mt/test-driver
    :clickhouse
    (is (= [["[a, b, c]"
             "[null, d, e]"
             "[1.0000, 2.0000, 3.0000]"
             "[4.0000, null, 5.0000]"]]
           (ctd/do-with-test-db
            (fn [db]
              (data/with-db db
                (->> (data/run-mbql-query arrays_inner_types {})
                     (mt/formatted-rows [str str str str])))))))))

(deftest ^:parallel clickhouse-nullable-strings
  (mt/test-driver
    :clickhouse
    (data/dataset
      (tx/dataset-definition
       "metabase_tests_nullable_strings"
       ["test-data-nullable-strings"
        [{:field-name "mystring" :base-type :type/Text}]
        [["foo"] ["bar"] ["   "] [""] [nil]]])
      (testing "null strings count"
        (is (= 2M ;; BigDecimal
               (-> (data/run-mbql-query test-data-nullable-strings
                     {:filter [:is-null $mystring]
                      :aggregation [:count]})
                   qp.test/first-row last))))
      (testing "nullable strings not null filter"
        (is (= 3M
               (-> (data/run-mbql-query test-data-nullable-strings
                     {:filter [:not-null $mystring]
                      :aggregation [:count]})
                   qp.test/first-row last))))
      (testing "filter nullable string by value"
        (is (= 1M
               (-> (data/run-mbql-query test-data-nullable-strings
                     {:filter [:= $mystring "foo"]
                      :aggregation [:count]})
                   qp.test/first-row last)))))))

(deftest ^:parallel clickhouse-non-latin-strings
  (mt/test-driver
    :clickhouse
    (testing "basic filtering"
      (is (= [[1 "Я_1"] [3 "Я_2"] [4 "Я"]]
             (qp.test/formatted-rows
              [int str]
              :format-nil-values
              (ctd/do-with-test-db
               (fn [db]
                 (data/with-db db
                   (data/run-mbql-query
                     metabase_test_lowercases
                     {:filter [:contains $mystring "Я"]}))))))))
    (testing "case-insensitive non-latin filtering"
      (is (= [[1 "Я_1"] [3 "Я_2"] [4 "Я"] [5 "я"]]
             (qp.test/formatted-rows
              [int str]
              :format-nil-values
              (ctd/do-with-test-db
               (fn [db]
                 (data/with-db db
                   (data/run-mbql-query
                     metabase_test_lowercases
                     {:filter [:contains $mystring "Я"
                               {:case-sensitive false}]}))))))))))

(deftest ^:parallel clickhouse-datetime64-filter
  (mt/test-driver
    :clickhouse
    (let [row1 "2022-03-03 03:03:03.333"
          row2 "2022-03-03 03:03:03.444"
          row3 "2022-03-03 03:03:03"
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_datetime64"
                                                ["test-data-datetime64"
                                                 [{:field-name "milli_sec"
                                                   :base-type {:native "DateTime64(3)"}}]
                                                 [[row1] [row2] [row3]]])
                         (data/run-mbql-query test-data-datetime64 {:filter [:= $milli_sec "2022-03-03T03:03:03.333Z"]}))
          result (ctd/rows-without-index query-result)]
      (is (= [["2022-03-03T03:03:03.333Z"]] result)))))

(deftest ^:parallel clickhouse-datetime-filter
  (mt/test-driver
    :clickhouse
    (let [row1 "2022-03-03 03:03:03"
          row2 "2022-03-03 03:03:04"
          row3 "2022-03-03 03:03:05"
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_datetime"
                                                ["test-data-datetime"
                                                 [{:field-name "second"
                                                   :base-type {:native "DateTime"}}]
                                                 [[row1] [row2] [row3]]])
                         (data/run-mbql-query test-data-datetime {:filter [:= $second "2022-03-03T03:03:04Z"]}))
          result (ctd/rows-without-index query-result)]
      (is (= [["2022-03-03T03:03:04Z"]] result)))))

(deftest ^:parallel clickhouse-booleans
  (mt/test-driver
    :clickhouse
    (let [[row1 row2 row3 row4] [["#1" true] ["#2" false] ["#3" false] ["#4" true]]
          query-result (data/dataset
                         (tx/dataset-definition "metabase_tests_booleans"
                                                ["test-data-booleans"
                                                 [{:field-name "name"
                                                   :base-type :type/Text}
                                                  {:field-name "is_active"
                                                   :base-type :type/Boolean}]
                                                 [row1 row2 row3 row4]])
                         (data/run-mbql-query test-data-booleans {:filter [:= $is_active false]}))
          rows (qp.test/rows query-result)
          result (map #(drop 1 %) rows)] ; remove db "index" which is the first column in the result set
      (is (= [row2 row3] result)))))

(deftest ^:parallel clickhouse-enums-values-test
  (mt/test-driver
    :clickhouse
    (testing "select enums values as strings"
      (is (= [["foo" "house" "qaz"]
              ["foo bar" "click" "qux"]
              ["bar" "house" "qaz"]]
             (qp.test/formatted-rows
              [str str str]
              :format-nil-values
              (ctd/do-with-test-db
               (fn [db]
                 (data/with-db db
                   (data/run-mbql-query
                     enums_test
                     {}))))))))
    (testing "filtering enum values"
      (is (= [["useqa"]]
             (qp.test/formatted-rows
              [str]
              :format-nil-values
              (ctd/do-with-test-db
               (fn [db]
                 (data/with-db db
                   (data/run-mbql-query
                     enums_test
                     {:expressions {"test" [:concat
                                            [:substring $enum2 3 3]
                                            [:substring $enum3 1 2]]}
                      :fields [[:expression "test"]]
                      :filter [:= $enum1 "foo"]}))))))))))

(deftest ^:parallel clickhouse-ipv4query-test
  (mt/test-driver
    :clickhouse
    (is (= [[1]]
           (qp.test/formatted-rows
            [int]
            :format-nil-values
            (ctd/do-with-test-db
             (fn [db]
               (data/with-db db
                 (data/run-mbql-query
                   ipaddress_test
                   {:filter [:= $ipvfour "127.0.0.1"]
                    :aggregation [[:count]]})))))))))

(deftest ^:parallel clickhouse-ip-serialization-test
  (mt/test-driver
    :clickhouse
    (is (= [["127.0.0.1" "0:0:0:0:0:0:0:1"]
            ["0.0.0.0" "2001:438:ffff:0:0:0:407d:1bc1"]
            [nil nil]]
           (qp.test/formatted-rows
            [str str]
            (ctd/do-with-test-db
             (fn [db] (data/with-db db (data/run-mbql-query ipaddress_test {})))))))))

(defn- map-as-string [^java.util.LinkedHashMap m] (.toString m))
(deftest ^:parallel clickhouse-simple-map-test
  (mt/test-driver
    :clickhouse
    (is (= [["{key1=1, key2=10}"] ["{key1=2, key2=20}"] ["{key1=3, key2=30}"]]
           (qp.test/formatted-rows
            [map-as-string]
            :format-nil-values
            (ctd/do-with-test-db
             (fn [db]
               (data/with-db db
                 (data/run-mbql-query
                   maps_test
                   {})))))))))

(deftest ^:parallel clickhouse-datetime-diff-nullable
  (mt/test-driver
    :clickhouse
    (is (= [[170 202] [nil nil] [nil nil] [nil nil]]
           (ctd/do-with-test-db
            (fn [db]
              (data/with-db db
                (->> (data/run-mbql-query
                       datetime_diff_nullable
                       {:fields [[:expression "dt64,dt"]
                                 [:expression "dt64,d"]]
                        :expressions
                        {"dt64,dt" [:datetime-diff $dt64 $dt :day]
                         "dt64,d"  [:datetime-diff $dt64 $d  :day]}})
                     (mt/formatted-rows [int int])))))))))

;; Metabase has pretty extensive testing for sum-where and count-where
;; However, this ClickHouse-specific corner case is not covered
(deftest ^:parallel clickhouse-sum-where-numeric-types
  (mt/test-driver
    :clickhouse
    (testing "int values (with matching rows)"
      (is (= [[8]]
             (qp.test/formatted-rows
              [int]
              :format-nil-values
              (ctd/do-with-test-db
               (fn [db]
                 (data/with-db db
                   (data/run-mbql-query
                     sum_if_test_int
                     {:aggregation [[:sum-where $int_value [:= $discriminator "bar"]]]}))))))))
    (testing "int values (no matching rows)"
      (is (= [[0]]
             (qp.test/formatted-rows
              [int]
              :format-nil-values
              (ctd/do-with-test-db
               (fn [db]
                 (data/with-db db
                   (data/run-mbql-query
                     sum_if_test_int
                     {:aggregation [[:sum-where $int_value [:= $discriminator "qaz"]]]}))))))))
    (testing "double values (with matching rows)"
      (is (= [[9.27]]
             (qp.test/formatted-rows
              [double]
              :format-nil-values
              (ctd/do-with-test-db
               (fn [db]
                 (data/with-db db
                   (data/run-mbql-query
                     sum_if_test_float
                     {:aggregation [[:sum-where $float_value [:= $discriminator "bar"]]]}))))))))
    (testing "double values (no matching rows)"
      (is (= [[0.0]]
             (qp.test/formatted-rows
              [double]
              :format-nil-values
              (ctd/do-with-test-db
               (fn [db]
                 (data/with-db db
                   (data/run-mbql-query
                     sum_if_test_float
                     {:aggregation [[:sum-where $float_value [:= $discriminator "qaz"]]]}))))))))))

(deftest ^:parallel clickhouse-unsigned-integers
  (mt/test-driver
    :clickhouse
    (is (= [["255" "65535" "4294967295" "18446744073709551615"]]
           (qp.test/formatted-rows
            [str str str str]
            :format-nil-values
            (ctd/do-with-test-db
             (fn [db]
               (data/with-db db
                 (data/run-mbql-query
                   unsigned_int_types
                   {})))))))))
