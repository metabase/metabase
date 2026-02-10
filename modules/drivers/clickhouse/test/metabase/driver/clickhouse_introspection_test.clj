(ns ^:mb/driver-tests metabase.driver.clickhouse-introspection-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.clickhouse]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- desc-table!
  [db table-name]
  (into #{} (map #(select-keys % [:name :database-type :base-type :database-required])
                 (:fields (driver/describe-table :clickhouse db {:name table-name})))))

(mt/defdataset introspection_db
  [["enums_base_types"
    [{:field-name "c1", :base-type {:native "Nullable(Enum8('America/New_York'))"}}
     {:field-name "c2", :base-type {:native "Enum8('BASE TABLE' = 1, 'VIEW' = 2, 'FOREIGN TABLE' = 3, 'LOCAL TEMPORARY' = 4, 'SYSTEM VIEW' = 5)"}}
     {:field-name "c3", :base-type {:native "Enum8('NO', 'YES')"}}
     {:field-name "c4", :base-type {:native "Enum16('SHOW DATABASES' = 0, 'SHOW TABLES' = 1, 'SHOW COLUMNS' = 2)"}}
     {:field-name "c5", :base-type {:native "Nullable(Enum8('GLOBAL' = 0, 'DATABASE' = 1, 'TABLE' = 2))"}}
     {:field-name "c6", :base-type {:native "Nullable(Enum16('SHOW DATABASES' = 0, 'SHOW TABLES' = 1, 'SHOW COLUMNS' = 2))"}}]
    []]
   ["date_base_types"
    [{:field-name "c1", :base-type {:native "Date"}}
     {:field-name "c2", :base-type {:native "Date32"}}
     {:field-name "c3", :base-type {:native "Nullable(Date)"}}
     {:field-name "c4", :base-type {:native "Nullable(Date32)"}}]
    []]
   ["datetime_base_types"
    [{:field-name "c1", :base-type {:native "Nullable(DateTime('America/New_York'))"}}
     {:field-name "c2", :base-type {:native "DateTime('America/New_York')"}}
     {:field-name "c3", :base-type {:native "DateTime"}}
     {:field-name "c4", :base-type {:native "DateTime64(3)"}}
     {:field-name "c5", :base-type {:native "DateTime64(9, 'America/New_York')"}}
     {:field-name "c6", :base-type {:native "Nullable(DateTime64(6, 'America/New_York'))"}}
     {:field-name "c7", :base-type {:native "Nullable(DateTime64(0))"}}
     {:field-name "c8", :base-type {:native "Nullable(DateTime)"}}]
    []]
   ["integer_base_types"
    [{:field-name "c1", :base-type {:native "UInt8"}}
     {:field-name "c2", :base-type {:native "UInt16"}}
     {:field-name "c3", :base-type {:native "UInt32"}}
     {:field-name "c4", :base-type {:native "UInt64"}}
     {:field-name "c5", :base-type {:native "UInt128"}}
     {:field-name "c6", :base-type {:native "UInt256"}}
     {:field-name "c7", :base-type {:native "Int8"}}
     {:field-name "c8", :base-type {:native "Int16"}}
     {:field-name "c9", :base-type {:native "Int32"}}
     {:field-name "c10", :base-type {:native "Int64"}}
     {:field-name "c11", :base-type {:native "Int128"}}
     {:field-name "c12", :base-type {:native "Int256"}}
     {:field-name "c13", :base-type {:native "Nullable(Int32)"}}]
    []]
   ["numeric_base_types"
    [{:field-name "c1", :base-type {:native "Float32"}}
     {:field-name "c2", :base-type {:native "Float64"}}
     {:field-name "c3", :base-type {:native "Decimal(4, 2)"}}
     {:field-name "c4", :base-type {:native "Decimal32(7)"}}
     {:field-name "c5", :base-type {:native "Decimal64(12)"}}
     {:field-name "c6", :base-type {:native "Decimal128(24)"}}
     {:field-name "c7", :base-type {:native "Decimal256(42)"}}
     {:field-name "c8", :base-type {:native "Nullable(Float32)"}}
     {:field-name "c9", :base-type {:native "Nullable(Decimal(4, 2))"}}
     {:field-name "c10", :base-type {:native "Nullable(Decimal256(42))"}}]
    []]
   ["string_base_types"
    [{:field-name "c1", :base-type {:native "String"}}
     {:field-name "c2", :base-type {:native "LowCardinality(String)"}}
     {:field-name "c3", :base-type {:native "FixedString(32)"}}
     {:field-name "c4", :base-type {:native "Nullable(String)"}}
     {:field-name "c5", :base-type {:native "LowCardinality(FixedString(4))"}}]
    []]
   ["array_base_types"
    [{:field-name "c1", :base-type {:native "Array(String)"}}
     {:field-name "c2", :base-type {:native "Array(Nullable(Int32))"}}
     {:field-name "c3", :base-type {:native "Array(Array(LowCardinality(FixedString(32))))"}}
     {:field-name "c4", :base-type {:native "Array(Array(Array(String)))"}}]
    []]
   ["low_cardinality_nullable_base_types"
    [{:field-name "c1", :base-type {:native "LowCardinality(Nullable(String))"}}
     {:field-name "c2", :base-type {:native "LowCardinality(Nullable(FixedString(16)))"}}]
    []]
   ["misc_base_types"
    [{:field-name "c1", :base-type {:native "Boolean"}}
     {:field-name "c2", :base-type {:native "UUID"}}
     {:field-name "c3", :base-type {:native "IPv4"}}
     {:field-name "c4", :base-type {:native "IPv6"}}
     {:field-name "c5", :base-type {:native "Map(Int32, String)"}}
     {:field-name "c6", :base-type {:native "Nullable(Boolean)"}}
     {:field-name "c7", :base-type {:native "Nullable(UUID)"}}
     {:field-name "c8", :base-type {:native "Nullable(IPv4)"}}
     {:field-name "c9", :base-type {:native "Nullable(IPv6)"}}
     {:field-name "c10", :base-type {:native "Tuple(String, Int32)"}}]
    []]
   ["aggregate_functions_filter_test"
    [{:field-name "idx", :base-type {:native "UInt8"}}
     {:field-name "a", :base-type {:native "AggregateFunction(uniq, String)"}}
     {:field-name "lowest_value", :base-type {:native "SimpleAggregateFunction(min, UInt8)"}}
     {:field-name "count", :base-type {:native "SimpleAggregateFunction(sum, Int64)"}}]
    [[42 nil 144 255255]]]])

(deftest clickhouse-base-types-test-enums
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (testing "enums"
        (let [table-name "enums_base_types"]
          (is (= #{{:name "id", :database-type "Int32", :base-type :type/Integer, :database-required true}
                   {:base-type :type/Text,
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
                 (desc-table! (mt/db) table-name))))))))

(deftest clickhouse-base-types-test-dates
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (testing "dates"
        (let [table-name "date_base_types"]
          (is (= #{{:name "id", :database-type "Int32", :base-type :type/Integer, :database-required true}
                   {:base-type :type/Date,
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
                 (desc-table! (mt/db) table-name))))))))

(deftest clickhouse-base-types-test-datetimes
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (testing "datetimes"
        (let [table-name "datetime_base_types"]
          (is (= #{{:name "id", :database-type "Int32", :base-type :type/Integer, :database-required true}
                   {:base-type :type/DateTimeWithLocalTZ,
                    :database-required false,
                    :database-type "Nullable(DateTime('America/New_York'))",
                    :name "c1"}
                   {:base-type :type/DateTimeWithLocalTZ,
                    :database-required true,
                    :database-type "DateTime('America/New_York')",
                    :name "c2"}
                   {:base-type :type/DateTime,
                    :database-required true,
                    :database-type "DateTime",
                    :name "c3"}
                   {:base-type :type/DateTime,
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
                   {:base-type :type/DateTime,
                    :database-required false,
                    :database-type "Nullable(DateTime64(0))",
                    :name "c7"}
                   {:base-type :type/DateTime,
                    :database-required false,
                    :database-type "Nullable(DateTime)",
                    :name "c8"}}
                 (desc-table! (mt/db) table-name))))))))

(deftest clickhouse-base-types-test-integers
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (testing "integers"
        (let [table-name "integer_base_types"]
          (is (= #{{:name "id", :database-type "Int32", :base-type :type/Integer, :database-required true}
                   {:base-type :type/Integer,
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
                 (desc-table! (mt/db) table-name))))))))

(deftest clickhouse-base-types-test-numerics
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (testing "numerics"
        (let [table-name "numeric_base_types"]
          (is (= #{{:name "id", :database-type "Int32", :base-type :type/Integer, :database-required true}
                   {:base-type :type/Float,
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
                 (desc-table! (mt/db) table-name))))))))

(deftest clickhouse-base-types-test-strings
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (testing "strings"
        (let [table-name "string_base_types"]
          (is (= #{{:name "id", :database-type "Int32", :base-type :type/Integer, :database-required true}
                   {:base-type :type/Text,
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
                 (desc-table! (mt/db) table-name))))))))

(deftest clickhouse-base-types-test-arrays
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (testing "arrays"
        (let [table-name "array_base_types"]
          (is (= #{{:name "id", :database-type "Int32", :base-type :type/Integer, :database-required true}
                   {:base-type :type/Array,
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
                 (desc-table! (mt/db) table-name))))))))

(deftest clickhouse-base-types-test-low-cardinality-nullable
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (testing "low cardinality nullable"
        (let [table-name "low_cardinality_nullable_base_types"]
          (is (= #{{:name "id", :database-type "Int32", :base-type :type/Integer, :database-required true}
                   {:base-type :type/Text,
                    :database-required true,
                    :database-type "LowCardinality(Nullable(String))",
                    :name "c1"}
                   {:base-type :type/TextLike,
                    :database-required true,
                    :database-type "LowCardinality(Nullable(FixedString(16)))",
                    :name "c2"}}
                 (desc-table! (mt/db) table-name))))))))

(deftest clickhouse-base-types-test-misc
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (testing "everything else"
        (let [table-name "misc_base_types"]
          (is (= #{{:name "id", :database-type "Int32", :base-type :type/Integer, :database-required true}
                   {:base-type :type/Boolean,
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
                 (desc-table! (mt/db) table-name))))))))

(deftest ^:parallel clickhouse-boolean-type-metadata
  (mt/test-driver :clickhouse
    (let [result      (-> {:query "SELECT false, 123, true"} mt/native-query qp/process-query)
          [[c1 _ c3]] (-> result mt/rows)]
      (testing "column should be of type :type/Boolean"
        (is (= :type/Boolean (-> result :data :results_metadata :columns first :base_type)))
        (is (= :type/Boolean (transduce identity (driver.common/values->base-type) [c1, c3])))
        (is (= :type/Boolean (driver.common/class->base-type (class c1))))))))

(def ^:private base-field
  {:database-is-auto-increment false
   :database-is-nullable       false
   :json-unfolding             false
   :database-required          true})

(deftest clickhouse-filtered-aggregate-functions-test-table-metadata
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (is (= {:name "aggregate_functions_filter_test"
              :fields #{(merge base-field
                               {:name "id",
                                :database-type "Int32",
                                :base-type :type/Integer,
                                :database-required true
                                :database-position 0})
                        (merge base-field
                               {:name "idx"
                                :database-type "UInt8"
                                :base-type :type/Integer
                                :database-position 1})
                        (merge base-field
                               {:name "lowest_value"
                                :database-type "SimpleAggregateFunction(min, UInt8)"
                                :base-type :type/Integer
                                :database-position 3})
                        (merge base-field
                               {:name "count"
                                :database-type "SimpleAggregateFunction(sum, Int64)"
                                :base-type :type/BigInteger
                                :database-position 4})}}
             (driver/describe-table :clickhouse (mt/db) {:name "aggregate_functions_filter_test"}))))))

(deftest clickhouse-filtered-aggregate-functions-test-result-set
  (mt/test-driver :clickhouse
    (mt/dataset introspection_db
      (is (= [[1 42 144 255255]]
             (mt/formatted-rows
              [int int int int]
              :format-nil-values
              (mt/with-db (mt/db)
                (mt/run-mbql-query
                  aggregate_functions_filter_test
                  {}))))))))

(mt/defdataset metabase_db_scan_test
  [["table1"
    [{:field-name "i", :base-type {:native "Int32"}}]
    []]
   ["table2"
    [{:field-name "i", :base-type {:native "Int64"}}]
    []]])

(def ^:private test-tables
  #{{:description nil,
     :name "table1",
     :schema "metabase_db_scan_test"}
    {:description nil,
     :name "table2",
     :schema "metabase_db_scan_test"}})

(deftest ^:parallel clickhouse-describe-database-single
  (mt/test-driver :clickhouse
    (mt/dataset metabase_db_scan_test
      (is (= {:tables test-tables}
             (driver/describe-database :clickhouse (mt/db)))))))

(deftest ^:parallel clickhouse-describe-database-all
  (mt/test-driver :clickhouse
    (mt/dataset metabase_db_scan_test
      (mt/db)
      (t2.with-temp/with-temp
        [:model/Database db {:engine :clickhouse
                             :details (merge (mt/dbdef->connection-details
                                              :clickhouse :db
                                              {:database-name "default"})
                                             {:db-filters-type "all"})}]
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
                         (:tables describe-result)))))))))

(deftest ^:parallel clickhouse-describe-database-multiple
  (mt/test-driver :clickhouse
    (mt/dataset metabase_db_scan_test
      (mt/db)
      (t2.with-temp/with-temp
        [:model/Database db {:engine :clickhouse
                             :details (merge (mt/dbdef->connection-details :clickhouse :db nil)
                                             {:db-filters-type "inclusion"
                                              :db-filters-patterns "metabase_db_scan_test, information_schema"})}]
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
          (is (contains? tables columns-table)))))))

(deftest ^:synchronized clickhouse-parameterized-view-sync-resilience-test
  (testing "Sync should continue past parameterized views that cannot be introspected (#66395)"
    (mt/test-driver :clickhouse
      (mt/dataset metabase_db_scan_test
        (let [db (mt/db)
              details (mt/dbdef->connection-details :clickhouse :db {:database-name "metabase_db_scan_test"})
              db-name "metabase_db_scan_test"]
          ;; Create a parameterized view that will fail during sync
          (metabase.test.data.clickhouse/exec-statements
           [(format "CREATE OR REPLACE VIEW %s.parameterized_view AS SELECT {returnString:String} as result" db-name)
            (format "CREATE TABLE %s.table_after_view (id Int32, name String) ENGINE = Memory" db-name)
            (format "INSERT INTO %s.table_after_view VALUES (1, 'test')" db-name)]
           details)
          (try
            ;; Sync the database - this should not crash despite the parameterized view
            (is (not= ::thrown
                      (try
                        (sync/sync-database! db)
                        (catch Throwable _e
                          ::thrown)))
                "Sync should not throw an exception when encountering a parameterized view")

            ;; Verify that the table AFTER the problematic view was still synced
            (let [table-after (t2/select-one :model/Table :db_id (u/the-id db) :name "table_after_view")]
              (is (some? table-after)
                  "Table created after parameterized view should be synced")
              (when table-after
                (let [fields (t2/select :model/Field :table_id (:id table-after))]
                  (is (= #{"id" "name"}
                         (set (map :name fields)))
                      "Fields in table after parameterized view should be synced"))))
            (finally
              ;; Clean up
              (metabase.test.data.clickhouse/exec-statements
               [(format "DROP VIEW IF EXISTS %s.parameterized_view" db-name)
                (format "DROP TABLE IF EXISTS %s.table_after_view" db-name)]
               details))))))))


