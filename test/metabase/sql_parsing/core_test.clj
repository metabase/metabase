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
    (is (= [[nil nil "users"]]
           (sql-parsing/referenced-tables "postgres" "SELECT * FROM users"))))

  (testing "Multiple tables from JOIN"
    (is (= [[nil nil "orders"] [nil nil "users"]]
           (sql-parsing/referenced-tables
            "postgres"
            "SELECT * FROM users u LEFT JOIN orders o ON u.id = o.user_id"))))

  (testing "Schema-qualified tables are preserved"
    (is (= [[nil "other" "users"] [nil "public" "users"]]
           (sql-parsing/referenced-tables
            "postgres"
            "SELECT public.users.id, other.users.id
             FROM public.users u1
             LEFT JOIN other.users u2 ON u1.id = u2.id"))))

  (testing "CTE names are excluded"
    (is (= [[nil nil "users"]]
           (sql-parsing/referenced-tables
            "postgres"
            "WITH active AS (SELECT * FROM users WHERE active) SELECT * FROM active")))))

(deftest ^:parallel cte-test
  (testing "CTE (WITH clause) parsing"
    (is (= [[nil nil "users"]]
           (sql-parsing/referenced-tables
            "postgres"
            "WITH active_users AS (SELECT * FROM users WHERE active)
                             SELECT * FROM active_users")))))

(deftest ^:parallel join-test
  (testing "JOIN parsing extracts all tables"
    (is (=? [[nil nil "orders"] [nil nil "users"]]
            (sql-parsing/referenced-tables
             "postgres"
             "SELECT u.name, o.total
                             FROM users u
                             JOIN orders o ON u.id = o.user_id")))))

(deftest ^:parallel subquery-test
  (testing "Subquery table extraction"
    (is (=? [[nil nil "users"]]
            (sql-parsing/referenced-tables
             "postgres"
             "SELECT * FROM (SELECT id FROM users) AS sub")))))

;;; ---------------------------------------- Catalog/Schema Extraction Tests ----------------------------------------
;;; These tests verify the 3-tuple (tables) and 4-tuple (fields) API per the design doc:
;;; - BigQuery: project.dataset.table → [project, dataset, table]
;;; - Snowflake: database.schema.table → [database, schema, table]
;;; - PostgreSQL: schema.table → [nil, schema, table]
;;; - MySQL: database.table → [nil, database, table] (MySQL's "database" = schema level)

(deftest ^:parallel catalog-schema-tables-bigquery-test
  (testing "BigQuery: project.dataset.table extracts all three levels"
    (is (= [["myproject" "analytics" "events"]]
           (sql-parsing/referenced-tables "bigquery" "SELECT * FROM myproject.analytics.events")))
    (is (= [["myproject" "analytics" "events"] ["myproject" "analytics" "users"]]
           (sql-parsing/referenced-tables "bigquery"
                                          "SELECT * FROM myproject.analytics.events e
                                           JOIN myproject.analytics.users u ON e.user_id = u.id")))))

(deftest ^:parallel catalog-schema-tables-snowflake-test
  (testing "Snowflake: database.schema.table extracts all three levels"
    ;; Snowflake uppercases identifiers by default
    (let [result (sql-parsing/referenced-tables "snowflake" "SELECT * FROM mydb.public.orders")
          normalized (mapv (fn [[c s t]] [(some-> c u/lower-case-en)
                                          (some-> s u/lower-case-en)
                                          (u/lower-case-en t)])
                           result)]
      (is (= [["mydb" "public" "orders"]] normalized)))))

(deftest ^:parallel catalog-schema-tables-postgres-test
  (testing "PostgreSQL: schema.table (no cross-database queries)"
    (is (= [[nil "public" "users"]]
           (sql-parsing/referenced-tables "postgres" "SELECT * FROM public.users")))
    (is (= [[nil "other_schema" "accounts"] [nil "public" "users"]]
           (sql-parsing/referenced-tables "postgres"
                                          "SELECT * FROM public.users u
                                           JOIN other_schema.accounts a ON u.id = a.user_id")))))

(deftest ^:parallel catalog-schema-tables-mysql-test
  (testing "MySQL: database.table (MySQL 'database' maps to schema slot)"
    ;; In MySQL, CREATE SCHEMA = CREATE DATABASE, so there's no separate schema level
    ;; SQLGlot maps MySQL's database to the schema slot (slot 2)
    (is (= [[nil "mydb" "users"]]
           (sql-parsing/referenced-tables "mysql" "SELECT * FROM mydb.users")))
    (is (= [[nil nil "users"]]
           (sql-parsing/referenced-tables "mysql" "SELECT * FROM users")))))

(deftest ^:parallel catalog-schema-fields-bigquery-test
  (testing "BigQuery: fully-qualified field references"
    (is (= [["myproject" "analytics" "users" "email"]]
           (sql-parsing/referenced-fields "bigquery"
                                          "SELECT myproject.analytics.users.email
                                           FROM myproject.analytics.users")))))

(deftest ^:parallel catalog-schema-fields-postgres-test
  (testing "PostgreSQL: schema-qualified field references"
    (is (= [[nil "public" "orders" "total"]]
           (sql-parsing/referenced-fields "postgres" "SELECT public.orders.total FROM public.orders")))))

(deftest ^:parallel catalog-schema-fields-mysql-test
  (testing "MySQL: database-qualified field references"
    (is (= [[nil "mydb" "users" "id"]]
           (sql-parsing/referenced-fields "mysql" "SELECT mydb.users.id FROM mydb.users")))
    (is (= [[nil nil "users" "id"]]
           (sql-parsing/referenced-fields "mysql" "SELECT id FROM users")))))

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
              (format "dialect %s: each element should be [catalog schema table] tuple" dialect)))))

    (doseq [[dialect sql] udtf-with-table-queries]
      (testing (str "dialect: " dialect " - UDTF mixed with real table")
        (let [result (sql-parsing/referenced-tables (name dialect) sql)]
          ;; Case-insensitive comparison since dialects like Snowflake uppercase identifiers
          ;; 3-tuple: [catalog schema table] - table is third element
          (is (some #(= "orders" (u/lower-case-en (nth % 2))) result)
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
              ;; 3-tuple: [catalog schema table]
              normalized (into #{} (map (fn [[catalog schema table]]
                                          [(some-> catalog u/lower-case-en)
                                           (some-> schema u/lower-case-en)
                                           (u/lower-case-en table)])
                                        result))]
          (is (= #{[nil nil "a"] [nil nil "b"]} normalized)
              (format "%s/%s should return [[nil nil a] [nil nil b]], got %s"
                      (name dialect) (name op-type) normalized)))))))

(def ^:private set-operation->returned-columns
  {:union          ["id" "name"]
   :union-all      ["id" "name"]
   :intersect      ["id"]
   :except         ["id"]
   :nested-union   ["id"]
   :cte-with-union ["id"]})

(deftest ^:parallel set-operation-validate-query-test
  (testing "Set operations validate correctly across dialects"
    (doseq [[dialect ops] dialect->set-operation->query
            [op-type sql] ops]
      (testing (str "dialect: " (name dialect) " - " (name op-type))
        (let [result (sql-parsing/validate-query (name dialect) sql "public" {})]
          (is (= "ok" (:status result))
              (format "%s/%s should validate OK, got %s"
                      (name dialect) (name op-type) result)))))))

(deftest ^:parallel set-operation-returned-columns-lineage-test
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

;;; -------------------------------------------- Schema Validation Tests (validate-query) ------------------------------------------------

;; validate-query validates SQL against a provided schema, detecting:
;; - Missing columns (column doesn't exist in any table)
;; - Missing table aliases (table wildcard references non-existent source)
;; - Unknown tables (table not in schema)

(def ^:private test-schema
  "Test schema for validation tests.
   Structure: {schema-name {table-name {column-name type}}}"
  {"PUBLIC" {"PRODUCTS" {"ID" "INT"
                         "TITLE" "VARCHAR"
                         "CATEGORY" "VARCHAR"
                         "PRICE" "DECIMAL"}
             "ORDERS" {"ID" "INT"
                       "USER_ID" "INT"
                       "PRODUCT_ID" "INT"
                       "TOTAL" "DECIMAL"}
             "USERS" {"ID" "INT"
                      "NAME" "VARCHAR"
                      "EMAIL" "VARCHAR"}}})

(deftest ^:parallel validate-query-valid-queries-test
  (testing "Valid queries against schema"
    (testing "simple select with existing columns"
      (is (= "ok" (:status (sql-parsing/validate-query nil "SELECT id, title FROM products" "PUBLIC" test-schema)))))

    (testing "wildcard select"
      (is (= "ok" (:status (sql-parsing/validate-query nil "SELECT * FROM products" "PUBLIC" test-schema)))))

    (testing "table-qualified columns"
      (is (= "ok" (:status (sql-parsing/validate-query nil "SELECT products.id, products.title FROM products" "PUBLIC" test-schema)))))

    (testing "join with valid columns"
      (is (= "ok" (:status (sql-parsing/validate-query nil
                                                       "SELECT o.id, p.title FROM orders o JOIN products p ON o.product_id = p.id"
                                                       "PUBLIC" test-schema)))))

    (testing "subquery"
      (is (= "ok" (:status (sql-parsing/validate-query nil
                                                       "SELECT * FROM (SELECT id, title FROM products) AS sub"
                                                       "PUBLIC" test-schema)))))))

(deftest ^:parallel validate-query-missing-column-test
  (testing "Missing column errors"
    (testing "non-existent column"
      (let [result (sql-parsing/validate-query nil "SELECT bad_column FROM products" "PUBLIC" test-schema)]
        (is (= "error" (:status result)))
        (is (= "column_not_resolved" (:type result)))
        (is (re-find #"(?i)bad_column" (:column result)))))

    (testing "column from wrong table"
      (let [result (sql-parsing/validate-query nil "SELECT email FROM products" "PUBLIC" test-schema)]
        (is (= "error" (:status result)))
        (is (= "column_not_resolved" (:type result)))))))

(deftest ^:parallel validate-query-missing-table-alias-test
  (testing "Missing table alias errors"
    (testing "table wildcard with non-existent table"
      (let [result (sql-parsing/validate-query nil "SELECT products.* FROM orders" "PUBLIC" test-schema)]
        (is (= "error" (:status result)))
        ;; SQLGlot reports this as unknown_table
        (is (contains? #{"unknown_table" "column_not_resolved"} (:type result)))))

    (testing "qualified column with non-existent alias"
      (let [result (sql-parsing/validate-query nil "SELECT p.id FROM products" "PUBLIC" test-schema)]
        (is (= "error" (:status result)))))))

(deftest ^:parallel validate-query-unknown-table-test
  ;; SQLGlot's qualify.qualify() does NOT detect unknown tables - it just doesn't qualify them.
  ;; Unknown table detection happens at the sql-tools layer by matching referenced tables
  ;; against Metabase's database metadata.
  (testing "Unknown tables are not detected by SQLGlot (known limitation)"
    (let [result (sql-parsing/validate-query nil "SELECT * FROM nonexistent" "PUBLIC" test-schema)]
      (is (= "ok" (:status result))
          "SQLGlot passes unknown tables through without error"))))

(deftest ^:parallel validate-query-syntax-error-test
  (testing "Syntax errors are caught"
    (let [result (sql-parsing/validate-query nil "SELECT * FORM products" "PUBLIC" test-schema)]
      (is (= "error" (:status result)))
      (is (= "invalid_expression" (:type result))))))

(deftest ^:parallel lenient-parsing-incomplete-limit-test
  (testing "SQLGlot's lenient parsing treats 'SELECT 1 LIMIT' as 'SELECT 1 AS LIMIT'"
    ;; This documents a known SQLGlot behavior where incomplete LIMIT clauses
    ;; are parsed as column aliases. Workspace tests that relied on this failing
    ;; have been updated to use 'SELECT * FROM nonexistent_table' instead.
    (let [result (sql-parsing/validate-sql-query "postgres" "SELECT 1 LIMIT")]
      (is (:valid result)
          "SQLGlot parses 'SELECT 1 LIMIT' as valid SQL (as 'SELECT 1 AS LIMIT')"))

    (let [result (sql-parsing/referenced-tables "postgres" "SELECT 1 LIMIT")]
      (is (= [] result)
          "No tables are referenced in 'SELECT 1 LIMIT'")))

  (testing "To reliably trigger SQL errors, use nonexistent tables instead"
    ;; This is the recommended pattern for tests that need to trigger SQL failures
    (let [result (sql-parsing/referenced-tables "postgres" "SELECT * FROM nonexistent_table_xyz")]
      (is (= [[nil nil "nonexistent_table_xyz"]] result)
          "Nonexistent table reference is parsed and will fail at execution time"))))

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
        (try
          (sql-parsing/referenced-tables q driver)
          true
          (catch Exception _ false))))))

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
        result)))

  ;; Run all invalid query tests
  (doseq [tc (:invalid-queries (load-validation-test-cases))]
    (let [result (validate-test-case tc)]
      (when-not (:passed result)
        result))))

;;; -------------------------------------------- Referenced Fields Tests --------------------------------------------

(defn- load-referenced-fields-test-cases
  "Load referenced fields test cases from EDN file."
  []
  (let [resource (io/resource "metabase/sql_parsing/referenced_fields_test_cases.edn")]
    (when-not resource
      (throw (ex-info "Could not find referenced_fields_test_cases.edn" {})))
    (read-string (slurp resource))))

(defn- normalize-fields
  "Normalize field references for comparison (sort and ensure consistent format).
   Handles both 2-tuples (expected format in test cases) and 4-tuples (actual API format)."
  [fields]
  (vec (sort-by (fn [f]
                  (if (= 4 (count f))
                    ;; 4-tuple: [catalog schema table field]
                    [(u/lower-case-en (nth f 2)) (u/lower-case-en (nth f 3))]
                    ;; 2-tuple: [table field] (test case format)
                    [(u/lower-case-en (first f)) (u/lower-case-en (second f))]))
                (map (fn [f]
                       (if (= 4 (count f))
                         ;; Convert 4-tuple to 2-tuple for comparison
                         [(u/lower-case-en (nth f 2)) (u/lower-case-en (nth f 3))]
                         ;; Already 2-tuple
                         [(u/lower-case-en (first f)) (u/lower-case-en (second f))]))
                     fields))))

(defn- fields-match?
  "Check if actual fields match expected fields (case-insensitive, order-independent)."
  [expected actual]
  (= (normalize-fields expected)
     (normalize-fields actual)))

(deftest ^:parallel referenced-fields-test
  (testing "Referenced fields extraction from SQL queries"
    (let [test-cases (:test-cases (load-referenced-fields-test-cases))]
      (doseq [test-case test-cases]
        (testing (:name test-case)
          (let [{:keys [sql dialect expected]} test-case
                actual (sql-parsing/referenced-fields dialect sql)]
            (is (fields-match? expected actual)
                (str "Test '" (:name test-case) "' failed"
                     "\n  SQL: " sql
                     "\n  Expected: " (pr-str (normalize-fields expected))
                     "\n  Actual:   " (pr-str (normalize-fields actual))))))))))

(deftest ^:parallel referenced-fields-dialect-support-test
  (testing "Referenced fields works across different SQL dialects"
    (doseq [dialect ["postgres" "mysql" "snowflake" "bigquery" "redshift" "duckdb"]]
      (testing (str "dialect: " dialect)
        (let [result (sql-parsing/referenced-fields dialect "SELECT id, name FROM users WHERE active = true")]
          (is (seq result)
              (str "Should return fields for " dialect))
          (is (every? #(and (vector? %) (= 4 (count %))) result)
              (str "Each field should be [catalog schema table field] tuple for " dialect)))))))

(deftest ^:parallel referenced-fields-wildcard-test
  (testing "Wildcard handling in referenced fields"
    (testing "Unqualified wildcard - single table"
      (let [result (sql-parsing/referenced-fields "postgres" "SELECT * FROM users")]
        (is (fields-match? [["users" "*"]] result))))

    (testing "Unqualified wildcard - multiple tables"
      (let [result (sql-parsing/referenced-fields "postgres" "SELECT * FROM users u LEFT JOIN orders o ON u.id = o.user_id")]
        (is (some #(= ["orders" "*"] %) (normalize-fields result))
            "Should include orders wildcard")
        (is (some #(= ["users" "*"] %) (normalize-fields result))
            "Should include users wildcard")))

    (testing "Qualified wildcard"
      (let [result (sql-parsing/referenced-fields "postgres" "SELECT u.* FROM users u")]
        (is (fields-match? [["users" "*"]] result))))

    (testing "Mixed wildcards and specific columns"
      (let [result (sql-parsing/referenced-fields "postgres" "SELECT u.*, t.total FROM users u, transactions t WHERE u.id = t.user_id")]
        (is (some #(= ["users" "*"] %) (normalize-fields result))
            "Should include users wildcard")
        (is (some #(= ["transactions" "total"] %) (normalize-fields result))
            "Should include transactions.total")))))
