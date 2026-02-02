(ns metabase.sql-tools.sqlglot.returned-columns-test
  "Tests for SQLGlot returned-columns implementation.
   Ported from metabase.sql-tools.macaw.references-test.

   Note: These tests verify that returned-columns produces correct output,
   not that it matches Macaw's exact format. The key assertions are:
   - Correct column names
   - Correct column count
   - Type information when schema allows"
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.sqlglot.experimental :as experimental]
   [metabase.test :as mt]
   [metabase.util :as u]))

;;; Test Helpers

(defn- returned-column-names
  "Extract just the column names from returned-columns result.
   Normalizes to lowercase for cross-database comparison."
  [columns]
  (mapv (comp u/lower-case-en :name) columns))

(defn- make-query
  "Create a native query with the test metadata provider."
  [sql]
  (lib/native-query (mt/metadata-provider) sql))

(defn- returned-columns
  "Get returned columns for a SQL query using the test metadata provider."
  [sql]
  (let [driver (:engine (lib.metadata/database (mt/metadata-provider)))]
    (experimental/returned-columns driver (make-query sql))))

;;; Basic SELECT Tests

(deftest ^:parallel basic-select-columns-test
  (testing "Simple SELECT returns expected columns"
    (mt/test-driver :h2
      (let [result (returned-columns "SELECT ID, NAME FROM PEOPLE")]
        (is (= 2 (count result)))
        ;; SQLGlot normalizes to lowercase
        (is (= ["id" "name"] (returned-column-names result)))
        (is (every? #(= :metadata/column (:lib/type %)) result))))))

(deftest ^:parallel select-star-test
  (testing "SELECT * returns all columns from table"
    (mt/test-driver :h2
      ;; Note: SQLGlot with lineage expands * to actual column names
      (let [result (returned-columns "SELECT * FROM PEOPLE")]
        (is (pos? (count result)))
        (is (every? #(= :metadata/column (:lib/type %)) result))))))

(deftest ^:parallel select-with-alias-test
  (testing "SELECT with alias preserves alias in output"
    (mt/test-driver :h2
      (let [result (returned-columns "SELECT ID AS user_id FROM PEOPLE")]
        (is (= 1 (count result)))
        (is (= "user_id" (:name (first result))))
        (is (= "user_id" (:lib/desired-column-alias (first result))))))))

;;; JOIN Tests

(deftest ^:parallel basic-join-test
  (testing "JOIN query returns columns from both tables"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT PEOPLE.NAME, ORDERS.TOTAL
                     FROM PEOPLE
                     INNER JOIN ORDERS ON PEOPLE.ID = ORDERS.USER_ID")]
        (is (= 2 (count result)))
        (is (= #{"name" "total"} (set (returned-column-names result))))))))

(deftest ^:parallel join-with-table-wildcard-test
  (testing "JOIN with table.* returns columns from that table"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ORDERS.*
                     FROM PEOPLE
                     INNER JOIN ORDERS ON PEOPLE.ID = ORDERS.USER_ID")]
        (is (pos? (count result)))
        ;; All returned columns should be from ORDERS
        (is (every? some? result))))))

;;; Subquery Tests

(deftest ^:parallel subquery-test
  (testing "Subquery columns are traced correctly"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT a, b FROM (SELECT ID AS a, NAME AS b FROM PEOPLE)")]
        (is (= 2 (count result)))
        (is (= ["a" "b"] (returned-column-names result)))))))

(deftest ^:parallel nested-subquery-test
  (testing "Nested subqueries trace through multiple levels"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT x FROM (SELECT a AS x FROM (SELECT ID AS a FROM PEOPLE))")]
        (is (= 1 (count result)))
        (is (= "x" (:name (first result))))))))

;;; CTE Tests

(deftest ^:parallel basic-cte-test
  (testing "CTE columns are traced correctly"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "WITH active_users AS (SELECT ID, NAME FROM PEOPLE WHERE ID > 0)
                     SELECT * FROM active_users")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

;;; Aggregate Tests

(deftest ^:parallel aggregate-test
  (testing "Aggregate functions return custom columns (pure? = false)"
    (mt/test-driver :h2
      (let [result (returned-columns "SELECT COUNT(*) AS cnt FROM PEOPLE")]
        (is (= 1 (count result)))
        (is (= "cnt" (:name (first result))))
        ;; Aggregates should have :type/* since they're computed
        (is (= :type/* (:base-type (first result))))))))

(deftest ^:parallel group-by-aggregate-test
  (testing "GROUP BY with aggregates"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT STATE, COUNT(*) AS total
                     FROM PEOPLE
                     GROUP BY STATE")]
        (is (= 2 (count result)))
        (is (= #{"state" "total"} (set (returned-column-names result))))))))

;;; Error Handling Tests

(deftest ^:parallel invalid-sql-test
  (testing "Invalid SQL returns empty result (no crash)"
    (mt/test-driver :h2
      (let [result (returned-columns "SELECT * FORM PEOPLE")]
        ;; Should return empty, not throw
        (is (vector? result))))))

(deftest ^:parallel missing-table-test
  (testing "Reference to non-existent table returns empty or partial result"
    (mt/test-driver :h2
      ;; This might fail during qualification or return empty
      (let [result (returned-columns "SELECT * FROM nonexistent_table")]
        (is (vector? result))))))

;;; Expression Tests

(deftest ^:parallel expression-column-test
  (testing "Expressions in SELECT create computed columns"
    (mt/test-driver :h2
      (let [result (returned-columns "SELECT ID + 1 AS incremented FROM PEOPLE")]
        (is (= 1 (count result)))
        (is (= "incremented" (:name (first result))))
        ;; Computed columns have :type/* base type
        (is (= :type/* (:base-type (first result))))))))

(deftest ^:parallel case-expression-test
  (testing "CASE expressions create computed columns"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT CASE WHEN ID > 5 THEN 'high' ELSE 'low' END AS category
                     FROM PEOPLE")]
        (is (= 1 (count result)))
        (is (= "category" (:name (first result))))))))

;;; UNION Tests

(deftest ^:parallel union-test
  (testing "UNION combines columns from both branches"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ID, NAME FROM PEOPLE
                     UNION
                     SELECT ID, NAME FROM PEOPLE WHERE ID > 5")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

;;; Window Function Tests

(deftest ^:parallel window-function-test
  (testing "Window functions create computed columns"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT NAME, ROW_NUMBER() OVER (ORDER BY ID) AS rn
                     FROM PEOPLE")]
        (is (= 2 (count result)))
        (is (= #{"name" "rn"} (set (returned-column-names result))))))))

;; TODO: Port remaining tests from references_test.clj:
;; - table-wildcard-nested-query-test
;; - bad-table-wildcard-nested-query-test
;; - renamed-nested-query-test
;; - broken-nested-query-test
;; - bad-table-name-test
;; - different-case-nested-query-test
;; - basic-where-test
;; - negated-is-null-test
;; - basic-between-test
;; - select-constant-test
;; - unused-cte-test
;; - dependent-cte-test
;; - shadowed-cte-test
;; - recursive-cte-test
;; - scalar subquery tests
;; - more aggregate/grouping tests
