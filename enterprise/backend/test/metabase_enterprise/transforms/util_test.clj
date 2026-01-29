(ns ^:mb/driver-tests metabase-enterprise.transforms.util-test
  "Tests for transform utility functions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]))

(set! *warn-on-reflection* true)

(deftest temp-table-name-test
  (testing "temp-table-name generates valid table names respecting driver limits"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [driver driver/*driver*]

        (testing "Basic table name generation without original table"
          (let [result (driver.u/temp-table-name driver nil)
                table-name (name result)]
            (is (keyword? result))
            (is (nil? (namespace result)))
            (is (str/starts-with? table-name "mb_transform_temp_table_"))
            (is (re-matches #"mb_transform_temp_table_[a-f0-9]{8}" table-name))))

        (testing "Table name includes original table name"
          (let [result (driver.u/temp-table-name driver :orders)
                table-name (name result)]
            (is (str/starts-with? table-name "mb_transform_temp_table_orders_"))
            (is (re-matches #"mb_transform_temp_table_orders_[a-f0-9]{8}" table-name))))

        (testing "Table name preserves namespace when present"
          (let [result (driver.u/temp-table-name driver :schema/orders)]
            (is (= "schema" (namespace result)))
            (is (str/starts-with? (name result) "mb_transform_temp_table_orders_"))))))))

(deftest temp-table-name-creates-table-test
  (testing "temp-table-name produces names that can actually create tables"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
      (let [driver driver/*driver*
            db-id (mt/id)

            table-name (driver.u/temp-table-name driver :test_table)
            schema-name (when (get-method sql.tx/session-schema driver)
                          (sql.tx/session-schema driver))
            qualified-table-name (if schema-name
                                   (keyword schema-name (name table-name))
                                   table-name)
            column-definitions {"id" (driver/type->database-type driver :type/Integer)}]
        (mt/as-admin
          (try
            (testing "Can create table with generated temp name"
              (driver/create-table! driver db-id qualified-table-name column-definitions {})
              (when-not (= driver :mongo) ;; mongo doesn't actually create tables
                (is (driver/table-exists? driver (mt/db) {:schema schema-name :name (name table-name)}))))
            (finally
              (try
                (driver/drop-table! driver db-id qualified-table-name)
                (catch Exception _e
                  ;; Ignore cleanup errors
                  nil)))))))))

(deftest is-temp-transform-tables-test
  (testing "tables with schema"
    (let [table-with-schema    {:name (name (driver.u/temp-table-name :postgres :schema/orders))}
          table-without-schema {:name (name (driver.u/temp-table-name :postgres :orders))}]
      (mt/with-premium-features #{}
        (is (false? (transforms.util/is-temp-transform-table? table-with-schema)))
        (is (false? (transforms.util/is-temp-transform-table? table-without-schema))))
      (mt/with-premium-features #{:transforms}
        (is (transforms.util/is-temp-transform-table? table-without-schema))
        (is (transforms.util/is-temp-transform-table? table-with-schema)))))

  (testing "Ignores non-transform tables"
    (mt/with-premium-features #{:transforms}
      (is (false? (transforms.util/is-temp-transform-table? {:name :orders})))
      (is (false? (transforms.util/is-temp-transform-table? {:name :public/orders}))))))

(deftest create-table-from-schema!-test
  (testing "create-table-from-schema! preserves column order from schema definition"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [driver driver/*driver*
            db-id (mt/id)
            schema-name (when (get-method sql.tx/session-schema driver)
                          (sql.tx/session-schema driver))
            table-name (keyword "test_column_order")
            qualified-table-name (if schema-name
                                   (keyword schema-name (name table-name))
                                   table-name)
            table-schema {:name qualified-table-name
                          :columns [{:name "zebra_col" :type :type/Text}
                                    {:name "apple_col" :type :type/Integer}
                                    {:name "mango_col" :type :type/Boolean}]}]
        (mt/as-admin
          (try
            (testing "Creating table with ordered columns"
              (transforms.util/create-table-from-schema! driver db-id table-schema)
              (is (driver/table-exists? driver (mt/db) {:schema schema-name :name (name table-name)})))

            (when (get-method driver/describe-table driver)
              (testing "Column order matches schema definition order (not alphabetical)"
                (let [table-metadata {:schema schema-name :name (name table-name)}
                      described-fields (:fields (driver/describe-table driver (mt/db) table-metadata))
                      sorted-fields (sort-by :database-position described-fields)
                      column-names (mapv :name sorted-fields)
                      expected-names ["zebra_col" "apple_col" "mango_col"]]
                  (is (= expected-names column-names)
                      (str "Expected column order " expected-names
                           " but got " column-names)))))

            (finally
              (try
                (driver/drop-table! driver db-id qualified-table-name)
                (catch Exception _e
                  ;; Ignore cleanup errors
                  nil)))))))))

;;; ------------------------------------------------- Source Table Resolution Tests ----------------------------------

(deftest batch-lookup-table-ids-test
  (testing "batch-lookup-table-ids looks up table IDs from ref maps"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db) :name "table_one" :schema nil}
                   :model/Table    t2 {:db_id (:id db) :name "table_two" :schema "my_schema"}]
      (testing "returns nil for empty input"
        (is (nil? (transforms.util/batch-lookup-table-ids [])))
        (is (nil? (transforms.util/batch-lookup-table-ids nil))))

      (testing "looks up table without schema"
        (let [refs [{:database_id (:id db) :schema nil :table "table_one"}]
              result (transforms.util/batch-lookup-table-ids refs)]
          (is (= {[(:id db) nil "table_one"] (:id t1)} result))))

      (testing "looks up table with schema"
        (let [refs [{:database_id (:id db) :schema "my_schema" :table "table_two"}]
              result (transforms.util/batch-lookup-table-ids refs)]
          (is (= {[(:id db) "my_schema" "table_two"] (:id t2)} result))))

      (testing "handles mixed refs with and without schema"
        (let [refs [{:database_id (:id db) :schema nil :table "table_one"}
                    {:database_id (:id db) :schema "my_schema" :table "table_two"}]
              result (transforms.util/batch-lookup-table-ids refs)]
          (is (= {[(:id db) nil "table_one"] (:id t1)
                  [(:id db) "my_schema" "table_two"] (:id t2)}
                 result))))

      (testing "returns empty for non-existent table"
        (let [refs [{:database_id (:id db) :schema nil :table "nonexistent"}]
              result (transforms.util/batch-lookup-table-ids refs)]
          (is (= {} result)))))))

(deftest normalize-source-tables-test
  (testing "normalize-source-tables converts all entries to map format"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db) :name "existing_table" :schema nil}]
      (testing "converts integer table ID to map format"
        (let [result (transforms.util/normalize-source-tables {"t" (:id t1)})]
          (is (map? (get result "t")))
          (is (= (:id db) (get-in result ["t" :database_id])))
          (is (= "existing_table" (get-in result ["t" :table])))
          (is (= (:id t1) (get-in result ["t" :table_id])))))

      (testing "throws for non-existent integer table ID"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables not found for ids: 999999"
                              (transforms.util/normalize-source-tables {"t" 999999}))))

      (testing "populates table_id for existing table"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "existing_table"}}
              result (transforms.util/normalize-source-tables source-tables)]
          (is (= (:id t1) (get-in result ["t" :table_id])))))

      (testing "preserves existing table_id"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "existing_table" :table_id 999}}
              result (transforms.util/normalize-source-tables source-tables)]
          (is (= 999 (get-in result ["t" :table_id])))))

      (testing "leaves table_id nil for non-existent table ref"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "nonexistent"}}
              result (transforms.util/normalize-source-tables source-tables)]
          (is (nil? (get-in result ["t" :table_id])))))

      (testing "handles mixed int and map entries"
        (let [source-tables {"t1" (:id t1)
                             "t2" {:database_id (:id db) :schema nil :table "existing_table"}}
              result (transforms.util/normalize-source-tables source-tables)]
          (is (map? (get result "t1")))
          (is (= (:id t1) (get-in result ["t1" :table_id])))
          (is (= (:id t1) (get-in result ["t2" :table_id]))))))))

(deftest resolve-source-tables-test
  (testing "resolve-source-tables returns {alias -> table_id} map"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db) :name "table_one" :schema nil}
                   :model/Table    t2 {:db_id (:id db) :name "table_two" :schema nil}]
      (testing "passes through integer entries (old format)"
        (is (= {"t" 123} (transforms.util/resolve-source-tables {"t" 123}))))

      (testing "resolves map with table_id"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "table_one" :table_id (:id t1)}}]
          (is (= {"t" (:id t1)} (transforms.util/resolve-source-tables source-tables)))))

      (testing "looks up table_id for map without it"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "table_one"}}]
          (is (= {"t" (:id t1)} (transforms.util/resolve-source-tables source-tables)))))

      (testing "throws for non-existent table"
        (let [source-tables {"t" {:database_id (:id db) :schema nil :table "nonexistent"}}]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables not found: nonexistent"
                                (transforms.util/resolve-source-tables source-tables)))))

      (testing "throws with schema in error message"
        (let [source-tables {"t" {:database_id (:id db) :schema "my_schema" :table "nonexistent"}}]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables not found: my_schema\.nonexistent"
                                (transforms.util/resolve-source-tables source-tables)))))

      (testing "handles mixed entries (old and new format)"
        (let [source-tables {"t1" (:id t1)
                             "t2" {:database_id (:id db) :schema nil :table "table_two"}}]
          (is (= {"t1" (:id t1) "t2" (:id t2)}
                 (transforms.util/resolve-source-tables source-tables))))))))
