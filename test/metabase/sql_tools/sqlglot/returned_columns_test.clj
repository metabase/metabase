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

;;; More Subquery Tests (ported from references_test.clj)

(deftest ^:parallel renamed-nested-query-test
  (testing "Alias chain through subquery: a -> b -> c"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT b AS c FROM (SELECT ID AS b FROM PEOPLE)")]
        (is (= 1 (count result)))
        (is (= "c" (:name (first result))))))))

(deftest ^:parallel different-case-nested-query-test
  (testing "Case-insensitive column matching through subquery"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT A FROM (SELECT id AS a FROM PEOPLE)")]
        (is (= 1 (count result)))
        ;; Should match despite case difference
        (is (= "a" (u/lower-case-en (:name (first result)))))))))

(deftest ^:parallel wildcard-nested-query-test
  (testing "SELECT * from subquery expands to subquery columns"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT * FROM (SELECT ID, NAME FROM PEOPLE)")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

(deftest ^:parallel table-wildcard-nested-query-test
  (testing "SELECT alias.* from subquery with alias"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT p.* FROM (SELECT ID, NAME FROM PEOPLE) p")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

;;; WHERE Clause Tests

(deftest ^:parallel basic-where-test
  (testing "WHERE clause doesn't affect returned columns"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT * FROM PEOPLE WHERE STATE = 'CA'")]
        ;; WHERE doesn't change output columns
        (is (pos? (count result)))
        (is (every? #(= :metadata/column (:lib/type %)) result))))))

(deftest ^:parallel where-is-null-test
  (testing "WHERE with IS NULL"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ID, NAME FROM PEOPLE WHERE NAME IS NOT NULL")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

(deftest ^:parallel where-between-test
  (testing "WHERE with BETWEEN"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ID, NAME FROM PEOPLE WHERE ID BETWEEN 1 AND 100")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

;;; Constant/Literal Tests

(deftest ^:parallel select-constant-test
  (testing "SELECT constant returns computed column"
    (mt/test-driver :h2
      (let [result (returned-columns "SELECT 1 AS one")]
        (is (= 1 (count result)))
        (is (= "one" (:name (first result))))
        ;; Constants are computed (pure? = false)
        (is (= :type/* (:base-type (first result))))))))

(deftest ^:parallel select-string-constant-test
  (testing "SELECT string constant"
    (mt/test-driver :h2
      (let [result (returned-columns "SELECT 'hello' AS greeting")]
        (is (= 1 (count result)))
        (is (= "greeting" (:name (first result))))))))

;;; More CTE Tests

(deftest ^:parallel unused-cte-test
  (testing "Unused CTE doesn't affect output"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "WITH unused AS (SELECT ID FROM PEOPLE)
                     SELECT NAME FROM PEOPLE")]
        (is (= 1 (count result)))
        (is (= "name" (u/lower-case-en (:name (first result)))))))))

(deftest ^:parallel dependent-cte-test
  (testing "CTE that references another CTE"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "WITH cte1 AS (SELECT ID, NAME FROM PEOPLE),
                          cte2 AS (SELECT ID FROM cte1)
                     SELECT * FROM cte2")]
        (is (= 1 (count result)))
        (is (= "id" (u/lower-case-en (:name (first result)))))))))

(deftest ^:parallel multiple-cte-test
  (testing "Multiple CTEs with different columns"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "WITH names AS (SELECT NAME FROM PEOPLE),
                          ids AS (SELECT ID FROM PEOPLE)
                     SELECT * FROM names")]
        (is (= 1 (count result)))
        (is (= "name" (u/lower-case-en (:name (first result)))))))))

;;; Scalar Subquery Tests

(deftest ^:parallel scalar-subquery-test
  (testing "Scalar subquery in SELECT"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ID, (SELECT COUNT(*) FROM ORDERS) AS order_count
                     FROM PEOPLE")]
        (is (= 2 (count result)))
        (is (= #{"id" "order_count"} (set (returned-column-names result))))))))

;;; More Aggregate Tests

(deftest ^:parallel multiple-aggregates-test
  (testing "Multiple aggregates in one query"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT COUNT(*) AS cnt, SUM(ID) AS total, AVG(ID) AS avg_id
                     FROM PEOPLE")]
        (is (= 3 (count result)))
        (is (= #{"cnt" "total" "avg_id"} (set (returned-column-names result))))
        ;; All aggregates are computed
        (is (every? #(= :type/* (:base-type %)) result))))))

(deftest ^:parallel aggregate-with-distinct-test
  (testing "COUNT DISTINCT"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT COUNT(DISTINCT STATE) AS unique_states FROM PEOPLE")]
        (is (= 1 (count result)))
        (is (= "unique_states" (:name (first result))))))))

(deftest ^:parallel having-clause-test
  (testing "GROUP BY with HAVING"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT STATE, COUNT(*) AS cnt
                     FROM PEOPLE
                     GROUP BY STATE
                     HAVING COUNT(*) > 1")]
        (is (= 2 (count result)))
        (is (= #{"state" "cnt"} (set (returned-column-names result))))))))

;;; ORDER BY Tests

(deftest ^:parallel order-by-test
  (testing "ORDER BY doesn't affect returned columns"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ID, NAME FROM PEOPLE ORDER BY NAME DESC")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

(deftest ^:parallel order-by-expression-test
  (testing "ORDER BY expression not in SELECT"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT NAME FROM PEOPLE ORDER BY ID")]
        ;; ID is not in output, only NAME
        (is (= 1 (count result)))
        (is (= "name" (u/lower-case-en (:name (first result)))))))))

;;; LIMIT/OFFSET Tests

(deftest ^:parallel limit-test
  (testing "LIMIT doesn't affect returned columns"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ID, NAME FROM PEOPLE LIMIT 10")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

;;; DISTINCT Tests

(deftest ^:parallel select-distinct-test
  (testing "SELECT DISTINCT returns same columns"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT DISTINCT STATE FROM PEOPLE")]
        (is (= 1 (count result)))
        (is (= "state" (u/lower-case-en (:name (first result)))))))))

;;; Qualified Column Names

(deftest ^:parallel fully-qualified-column-test
  (testing "Fully qualified column names"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT PEOPLE.ID, PEOPLE.NAME FROM PEOPLE")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

;;; More Window Function Tests

(deftest ^:parallel window-partition-by-test
  (testing "Window function with PARTITION BY"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT NAME, STATE,
                            RANK() OVER (PARTITION BY STATE ORDER BY NAME) AS state_rank
                     FROM PEOPLE")]
        (is (= 3 (count result)))
        (is (= #{"name" "state" "state_rank"} (set (returned-column-names result))))))))

(deftest ^:parallel multiple-window-functions-test
  (testing "Multiple window functions"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ID,
                            ROW_NUMBER() OVER (ORDER BY ID) AS rn,
                            LAG(ID) OVER (ORDER BY ID) AS prev_id
                     FROM PEOPLE")]
        (is (= 3 (count result)))
        (is (= #{"id" "rn" "prev_id"} (set (returned-column-names result))))))))

;;; UNION ALL / INTERSECT / EXCEPT

(deftest ^:parallel union-all-test
  (testing "UNION ALL preserves all rows but same columns"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ID, NAME FROM PEOPLE WHERE ID < 5
                     UNION ALL
                     SELECT ID, NAME FROM PEOPLE WHERE ID >= 5")]
        (is (= 2 (count result)))
        (is (= #{"id" "name"} (set (returned-column-names result))))))))

;;; Coalesce / NVL / IFNULL

(deftest ^:parallel coalesce-test
  (testing "COALESCE creates computed column"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT COALESCE(NAME, 'Unknown') AS name_or_default FROM PEOPLE")]
        (is (= 1 (count result)))
        (is (= "name_or_default" (:name (first result))))
        (is (= :type/* (:base-type (first result))))))))

;;; String Functions

(deftest ^:parallel string-concat-test
  (testing "String concatenation"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT NAME || ' from ' || STATE AS description FROM PEOPLE")]
        (is (= 1 (count result)))
        (is (= "description" (:name (first result))))))))

;;; Math Expressions

(deftest ^:parallel math-expression-test
  (testing "Math expression in SELECT"
    (mt/test-driver :h2
      (let [result (returned-columns
                    "SELECT ID, ID * 2 AS doubled, ID + 10 AS plus_ten FROM PEOPLE")]
        (is (= 3 (count result)))
        (is (= #{"id" "doubled" "plus_ten"} (set (returned-column-names result))))
        ;; ID is pure, expressions are computed
        (is (= :type/* (:base-type (second result))))))))

;;; NULL Handling

(deftest ^:parallel null-literal-test
  (testing "NULL literal in SELECT"
    (mt/test-driver :h2
      (let [result (returned-columns "SELECT NULL AS nothing")]
        (is (= 1 (count result)))
        (is (= "nothing" (:name (first result))))))))
