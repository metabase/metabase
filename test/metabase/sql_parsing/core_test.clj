(ns metabase.sql-parsing.core-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- SQL Parsing Tests -------------------------------------------------

;; Note: The following tests use sql-parsing/p which no longer exists
;; They are commented out pending implementation of that function or refactoring

#_(deftest ^:parallel basic-select-test
    (testing "Simple SELECT parses correctly"
      (let [result (sql-parsing/p "SELECT id, name FROM users")]
        (is (= ["users"] (:tables_source result)))
        (is (= ["id" "name"] (sort (:columns result)))))))

;;; ------------------------------------------ referenced-tables API Tests -----------------------------------------

(deftest ^:parallel referenced-tables-basic-test
  (testing "Simple table extraction"
    (is (= [[nil "users"]]
           (sql-parsing/referenced-tables "postgres" "SELECT * FROM users"))))

  (testing "Multiple tables from JOIN"
    (is (= [[nil "orders"] [nil "users"]]
           (sql-parsing/referenced-tables
            "postgres"
            "SELECT * FROM users u LEFT JOIN orders o ON u.id = o.user_id"))))

  (testing "Schema-qualified tables are preserved"
    (is (= [["other" "users"] ["public" "users"]]
           (sql-parsing/referenced-tables
            "postgres"
            "SELECT public.users.id, other.users.id
             FROM public.users u1
             LEFT JOIN other.users u2 ON u1.id = u2.id"))))

  (testing "CTE names are excluded"
    (is (= [[nil "users"]]
           (sql-parsing/referenced-tables
            "postgres"
            "WITH active AS (SELECT * FROM users WHERE active) SELECT * FROM active")))))

(deftest ^:parallel cte-test
    (testing "CTE (WITH clause) parsing"
      (is (= [[nil "users"]]
             (sql-parsing/referenced-tables
              "postgres"
              "WITH active_users AS (SELECT * FROM users WHERE active)
                             SELECT * FROM active_users")))))

(deftest ^:parallel join-test
  (testing "JOIN parsing extracts all tables"
    (is (=? [[nil "orders"] [nil "users"]]
            (sql-parsing/referenced-tables
             "postgres"
             "SELECT u.name, o.total
                             FROM users u
                             JOIN orders o ON u.id = o.user_id")))))

(deftest ^:parallel subquery-test
    (testing "Subquery table extraction"
      (is (=? [[nil "users"]]
              (sql-parsing/referenced-tables
               "postgres"
               "SELECT * FROM (SELECT id FROM users) AS sub")))))

#_(deftest ^:parallel aggregate-test
    (testing "Aggregate functions in projections"
      (let [result (sql-parsing/p "SELECT COUNT(*), SUM(amount) FROM orders")]
        (is (= ["orders"] (:tables_source result)))
        ;; Projections are named_selects - unnamed aggregates may not appear
        (is (vector? (:projections result))))))

;;; -------------------------------------------- UDTF (Table Function) Tests -----------------------------------------

;; Dialect-specific UDTF queries - each dialect may have slightly different syntax
;; for table-valued functions. The queries should be semantically equivalent.
;; We use a generic function name for dialects without well-known UDTFs to test
;; that unknown functions are handled gracefully.
(def udtf-queries
  {:postgres  "SELECT * FROM generate_series(1, 10)"
   :mysql     "SELECT * FROM my_table_func(1, 10)"  ; MySQL's JSON_TABLE has complex syntax
   :snowflake "SELECT * FROM TABLE(FLATTEN(input => ARRAY_CONSTRUCT(1, 2, 3)))"
   :bigquery  "SELECT * FROM UNNEST([1, 2, 3]) AS val"
   :redshift  "SELECT * FROM generate_series(1, 10)"
   :duckdb    "SELECT * FROM generate_series(1, 10)"})

;; UDTF queries mixed with real tables - tests that we correctly identify real tables
;; while gracefully handling table functions
(def udtf-with-table-queries
  {:postgres  "SELECT o.* FROM orders o, generate_series(1, 10) g"
   :mysql     "SELECT o.* FROM orders o, my_table_func(1, 10) t"
   :snowflake "SELECT o.* FROM orders o, TABLE(FLATTEN(input => ARRAY_CONSTRUCT(1))) f"
   :bigquery  "SELECT o.* FROM orders o, UNNEST([1]) AS val"
   :redshift  "SELECT o.* FROM orders o, generate_series(1, 10) g"
   :duckdb    "SELECT o.* FROM orders o, generate_series(1, 10) g"})

(deftest ^:parallel udtf-referenced-tables-test
  (testing "UDTFs are handled by referenced-tables across dialects"
    (doseq [[dialect sql] udtf-queries]
      (testing (str "dialect: " dialect " - pure UDTF query")
        ;; Table functions shouldn't appear as referenced tables - they're not real tables
        (let [result (sql-parsing/referenced-tables (name dialect) sql)]
          (is (vector? result)
              (format "dialect %s: should return vector, got %s" dialect (type result)))
          (is (every? vector? result)
              (format "dialect %s: each element should be [schema table] pair" dialect)))))

    (doseq [[dialect sql] udtf-with-table-queries]
      (testing (str "dialect: " dialect " - UDTF mixed with real table")
        (let [result (sql-parsing/referenced-tables (name dialect) sql)]
          ;; Case-insensitive comparison since dialects like Snowflake uppercase identifiers
          (is (some #(= "orders" (u/lower-case-en (second %))) result)
              (format "dialect %s: should find 'orders' table in %s" dialect (pr-str result))))))))

#_(deftest ^:parallel udtf-returned-columns-lineage-test
    (testing "UDTFs are handled by returned-columns-lineage across dialects"
      (doseq [[dialect sql] udtf-queries]
        (testing (str "dialect: " dialect)
        ;; UDTFs should not cause assertion errors - they return lineage with empty deps
        ;; since there's no real table to trace columns back to
          (let [result (sql-parsing/returned-columns-lineage (name dialect) sql "public" {})]
            (is (sequential? result)
                (format "dialect %s: should return sequential, got %s" dialect (type result))))))))

#_(deftest ^:parallel udtf-validate-query-test
    (testing "UDTFs pass validation (with infer_schema=True)"
      (doseq [[dialect sql] udtf-queries]
        (testing (str "dialect: " dialect)
        ;; This should NOT throw an error now that infer_schema=True
          (let [result (sql-parsing/validate-query (name dialect) sql "public" {})]
            (is (= :ok (:status result))
                (format "dialect %s: UDTF query should validate OK, got %s" dialect result)))))))
;;; ------------------------------------------ Set Operation Tests (UNION, INTERSECT, EXCEPT) ------------------------------------------

;; Set operation queries by dialect - tests UNION, UNION ALL, INTERSECT, EXCEPT
;; All queries use tables "a" and "b" for consistent expected results
(def dialect->set-operation->query
  {:postgres
   {:union          "SELECT id, name FROM a UNION SELECT id, name FROM b"
    :union-all      "SELECT id, name FROM a UNION ALL SELECT id, name FROM b"
    :intersect      "SELECT id FROM a INTERSECT SELECT id FROM b"
    :except         "SELECT id FROM a EXCEPT SELECT id FROM b"
    :nested-union   "SELECT * FROM (SELECT id FROM a UNION SELECT id FROM b) AS combined"
    :cte-with-union "WITH c AS (SELECT id FROM a UNION SELECT id FROM b) SELECT * FROM c"}

   :mysql
   {:union          "SELECT id, name FROM a UNION SELECT id, name FROM b"
    :union-all      "SELECT id, name FROM a UNION ALL SELECT id, name FROM b"
    :intersect      "SELECT id FROM a INTERSECT SELECT id FROM b"
    :except         "SELECT id FROM a EXCEPT SELECT id FROM b"
    :nested-union   "SELECT * FROM (SELECT id FROM a UNION SELECT id FROM b) AS combined"
    :cte-with-union "WITH c AS (SELECT id FROM a UNION SELECT id FROM b) SELECT * FROM c"}

   :snowflake
   {:union          "SELECT id, name FROM a UNION SELECT id, name FROM b"
    :union-all      "SELECT id, name FROM a UNION ALL SELECT id, name FROM b"
    :intersect      "SELECT id FROM a INTERSECT SELECT id FROM b"
    :except         "SELECT id FROM a EXCEPT SELECT id FROM b"
    :nested-union   "SELECT * FROM (SELECT id FROM a UNION SELECT id FROM b) AS combined"
    :cte-with-union "WITH c AS (SELECT id FROM a UNION SELECT id FROM b) SELECT * FROM c"}

   :bigquery
   {:union          "SELECT id, name FROM a UNION DISTINCT SELECT id, name FROM b"
    :union-all      "SELECT id, name FROM a UNION ALL SELECT id, name FROM b"
    :intersect      "SELECT id FROM a INTERSECT DISTINCT SELECT id FROM b"
    :except         "SELECT id FROM a EXCEPT DISTINCT SELECT id FROM b"
    :nested-union   "SELECT * FROM (SELECT id FROM a UNION DISTINCT SELECT id FROM b) AS combined"
    :cte-with-union "WITH c AS (SELECT id FROM a UNION DISTINCT SELECT id FROM b) SELECT * FROM c"}

   :redshift
   {:union          "SELECT id, name FROM a UNION SELECT id, name FROM b"
    :union-all      "SELECT id, name FROM a UNION ALL SELECT id, name FROM b"
    :intersect      "SELECT id FROM a INTERSECT SELECT id FROM b"
    :except         "SELECT id FROM a EXCEPT SELECT id FROM b"
    :nested-union   "SELECT * FROM (SELECT id FROM a UNION SELECT id FROM b) AS combined"
    :cte-with-union "WITH c AS (SELECT id FROM a UNION SELECT id FROM b) SELECT * FROM c"}

   :duckdb
   {:union          "SELECT id, name FROM a UNION SELECT id, name FROM b"
    :union-all      "SELECT id, name FROM a UNION ALL SELECT id, name FROM b"
    :intersect      "SELECT id FROM a INTERSECT SELECT id FROM b"
    :except         "SELECT id FROM a EXCEPT SELECT id FROM b"
    :nested-union   "SELECT * FROM (SELECT id FROM a UNION SELECT id FROM b) AS combined"
    :cte-with-union "WITH c AS (SELECT id FROM a UNION SELECT id FROM b) SELECT * FROM c"}})

(deftest ^:parallel set-operation-referenced-tables-test
  (testing "Set operations correctly identify all referenced tables across dialects"
    (doseq [[dialect ops] dialect->set-operation->query
            [op-type sql] ops]
      (testing (str "dialect: " (name dialect) " - " (name op-type))
        (let [result (sql-parsing/referenced-tables (name dialect) sql)
              ;; Normalize to lowercase for case-insensitive comparison (Snowflake uppercases)
              normalized (into #{} (map (fn [[schema table]]
                                          [(some-> schema u/lower-case-en) (u/lower-case-en table)])
                                        result))]
          (is (= #{[nil "a"] [nil "b"]} normalized)
              (format "%s/%s should return [[nil a] [nil b]], got %s"
                      (name dialect) (name op-type) normalized)))))))

#_(def ^:private set-operation->returned-columns
    {:union          ["id" "name"]
     :union-all      ["id" "name"]
     :intersect      ["id"]
     :except         ["id"]
     :nested-union   ["id"]
     :cte-with-union ["id"]})

#_(deftest ^:parallel set-operation-validate-query-test
    (testing "Set operations validate correctly across dialects"
      (doseq [[dialect ops] dialect->set-operation->query
              [op-type sql] ops]
        (testing (str "dialect: " (name dialect) " - " (name op-type))
          (let [result (sql-parsing/validate-query (name dialect) sql "public" {})]
            (is (= :ok (:status result))
                (format "%s/%s should validate OK, got %s"
                        (name dialect) (name op-type) result)))))))

#_(deftest ^:parallel set-operation-returned-columns-lineage-test
    (testing "Set operations return correct column lineage across dialects"
      (doseq [[dialect ops] dialect->set-operation->query
              [op-type sql] ops
              :let [expected (get set-operation->returned-columns op-type)]]
        (testing (str "dialect: " (name dialect) ", operation: " (name op-type))
          (let [result (sql-parsing/returned-columns-lineage (name dialect) sql "public" {})
                columns (sort (map (comp u/lower-case-en first) result))]
            (is (= expected columns)
                (format "%s %s should return %s, got %s"
                        (name dialect) (name op-type) (pr-str expected) columns)))))))

;;; -------------------------------------------- SQL Validation Tests ------------------------------------------------

(defn- load-validation-test-cases
  "Load validation test cases from EDN file."
  []
  (let [resource (io/resource "metabase/sql_parsing/validation_test_cases.edn")]
    (when-not resource
      (throw (ex-info "Could not find validation_test_cases.edn" {})))
    (read-string (slurp resource))))

(defn- contains-any?
  "Check if message contains any of the patterns (case-insensitive).
   Patterns can be:
   - A string: must be contained in message
   - A vector of strings: ANY must be contained in message"
  [message patterns]
  (let [lower-message (u/lower-case-en message)
        pattern-list (if (vector? patterns) patterns [patterns])]
    (some (fn [pattern]
            (when (string? pattern)
              (.contains lower-message (u/lower-case-en pattern))))
          pattern-list)))

(defn- error-matches?
  "Check if an actual error matches the expected error pattern.
   Expected can have:
   - :contains - string or vector of strings (any must be in error message)
   - :has-location - whether line/col should be present"
  [expected-error actual-error]
  (let [contains-patterns (:contains expected-error)
        has-location (:has-location expected-error)
        message (:message actual-error)
        line (:line actual-error)
        col (:col actual-error)]
    (and
     ;; Message contains expected pattern(s)
     (if contains-patterns
       (contains-any? message contains-patterns)
       true)
     ;; Location check
     (if (some? has-location)
       (if has-location
         (or (some? line) (some? col))
         true)
       true))))

(defn- validate-test-case
  "Run a single validation test case and return result map."
  [test-case]
  (let [{:keys [name sql dialect expected]} test-case
        result (sql-parsing/validate-sql-query dialect sql)]
    (if (= expected :valid)
      ;; Expecting valid query
      (if (:valid result)
        {:passed true :name name}
        {:passed false
         :name name
         :reason (str "Expected valid query but got errors: " (pr-str (:errors result)))
         :result result})
      ;; Expecting invalid query with specific errors
      (if-not (:valid result)
        (let [expected-errors (:errors expected)
              actual-errors (:errors result)]
          (if (every? (fn [expected-error]
                        (some #(error-matches? expected-error %) actual-errors))
                      expected-errors)
            {:passed true :name name}
            {:passed false
             :name name
             :reason (str "Error patterns don't match. Expected: " (pr-str expected-errors)
                          " Actual: " (pr-str actual-errors))
             :result result}))
        {:passed false
         :name name
         :reason "Expected invalid query but validation passed"
         :result result}))))

(deftest ^:parallel validate-sql-query-valid-queries-test
  (testing "Valid SQL queries should validate successfully"
    (let [test-cases (:valid-queries (load-validation-test-cases))]
      (doseq [test-case test-cases]
        (testing (:name test-case)
          (let [result (validate-test-case test-case)]
            (is (:passed result)
                (str "Test '" (:name test-case) "' failed: " (:reason result)
                     (when-let [r (:result result)]
                       (str "\n  SQL: " (:sql test-case)
                            "\n  Result: " (pr-str r)))))))))))

(deftest ^:parallel validate-sql-query-invalid-queries-test
  (testing "Invalid SQL queries should return validation errors"
    (let [test-cases (:invalid-queries (load-validation-test-cases))]
      (doseq [test-case test-cases]
        (testing (:name test-case)
          (let [result (validate-test-case test-case)]
            (is (:passed result)
                (str "Test '" (:name test-case) "' failed: " (:reason result)
                     (when-let [r (:result result)]
                       (str "\n  SQL: " (:sql test-case)
                            "\n  Result: " (pr-str r)))))))))))

(deftest ^:parallel validate-sql-query-edge-cases-test
  (testing "Edge cases that sqlglot considers valid"
    (let [test-cases (:edge-case-valid-queries (load-validation-test-cases))]
      (doseq [test-case test-cases]
        (testing (str (:name test-case) " - " (:note test-case))
          (let [result (validate-test-case test-case)]
            (is (:passed result)
                (str "Test '" (:name test-case) "' failed: " (:reason result)
                     (when-let [r (:result result)]
                       (str "\n  SQL: " (:sql test-case)
                            "\n  Result: " (pr-str r)))))))))))

(deftest ^:parallel validate-sql-query-dialect-support-test
  (testing "Validation works across different SQL dialects"
    (doseq [dialect ["postgres" "mysql" "snowflake" "bigquery" "redshift" "duckdb"]]
      (testing (str "dialect: " dialect)
        (let [result (sql-parsing/validate-sql-query dialect "SELECT * FROM users")]
          (is (:valid result)
              (str "Simple query should be valid for " dialect)))

        (let [result (sql-parsing/validate-sql-query dialect "SELECT * FORM users")]
          (is (not (:valid result))
              (str "Invalid query should fail for " dialect))
          (is (seq (:errors result))
              (str "Should return errors for " dialect)))))))

(comment
  (require '[clojure.string :as str])
  (def query-corpus-path "/Users/bcm/dv/mb/query_corpus/")

  (def sentinel (re-pattern "\n-----end-query-----\n"))

  (def drivers ["mysql"])

  (let [driver (first drivers)
        corpus (slurp (str query-corpus-path driver ".log"))
        queries (sort (distinct (str/split corpus sentinel)))]

    (frequencies
     (doall
      (for [q queries]
        (do (println "parsing " q)
            (try
              (sql-parsing/referenced-tables q driver)
              true
              (catch Exception _ false)))))))

  ;; Load and run validation tests interactively
  (load-validation-test-cases)

  ;; Test a single case
  (validate-test-case {:name "test"
                       :sql "SELECT * FROM users"
                       :dialect "postgres"
                       :expected :valid})

  ;; Run all valid query tests
  (doseq [tc (:valid-queries (load-validation-test-cases))]
    (let [result (validate-test-case tc)]
      (when-not (:passed result)
        (println "FAILED:" (:name tc) "-" (:reason result)))))

  ;; Run all invalid query tests
  (doseq [tc (:invalid-queries (load-validation-test-cases))]
    (let [result (validate-test-case tc)]
      (when-not (:passed result)
        (println "FAILED:" (:name tc) "-" (:reason result))))))
