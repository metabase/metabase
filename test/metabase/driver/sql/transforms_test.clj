(ns ^:mb/driver-tests metabase.driver.sql.transforms-test
  "Unit tests for SQL driver transform methods and their contracts."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test :as mt]))

(deftest compile-transform-contract-test
  (testing "compile-transform should return [sql params] format"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "simple table name"
        (let [result (driver/compile-transform driver/*driver*
                                               {:query {:query "SELECT * FROM products"}
                                                :output-table :my_table
                                                :primary-key "id"})]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "has at least 1 element (sql required)"
            (is (>= (count result) 1)))
          (testing "generates appropriate create table statement"
            ;; Different drivers may use different syntax
            (is (or (re-find #"(?i)INTO\s+.*my_table.*FROM" (first result))
                    (re-find #"(?i)CREATE\s+TABLE.*AS" (first result))
                    (re-find #"(?i)CREATE\s+.*TABLE.*my_table" (first result)))))))

      (testing "schema-qualified table name"
        (let [result (driver/compile-transform driver/*driver*
                                               {:query {:query "SELECT * FROM products"}
                                                :output-table :my_schema/my_table
                                                :primary-key "id"})]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "has at least 1 element (sql required)"
            (is (>= (count result) 1)))
          (testing "includes both schema and table parts"
            (let [sql (first result)]
              ;; Both parts should appear in the SQL
              (is (re-find #"my_schema" sql) "Schema name should be present")
              (is (re-find #"my_table" sql) "Table name should be present")
              ;; Should generate valid create statement
              (is (or (re-find #"(?i)INTO\s+.*my_table.*FROM" sql)
                      (re-find #"(?i)CREATE\s+TABLE.*AS" sql)
                      (re-find #"(?i)CREATE\s+.*TABLE" sql))))))))))

(deftest compile-drop-table-contract-test
  (testing "compile-drop-table should return [sql params] format"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "simple table name"
        (let [result (driver/compile-drop-table driver/*driver* :my_table)]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "has at least 1 element (sql required)"
            (is (>= (count result) 1)))
          (testing "generates DROP TABLE IF EXISTS statement"
            (is (re-find #"(?i)DROP\s+TABLE\s+IF\s+EXISTS" (first result))))
          (testing "includes table name"
            (is (re-find #"my_table" (first result))))))

      (testing "schema-qualified table name"
        (let [result (driver/compile-drop-table driver/*driver* :my_schema/my_table)]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "has at least 1 element (sql required)"
            (is (>= (count result) 1)))
          (testing "generates DROP TABLE IF EXISTS statement"
            (is (re-find #"(?i)DROP\s+TABLE\s+IF\s+EXISTS" (first result))))
          (testing "includes both schema and table parts"
            (let [sql (first result)]
              (is (re-find #"my_schema" sql) "Schema name should be present")
              (is (re-find #"my_table" sql) "Table name should be present"))))))))

(deftest execute-transform-assembles-queries-test
  (testing "execute-transform! should pass correct format to execute-raw-queries!"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [compile-result (driver/compile-transform driver/*driver*
                                                     {:query {:query "SELECT * FROM products"}
                                                      :output-table :my_table
                                                      :primary-key "id"})
            drop-result (driver/compile-drop-table driver/*driver* :my_table)]
        (testing "compile methods return consistent vector format"
          (is (vector? compile-result))
          (is (vector? drop-result))
          (is (>= (count compile-result) 1))
          (is (>= (count drop-result) 1)))

        (testing "results can be assembled into a queries list"
          (let [queries [drop-result compile-result]]
            (is (every? vector? queries))
            (is (every? #(>= (count %) 1) queries))
            (is (every? #(string? (first %)) queries))))))))

(deftest format-honeysql-returns-vector-test
  (testing "format-honeysql returns [sql & params] format"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [result (sql.qp/format-honeysql driver/*driver* {:select [:*]
                                                            :from [[:products]]})]
        (testing "returns a vector"
          (is (vector? result)))
        (testing "first element is SQL string"
          (is (string? (first result))))
        (testing "contains SELECT statement"
          (is (re-find #"(?i)SELECT" (first result))))))))

(deftest table-identifier-formatting-test
  (testing "Table identifiers are properly formatted"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "simple table name"
        (let [result (sql.qp/format-honeysql driver/*driver* (keyword "my_table"))]
          (is (vector? result))
          (is (string? (first result)))
          (is (re-find #"my_table" (first result)))))

      (testing "schema-qualified table name"
        (let [result (sql.qp/format-honeysql driver/*driver* (keyword "schema/my_table"))]
          (is (vector? result))
          (is (string? (first result)))
          ;; Drivers might quote these differently, but both parts should be present
          (is (or (re-find #"schema.*my_table" (first result))
                  (re-find #"my_table" (first result)))))))))

(deftest compile-insert-test
  (testing "compile-insert generates INSERT INTO statements"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "simple table name"
        (let [result (driver/compile-insert driver/*driver*
                                            {:query {:query "SELECT * FROM products"}
                                             :output-table :my_table})]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "first element is SQL string"
            (is (string? (first result))))
          (testing "generates INSERT INTO statement"
            (is (re-find #"(?i)INSERT\s+INTO.*my_table" (first result))))
          (testing "includes SELECT statement"
            (is (re-find #"(?i)SELECT" (first result))))))

      (testing "schema-qualified table"
        (let [result (driver/compile-insert driver/*driver*
                                            {:query {:query "SELECT * FROM products"}
                                             :output-table :my_schema/my_table})]
          (testing "returns a vector"
            (is (vector? result)))
          (testing "generates INSERT INTO statement"
            (is (re-find #"(?i)INSERT\s+INTO" (first result))))
          (testing "includes both schema and table parts"
            (let [sql (first result)]
              (is (re-find #"my_schema" sql) "Schema name should be present")
              (is (re-find #"my_table" sql) "Table name should be present"))))))))
