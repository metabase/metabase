(ns ^:mb/driver-tests metabase-enterprise.transforms.util-test
  "Tests for transform utility functions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]))

(set! *warn-on-reflection* true)

(deftest temp-table-name-test
  (testing "temp-table-name generates valid table names respecting driver limits"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [driver driver/*driver*]

        (testing "Basic table name generation"
          (let [result (transforms.util/temp-table-name driver nil)
                table-name (name result)]
            (is (keyword? result))
            (is (nil? (namespace result)))
            (is (str/starts-with? table-name "mb_transform_temp_table_"))
            (is (re-matches #"mb_transform_temp_table_\d+" table-name))))

        (testing "Table name preserves namespace when present"
          (let [result (transforms.util/temp-table-name driver "schema")]
            (is (= "schema" (namespace result)))
            (is (str/starts-with? (name result) "mb_transform_temp_table_"))))))))

(deftest temp-table-name-creates-table-test
  (testing "temp-table-name produces names that can actually create tables"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
      (let [driver driver/*driver*
            db-id (mt/id)

            table-name (transforms.util/temp-table-name driver nil)
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
  (testing "tables with shcema"
    (let [table-with-schema    {:name (name (transforms.util/temp-table-name :postgres "schema"))}
          table-without-schema {:name (name (transforms.util/temp-table-name :postgres "schema"))}]
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

;;; ------------------------------------------------------------
;;; Filter xf tests
;;; ------------------------------------------------------------

(deftest ^:parallel type-filter-xf-test
  (testing "->type-filter-xf filters transforms by source type"
    (let [query-transform  {:id 1 :source {:type "query"}}
          python-transform {:id 2 :source {:type "python"}}
          transforms       [query-transform python-transform]]

      (are [x y] (= x (into [] (transforms.util/->type-filter-xf y) transforms))
        transforms         nil
        transforms         []
        [query-transform]  ["query"]
        [python-transform] ["python"]
        transforms         ["query" "python"]
        []                 ["whatever"]))))

(deftest ^:parallel database-id-filter-xf-test
  (testing "->database-id-filter-xf filters transforms by database ID"
    (let [db1-query-x  {:id     1
                        :name   "Query on DB1"
                        :source {:type "query" :query {:database 1}}
                        :target {:type "table" :name "t1"}}
          db2-query-x  {:id     2
                        :name   "Query on DB2"
                        :source {:type "query" :query {:database 2}}
                        :target {:type "table" :name "t2"}}
          db3-python-x {:id     3
                        :name   "Python with source DB3"
                        :source {:type "python" :source-database 3 :body ""}
                        :target {:type "table" :name "t3" :database 4}}
          db4-target-x {:id     4
                        :name   "Python targeting DB4"
                        :source {:type "python" :body "" :source-tables {}}
                        :target {:type "table" :name "t4" :database 4}}
          transforms   [db1-query-x db2-query-x db3-python-x db4-target-x]]

      (are [x y] (= x (into [] (transforms.util/->database-id-filter-xf y) transforms))
        transforms                  nil
        [db1-query-x]               1
        [db2-query-x]               2
        [db3-python-x]              3
        [db3-python-x db4-target-x] 4
        []                          999))))
