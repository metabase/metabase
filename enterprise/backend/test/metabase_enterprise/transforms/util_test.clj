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

(deftest ^:parallel database-id-filter-xf-test
  (testing "->database-id-filter-xf filters transforms by database ID"
    (let [db1-query-x  {:id     1
                        :name   "Query on DB1"
                        :source {:type "query" :query {:database 1}}
                        :target {:type "table" :name "t1" :database 1}}
          db2-target-x {:id     2
                        :name   "Python targeting DB4"
                        :source {:type "python" :body "" :source-database 2 :source-tables {}}
                        :target {:type "table" :name "t4" :database 2}}
          transforms   [db1-query-x db2-target-x]]

      (are [x y] (= x (into [] (transforms.util/->database-id-filter-xf y) transforms))
        transforms     nil
        [db1-query-x]  1
        []             10               ; source does not match
        [db2-target-x] 2
        []             999))))

(deftest ^:parallel matching-timestamp?-test
  (testing "matching-timestamp? checks if a timestamp falls within a date range [start, end)"
    (let [matching-timestamp? #'transforms.util/matching-timestamp?
          field-path          [:start_time]
          range-jan-feb       {:start "2024-01-01T00:00:00Z" :end "2024-02-01T00:00:00Z"}
          range-start-only    {:start "2024-01-01T00:00:00Z" :end nil}
          range-end-only      {:start nil :end "2024-02-01T00:00:00Z"}]

      (testing "with both start and end bounds"
        (are [expected timestamp]
             (= expected (matching-timestamp? {:start_time timestamp} field-path range-jan-feb))
          nil   nil                       ; missing field returns nil
          true  "2024-01-15T12:00:00Z"    ; timestamp in middle of range
          false "2023-12-15T12:00:00Z"    ; timestamp before range
          false "2024-02-15T12:00:00Z"    ; timestamp after range
          true  "2024-01-01T00:00:00Z"    ; start boundary is inclusive
          true  "2024-02-01T00:00:00Z"))  ; end boundary is inclusive too 🤷

      (testing "with only start bound"
        (are [expected timestamp]
             (= expected (matching-timestamp? {:start_time timestamp} field-path range-start-only))
          true  "2024-01-15T12:00:00Z"    ; timestamp after start
          true  "2024-02-15T12:00:00Z"    ; any timestamp after start
          false "2023-12-15T12:00:00Z"))  ; timestamp before start

      (testing "with only end bound"
        (are [expected timestamp]
             (= expected (matching-timestamp? {:start_time timestamp} field-path range-end-only))
          true  "2024-01-15T12:00:00Z"    ; timestamp before end
          true  "2023-12-15T12:00:00Z"    ; any timestamp before end
          false "2024-02-15T12:00:00Z"))  ; timestamp after end

      (testing "returns nil when field value is missing"
        (are [job] (nil? (matching-timestamp? job field-path range-jan-feb))
          {}
          {:other "value"})))))
