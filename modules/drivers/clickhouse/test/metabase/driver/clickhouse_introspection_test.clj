(ns ^:mb/driver-tests metabase.driver.clickhouse-introspection-test
  #_{:clj-kondo/ignore [:unsorted-required-namespaces]}
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.clickhouse :as ctd]
   [metabase.test.data.interface :as tx]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- desc-table!
  [table-name]
  (into #{} (map #(select-keys % [:name :database-type :base-type :database-required])
                 (:fields (ctd/do-with-test-db!
                           #(driver/describe-table :clickhouse % {:name table-name}))))))

(deftest clickhouse-base-types-test-enums
  (mt/test-driver
    :clickhouse
    (testing "enums"
      (let [table-name "enums_base_types"]
        (is (= #{{:base-type :type/Text,
                  :database-required false,
                  :database-type "Nullable(Enum8('America/New_York' = 1))",
                  :name "c1"}
                 {:base-type :type/Text,
                  :database-required true,
                  :database-type "Enum8('BASE TABLE' = 1, 'VIEW' = 2, 'FOREIGN TABLE' = 3, 'LOCAL TEMPORARY' = 4, 'SYSTEM VIEW' = 5)",
                  :name "c2"}
                 {:base-type :type/Text,
                  :database-required true,
                  :database-type "Enum8('NO' = 1, 'YES' = 2)",
                  :name "c3"}
                 {:base-type :type/Text,
                  :database-required true,
                  :database-type "Enum16('SHOW DATABASES' = 0, 'SHOW TABLES' = 1, 'SHOW COLUMNS' = 2)",
                  :name "c4"}
                 {:base-type :type/Text,
                  :database-required false,
                  :database-type "Nullable(Enum8('GLOBAL' = 0, 'DATABASE' = 1, 'TABLE' = 2))",
                  :name "c5"}
                 {:base-type :type/Text,
                  :database-required false,
                  :database-type "Nullable(Enum16('SHOW DATABASES' = 0, 'SHOW TABLES' = 1, 'SHOW COLUMNS' = 2))",
                  :name "c6"}}
               (desc-table! table-name)))))))

(deftest clickhouse-base-types-test-dates
  (mt/test-driver
    :clickhouse
    (testing "dates"
      (let [table-name "date_base_types"]
        (is (= #{{:base-type :type/Date,
                  :database-required true,
                  :database-type "Date",
                  :name "c1"}
                 {:base-type :type/Date,
                  :database-required true,
                  :database-type "Date32",
                  :name "c2"}
                 {:base-type :type/Date,
                  :database-required false,
                  :database-type "Nullable(Date)",
                  :name "c3"}
                 {:base-type :type/Date,
                  :database-required false,
                  :database-type "Nullable(Date32)",
                  :name "c4"}}
               (desc-table! table-name)))))))

(deftest clickhouse-base-types-test-datetimes
  (mt/test-driver
    :clickhouse
    (testing "datetimes"
      (let [table-name "datetime_base_types"]
        (is (= #{{:base-type :type/DateTimeWithLocalTZ,
                  :database-required false,
                  :database-type "Nullable(DateTime('America/New_York'))",
                  :name "c1"}
                 {:base-type :type/DateTimeWithLocalTZ,
                  :database-required true,
                  :database-type "DateTime('America/New_York')",
                  :name "c2"}
                 {:base-type :type/DateTimeWithLocalTZ,
                  :database-required true,
                  :database-type "DateTime",
                  :name "c3"}
                 {:base-type :type/DateTimeWithLocalTZ,
                  :database-required true,
                  :database-type "DateTime64(3)",
                  :name "c4"}
                 {:base-type :type/DateTimeWithLocalTZ,
                  :database-required true,
                  :database-type "DateTime64(9, 'America/New_York')",
                  :name "c5"}
                 {:base-type :type/DateTimeWithLocalTZ,
                  :database-required false,
                  :database-type "Nullable(DateTime64(6, 'America/New_York'))",
                  :name "c6"}
                 {:base-type :type/DateTimeWithLocalTZ,
                  :database-required false,
                  :database-type "Nullable(DateTime64(0))",
                  :name "c7"}
                 {:base-type :type/DateTimeWithLocalTZ,
                  :database-required false,
                  :database-type "Nullable(DateTime)",
                  :name "c8"}}
               (desc-table! table-name)))))))

(deftest clickhouse-base-types-test-integers
  (mt/test-driver
    :clickhouse
    (testing "integers"
      (let [table-name "integer_base_types"]
        (is (= #{{:base-type :type/Integer,
                  :database-required true,
                  :database-type "UInt8",
                  :name "c1"}
                 {:base-type :type/Integer,
                  :database-required true,
                  :database-type "UInt16",
                  :name "c2"}
                 {:base-type :type/Integer,
                  :database-required true,
                  :database-type "UInt32",
                  :name "c3"}
                 {:base-type :type/BigInteger,
                  :database-required true,
                  :database-type "UInt64",
                  :name "c4"}
                 {:base-type :type/*,
                  :database-required true,
                  :database-type "UInt128",
                  :name "c5"}
                 {:base-type :type/*,
                  :database-required true,
                  :database-type "UInt256",
                  :name "c6"}
                 {:base-type :type/Integer,
                  :database-required true,
                  :database-type "Int8",
                  :name "c7"}
                 {:base-type :type/Integer,
                  :database-required true,
                  :database-type "Int16",
                  :name "c8"}
                 {:base-type :type/Integer,
                  :database-required true,
                  :database-type "Int32",
                  :name "c9"}
                 {:base-type :type/BigInteger,
                  :database-required true,
                  :database-type "Int64",
                  :name "c10"}
                 {:base-type :type/*,
                  :database-required true,
                  :database-type "Int128",
                  :name "c11"}
                 {:base-type :type/*,
                  :database-required true,
                  :database-type "Int256",
                  :name "c12"}
                 {:base-type :type/Integer,
                  :database-required false,
                  :database-type "Nullable(Int32)",
                  :name "c13"}}
               (desc-table! table-name)))))))

(deftest clickhouse-base-types-test-numerics
  (mt/test-driver
    :clickhouse
    (testing "numerics"
      (let [table-name "numeric_base_types"]
        (is (= #{{:base-type :type/Float,
                  :database-required true,
                  :database-type "Float32",
                  :name "c1"}
                 {:base-type :type/Float,
                  :database-required true,
                  :database-type "Float64",
                  :name "c2"}
                 {:base-type :type/Decimal,
                  :database-required true,
                  :database-type "Decimal(4, 2)",
                  :name "c3"}
                 {:base-type :type/Decimal,
                  :database-required true,
                  :database-type "Decimal(9, 7)",
                  :name "c4"}
                 {:base-type :type/Decimal,
                  :database-required true,
                  :database-type "Decimal(18, 12)",
                  :name "c5"}
                 {:base-type :type/Decimal,
                  :database-required true,
                  :database-type "Decimal(38, 24)",
                  :name "c6"}
                 {:base-type :type/Decimal,
                  :database-required true,
                  :database-type "Decimal(76, 42)",
                  :name "c7"}
                 {:base-type :type/Float,
                  :database-required false,
                  :database-type "Nullable(Float32)",
                  :name "c8"}
                 {:base-type :type/Decimal,
                  :database-required false,
                  :database-type "Nullable(Decimal(4, 2))",
                  :name "c9"}
                 {:base-type :type/Decimal,
                  :database-required false,
                  :database-type "Nullable(Decimal(76, 42))",
                  :name "c10"}}
               (desc-table! table-name)))))))

(deftest clickhouse-base-types-test-strings
  (mt/test-driver
    :clickhouse
    (testing "strings"
      (let [table-name "string_base_types"]
        (is (= #{{:base-type :type/Text,
                  :database-required true,
                  :database-type "String",
                  :name "c1"}
                 {:base-type :type/Text,
                  :database-required true,
                  :database-type "LowCardinality(String)",
                  :name "c2"}
                 {:base-type :type/TextLike,
                  :database-required true,
                  :database-type "FixedString(32)",
                  :name "c3"}
                 {:base-type :type/Text,
                  :database-required false,
                  :database-type "Nullable(String)",
                  :name "c4"}
                 {:base-type :type/TextLike,
                  :database-required true,
                  :database-type "LowCardinality(FixedString(4))",
                  :name "c5"}}
               (desc-table! table-name)))))))

(deftest clickhouse-base-types-test-arrays
  (mt/test-driver
    :clickhouse
    (testing "arrays"
      (let [table-name "array_base_types"]
        (is (= #{{:base-type :type/Array,
                  :database-required true,
                  :database-type "Array(String)",
                  :name "c1"}
                 {:base-type :type/Array,
                  :database-required true,
                  :database-type "Array(Nullable(Int32))",
                  :name "c2"}
                 {:base-type :type/Array,
                  :database-required true,
                  :database-type "Array(Array(LowCardinality(FixedString(32))))",
                  :name "c3"}
                 {:base-type :type/Array,
                  :database-required true,
                  :database-type "Array(Array(Array(String)))",
                  :name "c4"}}
               (desc-table! table-name)))))))

(deftest clickhouse-base-types-test-low-cardinality-nullable
  (mt/test-driver
    :clickhouse
    (testing "low cardinality nullable"
      (let [table-name "low_cardinality_nullable_base_types"]
        (is (= #{{:base-type :type/Text,
                  :database-required true,
                  :database-type "LowCardinality(Nullable(String))",
                  :name "c1"}
                 {:base-type :type/TextLike,
                  :database-required true,
                  :database-type "LowCardinality(Nullable(FixedString(16)))",
                  :name "c2"}}
               (desc-table! table-name)))))))

(deftest clickhouse-base-types-test-misc
  (mt/test-driver
    :clickhouse
    (testing "everything else"
      (let [table-name "misc_base_types"]
        (is (= #{{:base-type :type/Boolean,
                  :database-required true,
                  :database-type "Bool",
                  :name "c1"}
                 {:base-type :type/UUID,
                  :database-required true,
                  :database-type "UUID",
                  :name "c2"}
                 {:base-type :type/IPAddress,
                  :database-required true,
                  :database-type "IPv4",
                  :name "c3"}
                 {:base-type :type/IPAddress,
                  :database-required true,
                  :database-type "IPv6",
                  :name "c4"}
                 {:base-type :type/Dictionary,
                  :database-required true,
                  :database-type "Map(Int32, String)",
                  :name "c5"}
                 {:base-type :type/Boolean,
                  :database-required false,
                  :database-type "Nullable(Bool)",
                  :name "c6"}
                 {:base-type :type/UUID,
                  :database-required false,
                  :database-type "Nullable(UUID)",
                  :name "c7"}
                 {:base-type :type/IPAddress,
                  :database-required false,
                  :database-type "Nullable(IPv4)",
                  :name "c8"}
                 {:base-type :type/IPAddress,
                  :database-required false,
                  :database-type "Nullable(IPv6)",
                  :name "c9"}
                 {:base-type :type/*,
                  :database-required true,
                  :database-type "Tuple(String, Int32)",
                  :name "c10"}}
               (desc-table! table-name)))))))

(deftest ^:parallel clickhouse-boolean-type-metadata
  (mt/test-driver
    :clickhouse
    (let [result      (-> {:query "SELECT false, 123, true"} mt/native-query qp/process-query)
          [[c1 _ c3]] (-> result qp.test/rows)]
      (testing "column should be of type :type/Boolean"
        (is (= :type/Boolean (-> result :data :results_metadata :columns first :base_type)))
        (is (= :type/Boolean (transduce identity (driver.common/values->base-type) [c1, c3])))
        (is (= :type/Boolean (driver.common/class->base-type (class c1))))))))

(def ^:private base-field
  {:database-is-auto-increment false
   :json-unfolding false
   :database-required true})

(deftest clickhouse-filtered-aggregate-functions-test-table-metadata
  (mt/test-driver
    :clickhouse
    (is (= {:name "aggregate_functions_filter_test"
            :fields #{(merge base-field
                             {:name "idx"
                              :database-type "UInt8"
                              :base-type :type/Integer
                              :database-position 0})
                      (merge base-field
                             {:name "lowest_value"
                              :database-type "SimpleAggregateFunction(min, UInt8)"
                              :base-type :type/Integer
                              :database-position 2})
                      (merge base-field
                             {:name "count"
                              :database-type "SimpleAggregateFunction(sum, Int64)"
                              :base-type :type/BigInteger
                              :database-position 3})}}
           (ctd/do-with-test-db!
            (fn [db]
              (driver/describe-table :clickhouse db {:name "aggregate_functions_filter_test"})))))))

(deftest clickhouse-filtered-aggregate-functions-test-result-set
  (mt/test-driver
    :clickhouse
    (is (= [[42 144 255255]]
           (qp.test/formatted-rows
            [int int int]
            :format-nil-values
            (ctd/do-with-test-db!
             (fn [db]
               (data/with-db db
                 (data/run-mbql-query
                   aggregate_functions_filter_test
                   {})))))))))

(def ^:private test-tables
  #{{:description nil,
     :name "table1",
     :schema "metabase_db_scan_test"}
    {:description nil,
     :name "table2",
     :schema "metabase_db_scan_test"}})

(deftest ^:parallel clickhouse-describe-database-single
  (mt/test-driver
    :clickhouse
    (t2.with-temp/with-temp
      [:model/Database db {:engine :clickhouse
                           :details (merge {:scan-all-databases nil}
                                           (tx/dbdef->connection-details
                                            :clickhouse :db
                                            {:database-name "metabase_db_scan_test"}))}]
      (let [describe-result (driver/describe-database :clickhouse db)]
        (is (= {:tables test-tables} describe-result))))))

(deftest ^:parallel clickhouse-describe-database-all
  (mt/test-driver
    :clickhouse
    (t2.with-temp/with-temp
      [:model/Database db {:engine :clickhouse
                           :details (merge {:scan-all-databases true}
                                           (tx/dbdef->connection-details
                                            :clickhouse :db
                                            {:database-name "default"}))}]
      (let [describe-result (driver/describe-database :clickhouse db)]
        ;; check the existence of at least some test tables here
        (doseq [table test-tables]
          (is (contains? (:tables describe-result) table)))
        ;; should not contain any ClickHouse system tables
        (is (not (some #(= (:schema %) "system")
                       (:tables describe-result))))
        (is (not (some #(= (:schema %) "information_schema")
                       (:tables describe-result))))
        (is (not (some #(= (:schema %) "INFORMATION_SCHEMA")
                       (:tables describe-result))))))))

(deftest ^:parallel clickhouse-describe-database-multiple
  (mt/test-driver
    :clickhouse
    (t2.with-temp/with-temp
      [:model/Database db {:engine :clickhouse
                           :details (tx/dbdef->connection-details
                                     :clickhouse :db
                                     {:database-name "metabase_db_scan_test information_schema"})}]
      (let [{:keys [tables] :as _describe-result}
            (driver/describe-database :clickhouse db)
            tables-table  {:name        "tables"
                           :description nil
                           :schema      "information_schema"}
            columns-table {:name        "columns"
                           :description nil
                           :schema      "information_schema"}]

        ;; tables from `metabase_db_scan_test`
        (doseq [table test-tables]
          (is (contains? tables table)))

        ;; tables from `information_schema`
        (is (contains? tables tables-table))
        (is (contains? tables columns-table))))))
