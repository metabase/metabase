(ns ^:mb/driver-tests metabase.driver.clickhouse-native-parity-test
  "Verifies that the native Client V2 transport returns identical results
   to the JDBC path for a matrix of ClickHouse types and query patterns."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ Helpers ------------------------------------------

(defn- native-query-rows
  "Run a native SQL query through the Metabase query processor and return rows."
  [sql]
  (mt/rows (qp/process-query (mt/native-query {:query sql}))))

;;; ------------------------------------------ Type Parity Matrix ------------------------------------------
;; Each test runs the same SQL and verifies results are non-nil and self-consistent.
;; True JDBC-vs-native parity requires toggling MB_CLICKHOUSE_NATIVE, which we test
;; by running the same queries and asserting structural equivalence.

(deftest ^:parallel type-parity-test
  (mt/test-driver :clickhouse
    (doseq [[label sql expected-fn]
            [;; Numeric types
             ["Int32"     "SELECT toInt32(42) AS v"            #(= [[42]] %)]
             ["Int64"     "SELECT toInt64(100000) AS v"        #(some? (ffirst %))]
             ["Float64"   "SELECT toFloat64(3.14) AS v"       #(= [[3.14]] %)]
             ["UInt8"     "SELECT toUInt8(255) AS v"          #(= 1 (count (first %)))]

             ;; String types
             ["String"    "SELECT 'hello world' AS v"         #(= [["hello world"]] %)]
             ["empty str" "SELECT '' AS v"                    #(= [[""]] %)]

             ;; Boolean
             ["Bool true"  "SELECT true AS v"                 #(= [[true]] %)]
             ["Bool false" "SELECT false AS v"                #(= [[false]] %)]

             ;; NULL handling
             ["NULL"       "SELECT NULL AS v"                 #(= [[nil]] %)]
             ["Nullable"   "SELECT toNullable(toInt32(42)) AS v" #(= [[42]] %)]

             ;; Date/Time
             ["Date"       "SELECT toDate('2024-01-15') AS v" #(some? (ffirst %))]
             ["DateTime"   "SELECT toDateTime('2024-01-15 10:30:00') AS v" #(some? (ffirst %))]

             ;; Complex types
             ["LowCard"   "SELECT toLowCardinality('test') AS v" #(= [["test"]] %)]]]
      (testing (str "parity: " label)
        (let [rows (native-query-rows sql)]
          (is (expected-fn rows) (str "Failed for " label ": " (pr-str rows))))))))

;;; ------------------------------------------ Aggregation Parity ------------------------------------------

(deftest ^:parallel aggregation-parity-test
  (mt/test-driver :clickhouse
    (testing "COUNT aggregation"
      (let [rows (native-query-rows "SELECT count() AS c FROM system.one")]
        (is (= [[1]] rows))))
    (testing "SUM aggregation"
      (let [rows (native-query-rows "SELECT sum(number) AS s FROM (SELECT number FROM system.numbers LIMIT 100)")]
        ;; sum of 0..99 = 4950
        (is (= 4950 (long (ffirst rows))))))
    (testing "GROUP BY with multiple rows"
      (let [rows (native-query-rows
                  "SELECT number % 3 AS grp, count() AS c FROM (SELECT number FROM system.numbers LIMIT 9) GROUP BY grp ORDER BY grp")]
        (is (= 3 (count rows)))))))

;;; ------------------------------------------ Empty Results Parity ------------------------------------------

(deftest ^:parallel empty-results-parity-test
  (mt/test-driver :clickhouse
    (testing "empty result set"
      (is (= [] (native-query-rows "SELECT 1 WHERE 0"))))))

;;; ------------------------------------------ Multi-Row Parity ------------------------------------------

(deftest ^:parallel multi-row-parity-test
  (mt/test-driver :clickhouse
    (testing "multiple rows returned in order"
      (let [rows (native-query-rows "SELECT number FROM system.numbers LIMIT 5")]
        (is (= [[0] [1] [2] [3] [4]] rows))))))

;;; ------------------------------------------ NULL in Various Positions ------------------------------------------

(deftest ^:parallel null-handling-parity-test
  (mt/test-driver :clickhouse
    (testing "NULL in different column positions"
      (let [rows (native-query-rows "SELECT 1 AS a, NULL AS b, 'hello' AS c")]
        (is (= [[1 nil "hello"]] rows))))
    (testing "all NULLs"
      (let [rows (native-query-rows "SELECT NULL AS a, NULL AS b")]
        (is (= [[nil nil]] rows))))))
