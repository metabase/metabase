(ns metabase.sql-parsing.core-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

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
    ;; are parsed as column aliases.
    (let [result (sql-parsing/referenced-tables "postgres" "SELECT 1 LIMIT")]
      (is (= [] result)
          "No tables are referenced in 'SELECT 1 LIMIT'")))
  (testing "To reliably trigger SQL errors, use nonexistent tables instead"
    ;; This is the recommended pattern for tests that need to trigger SQL failures
    (let [result (sql-parsing/referenced-tables "postgres" "SELECT * FROM nonexistent_table_xyz")]
      (is (= [[nil nil "nonexistent_table_xyz"]] result)
          "Nonexistent table reference is parsed and will fail at execution time"))))

(comment
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

;;; -------------------------------------- Large literal-list stripping tests --------------------------------------

(deftest ^:parallel strip-large-values-test
  (testing "Small VALUES clauses are preserved"
    (let [sql "SELECT * FROM (VALUES (1, 'a'), (2, 'b'), (3, 'c')) AS t(id, name)"]
      (is (= sql (sql-parsing/strip-large-literal-lists sql)))))
  (testing "No VALUES keyword returns SQL unchanged"
    (let [sql "SELECT * FROM users WHERE id = 1"]
      (is (= sql (sql-parsing/strip-large-literal-lists sql)))))
  (testing "Large VALUES clause is replaced with NULLs preserving column count"
    (let [tuples (str/join ", " (map #(format "(%d, '%s', %d)" % (str "name" %) (* % 10))
                                     (range 200)))
          sql    (str "SELECT * FROM (VALUES " tuples ") AS t(id, name, score)")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (str/includes? result "VALUES (NULL, NULL, NULL)"))
      (is (str/includes? result "AS t(id, name, score)"))
      (is (not (str/includes? result "name0")))))
  (testing "Multiple large VALUES clauses are all stripped"
    (let [tuples1 (str/join ", " (map #(format "(%d)" %) (range 200)))
          tuples2 (str/join ", " (map #(format "(%d, %d)" % (* % 2)) (range 200)))
          sql     (str "WITH a AS (SELECT * FROM (VALUES " tuples1 ") AS t(x)), "
                       "b AS (SELECT * FROM (VALUES " tuples2 ") AS t(y, z)) "
                       "SELECT * FROM a JOIN b ON a.x = b.y")
          result  (sql-parsing/strip-large-literal-lists sql)]
      (is (str/includes? result "VALUES (NULL)"))
      (is (str/includes? result "VALUES (NULL, NULL)"))))
  (testing "VALUES keyword casing is preserved"
    (let [tuples (str/join ", " (map #(format "(%d)" %) (range 200)))
          sql    (str "select * from (values " tuples ") as t(x)")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (str/includes? result "values (NULL)"))))
  (testing "VALUES inside a string literal is not stripped"
    (let [sql "SELECT 'INSERT INTO foo VALUES (1,2,3)' AS example FROM bar"]
      (is (= sql (sql-parsing/strip-large-literal-lists sql)))))
  (testing "Column named values is not stripped"
    (let [sql "SELECT values FROM my_table WHERE values > 10"]
      (is (= sql (sql-parsing/strip-large-literal-lists sql)))))
  (testing "VALUES keyword not followed by paren is not stripped"
    (let [sql "SELECT * FROM t WHERE col IN (SELECT values FROM other)"]
      (is (= sql (sql-parsing/strip-large-literal-lists sql)))))
  (testing "INSERT INTO ... VALUES is stripped when large"
    (let [tuples (str/join ", " (map #(format "(%d, 'x')" %) (range 200)))
          sql    (str "INSERT INTO foo VALUES " tuples)
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (str/includes? result "VALUES (NULL, NULL)"))
      (is (not (str/includes? result "(0, 'x')"))))))

(deftest ^:parallel strip-large-in-lists-test
  (testing "Small IN lists are preserved"
    (let [sql "SELECT * FROM t WHERE id IN (1, 2, 3)"]
      (is (= sql (sql-parsing/strip-large-literal-lists sql)))))
  (testing "Large literal IN list is replaced with IN (NULL)"
    (let [sql    (str "SELECT * FROM t WHERE id IN (" (str/join ", " (range 200)) ") AND active = true")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (= "SELECT * FROM t WHERE id IN (NULL) AND active = true" result))))
  (testing "Large IN list of strings, negatives, and decimals is stripped"
    (let [items  (concat (map #(format "'name %d'" %) (range 100))
                         (map #(str "-" %) (range 50))
                         ["1.5" "+2"])
          sql    (str "SELECT * FROM t WHERE name IN (" (str/join ", " items) ")")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (= "SELECT * FROM t WHERE name IN (NULL)" result))))
  (testing "IN keyword casing is preserved"
    (let [sql    (str "SELECT * FROM t WHERE id in (" (str/join ", " (range 200)) ")")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (str/includes? result "in (NULL)"))))
  (testing "NOT IN with a large literal list is stripped"
    (let [sql    (str "SELECT * FROM t WHERE id NOT IN (" (str/join ", " (range 200)) ")")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (= "SELECT * FROM t WHERE id NOT IN (NULL)" result))))
  (testing "Multiple large IN lists are all stripped"
    (let [in1    (str/join ", " (range 200))
          in2    (str/join ", " (map #(format "'x%d'" %) (range 200)))
          sql    (str "SELECT * FROM t WHERE a IN (" in1 ") OR b IN (" in2 ")")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (= "SELECT * FROM t WHERE a IN (NULL) OR b IN (NULL)" result))))
  (testing "IN with a subquery is not stripped"
    (let [sql "SELECT * FROM t WHERE id IN (SELECT id FROM other)"]
      (is (= sql (sql-parsing/strip-large-literal-lists sql)))))
  (testing "A large IN list nested inside an unstripped IN subquery is still stripped"
    (let [sql    (str "SELECT * FROM t WHERE id IN (SELECT id FROM other WHERE x IN ("
                      (str/join ", " (range 200)) "))")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (= "SELECT * FROM t WHERE id IN (SELECT id FROM other WHERE x IN (NULL))" result))))
  (testing "Large IN lists containing non-literals are not stripped"
    (doseq [extra-item ["col_ref" "foo(1)" "?" "$1" "{{param}}" "1e5" "DATE '2024-01-01'" "NULL"]]
      (let [sql (str "SELECT * FROM t WHERE id IN (" (str/join ", " (concat (range 200) [extra-item])) ")")]
        (is (= sql (sql-parsing/strip-large-literal-lists sql))
            (str "list containing " (pr-str extra-item) " should not be stripped")))))
  (testing "Word boundaries: JOIN ( and INT( do not trigger IN matching"
    (let [sql "SELECT CAST(x AS INT) FROM a JOIN (SELECT * FROM b) c ON a.id = c.id"]
      (is (= sql (sql-parsing/strip-large-literal-lists sql)))))
  (testing "Large VALUES and IN in the same statement are both stripped"
    (let [tuples (str/join ", " (map #(format "(%d)" %) (range 200)))
          sql    (str "WITH v AS (SELECT * FROM (VALUES " tuples ") AS t(x)) "
                      "SELECT * FROM v WHERE x IN (" (str/join ", " (range 200)) ")")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (= "WITH v AS (SELECT * FROM (VALUES (NULL)) AS t(x)) SELECT * FROM v WHERE x IN (NULL)" result)))))

(deftest ^:parallel large-in-list-referenced-tables-test
  (testing "referenced-tables and referenced-fields work on queries with massive IN lists"
    (let [sql (str "SELECT a.name FROM accounts a WHERE a.id IN (" (str/join ", " (range 20000)) ")")]
      (is (= [[nil nil "accounts"]] (sql-parsing/referenced-tables "postgres" sql)))
      (is (= [[nil nil "accounts" "id"] [nil nil "accounts" "name"]]
             (sort (sql-parsing/referenced-fields "postgres" sql)))))))

(defn- in-list
  "Build `IN (0, 1, ..., n-1)` with `n` items."
  [n]
  (str "IN (" (str/join ", " (range n)) ")"))

(deftest ^:parallel strip-threshold-boundary-test
  (testing "IN lists at or below the 100-item threshold are preserved, above it stripped"
    (doseq [n [1 2 50 99 100]]
      (let [sql (str "SELECT * FROM t WHERE id " (in-list n))]
        (is (= sql (sql-parsing/strip-large-literal-lists sql))
            (str n " items should not be stripped"))))
    (doseq [n [101 102 150 1000 10000]]
      (let [sql (str "SELECT * FROM t WHERE id " (in-list n))]
        (is (= "SELECT * FROM t WHERE id IN (NULL)" (sql-parsing/strip-large-literal-lists sql))
            (str n " items should be stripped")))))
  (testing "VALUES at or below the 100-tuple threshold are preserved, above it stripped"
    (doseq [[n stripped?] {1 false, 100 false, 101 true, 1000 true}]
      (let [tuples (str/join ", " (map #(format "(%d, %d)" % %) (range n)))
            sql    (str "SELECT * FROM (VALUES " tuples ") AS t(x, y)")
            result (sql-parsing/strip-large-literal-lists sql)]
        (if stripped?
          (is (= "SELECT * FROM (VALUES (NULL, NULL)) AS t(x, y)" result)
              (str n " tuples should be stripped"))
          (is (= sql result)
              (str n " tuples should not be stripped")))))))

(deftest ^:parallel strip-in-list-literal-shapes-test
  (testing "Lists of each literal shape are stripped"
    (doseq [[shape item-fn] {"integers"       str
                             "decimals"       #(str % ".5")
                             "negatives"      #(str "-" %)
                             "plus-signed"    #(str "+" %)
                             "single-quoted"  #(format "'name %d'" %)
                             "commas-inside-strings"  #(format "'a,%d,b'" %)
                             "escaped-quotes" #(format "'it''s %d'" %)}]
      (let [sql (str "SELECT * FROM t WHERE x IN (" (str/join ", " (map item-fn (range 150))) ")")]
        (is (= "SELECT * FROM t WHERE x IN (NULL)" (sql-parsing/strip-large-literal-lists sql))
            (str shape " should be stripped")))))
  (testing "Whitespace variants are stripped"
    (doseq [sql [(str "SELECT * FROM t WHERE x IN(" (str/join "," (range 150)) ")")
                 (str "SELECT * FROM t WHERE x IN\n  (" (str/join " ,\n" (range 150)) ")")
                 (str "SELECT * FROM t WHERE x in (" (str/join ",\t" (range 150)) ")")]]
      (is (str/includes? (sql-parsing/strip-large-literal-lists sql) "(NULL)")
          (pr-str (subs sql 0 40))))))

(deftest ^:parallel strip-in-list-disqualifiers-test
  (testing "One non-literal item anywhere in a large list prevents stripping"
    (doseq [bad ["col_ref" "some_column" "foo(1)" "?" "$1" "{{param}}" "%(name)s"
                 "1e5" "NULL" "DATE '2024-01-01'" "TIMESTAMP '2024-01-01 00:00:00'"
                 "1::int" "x.y" "CURRENT_DATE" "-- comment" "héllo" "N'abc'"
                 "\"quoted_identifier\"" "null1"]
            position [:first :middle :last]]
      (let [items (map str (range 150))
            items (case position
                    :first  (cons bad items)
                    :middle (concat (take 75 items) [bad] (drop 75 items))
                    :last   (concat items [bad]))
            sql   (str "SELECT * FROM t WHERE x IN (" (str/join ", " items) ")")]
        (is (= sql (sql-parsing/strip-large-literal-lists sql))
            (str (pr-str bad) " at " position " should prevent stripping")))))
  (testing "Subqueries are never stripped regardless of size"
    (let [sql "SELECT * FROM t WHERE x IN (SELECT id FROM u WHERE y = 'a' AND z IN ('b', 'c'))"]
      (is (= sql (sql-parsing/strip-large-literal-lists sql)))))
  (testing "A large list of double-quoted identifiers is not stripped (they are column references
            in identifier-quoting dialects, not strings)"
    (let [sql (str "SELECT * FROM t WHERE x IN (" (str/join ", " (map #(format "\"col_%d\"" %) (range 150))) ")")]
      (is (identical? sql (sql-parsing/strip-large-literal-lists sql))))))

(deftest ^:parallel strip-preserves-surroundings-test
  (testing "Everything around a stripped list is preserved byte-for-byte"
    (let [prefix "WITH cte AS (SELECT 1 AS x) SELECT t.a, cte.x FROM t JOIN cte ON TRUE WHERE t.id "
          suffix " AND t.status = 'active' ORDER BY t.a LIMIT 5"
          sql    (str prefix (in-list 150) suffix)]
      (is (= (str prefix "IN (NULL)" suffix)
             (sql-parsing/strip-large-literal-lists sql)))))
  (testing "Several lists in one statement are stripped/kept independently"
    (let [sql (str "SELECT * FROM t WHERE a " (in-list 150)
                   " OR b " (in-list 3)
                   " OR c NOT " (in-list 200)
                   " OR d IN (SELECT x FROM u)")]
      (is (= (str "SELECT * FROM t WHERE a IN (NULL)"
                  " OR b " (in-list 3)
                  " OR c NOT IN (NULL)"
                  " OR d IN (SELECT x FROM u)")
             (sql-parsing/strip-large-literal-lists sql))))))

(deftest ^:parallel strip-nesting-test
  (testing "A large IN list inside a small VALUES tuple is stripped"
    (let [sql (str "SELECT * FROM (VALUES ((SELECT count(*) FROM u WHERE u.id " (in-list 150) "))) t")]
      (is (= "SELECT * FROM (VALUES ((SELECT count(*) FROM u WHERE u.id IN (NULL)))) t"
             (sql-parsing/strip-large-literal-lists sql)))))
  (testing "A large IN list inside a stripped VALUES clause disappears with it"
    (let [tuples (str/join ", " (map #(format "(%d)" %) (range 150)))
          sql    (str "SELECT * FROM (VALUES " tuples ", ((SELECT 1 WHERE x " (in-list 150) "))) t")
          result (sql-parsing/strip-large-literal-lists sql)]
      (is (= "SELECT * FROM (VALUES (NULL)) t" result))))
  (testing "IN subqueries nest arbitrarily deep and the innermost large list is still found"
    (let [sql (str "SELECT * FROM a WHERE x IN "
                   "(SELECT x FROM b WHERE y IN "
                   "(SELECT y FROM c WHERE z " (in-list 150) "))")]
      (is (= (str "SELECT * FROM a WHERE x IN "
                  "(SELECT x FROM b WHERE y IN "
                  "(SELECT y FROM c WHERE z IN (NULL)))")
             (sql-parsing/strip-large-literal-lists sql))))))

(deftest ^:parallel strip-idempotency-and-identity-test
  (testing "Stripping is idempotent"
    (doseq [sql [(str "SELECT * FROM t WHERE id " (in-list 150))
                 (str "INSERT INTO foo VALUES " (str/join ", " (map #(format "(%d)" %) (range 150))))]]
      (let [once (sql-parsing/strip-large-literal-lists sql)]
        (is (= once (sql-parsing/strip-large-literal-lists once))))))
  (testing "When nothing is stripped the original string instance is returned"
    (doseq [sql ["SELECT * FROM t"
                 "SELECT * FROM t WHERE id IN (1, 2, 3)"
                 "SELECT * FROM t WHERE id IN (SELECT id FROM u)"
                 "SELECT * FROM (VALUES (1), (2)) AS t(x)"]]
      (is (identical? sql (sql-parsing/strip-large-literal-lists sql))))))

(deftest ^:parallel strip-malformed-sql-test
  (testing "Malformed or degenerate input never throws and is left unchanged"
    (doseq [sql [""
                 "IN ("
                 "VALUES ("
                 (str "SELECT * FROM t WHERE id IN (" (str/join ", " (range 150)))  ; no closing paren
                 (str "SELECT * FROM t WHERE id IN ('unterminated string, " (str/join ", " (range 150)) ")")
                 "SELECT * FROM t WHERE id IN ()"
                 "IN () VALUES ()"
                 "in(   )"]]
      (is (= sql (sql-parsing/strip-large-literal-lists sql))
          (pr-str (subs sql 0 (min 40 (count sql))))))))

(deftest ^:parallel strip-keyword-false-positives-test
  (testing "Words containing 'in'/'values' and quoted identifiers are not treated as keywords"
    (doseq [sql ["SELECT margin FROM t WHERE margin > 10"
                 "SELECT * FROM t JOIN (SELECT * FROM u) v ON t.id = v.id"
                 "SELECT CAST(x AS INT) FROM t"
                 "SELECT * FROM logins (1, 2, 3)"
                 "SELECT \"in\" FROM t"
                 "SELECT t.values FROM t WHERE t.values > 10"]]
      (is (identical? sql (sql-parsing/strip-large-literal-lists sql)) sql))))

(deftest ^:parallel strip-tuple-in-list-test
  (testing "Tuple IN lists below the comma threshold are preserved, above it stripped"
    ;; n two-element tuples contain 2n-1 commas; the threshold is 100 commas, so 51 tuples strip
    (doseq [[n stripped?] {1 false, 50 false, 51 true, 1000 true}]
      (let [tuples (str/join ", " (map #(format "(%d, %d)" % (* % 2)) (range n)))
            sql    (str "SELECT * FROM t WHERE (a, b) IN (" tuples ")")
            result (sql-parsing/strip-large-literal-lists sql)]
        (if stripped?
          (is (= "SELECT * FROM t WHERE (a, b) IN (NULL)" result)
              (str n " tuples should be stripped"))
          (is (identical? sql result)
              (str n " tuples should not be stripped"))))))
  (testing "NOT IN and string tuples"
    (let [tuples (str/join ", " (map #(format "(%d, '%d')" % %) (range 150)))
          sql    (str "SELECT * FROM t WHERE (a, b) NOT IN (" tuples ")")]
      (is (= "SELECT * FROM t WHERE (a, b) NOT IN (NULL)"
             (sql-parsing/strip-large-literal-lists sql)))))
  (testing "Tuple lists containing non-simple tuples are not stripped"
    (doseq [bad ["(SELECT 1, 2)" "(x, 1)" "(foo(1), 2)" "(?, ?)"]]
      (let [tuples (str/join ", " (concat (map #(format "(%d, %d)" % %) (range 150)) [bad]))
            sql    (str "SELECT * FROM t WHERE (a, b) IN (" tuples ")")]
        (is (identical? sql (sql-parsing/strip-large-literal-lists sql))
            (str "tuple list containing " (pr-str bad) " should not be stripped"))))))

(defn- array-literal
  "Build `ARRAY[0, 1, ..., n-1]` with `n` items."
  [n]
  (str "ARRAY[" (str/join ", " (range n)) "]"))

(deftest ^:parallel strip-array-literal-test
  (testing "ARRAY literals at or below the threshold are preserved, above it stripped"
    (doseq [n [1 100]]
      (let [sql (str "SELECT * FROM t WHERE id = ANY(" (array-literal n) ")")]
        (is (identical? sql (sql-parsing/strip-large-literal-lists sql))
            (str n " items should not be stripped"))))
    (doseq [n [101 1000]]
      (let [sql (str "SELECT * FROM t WHERE id = ANY(" (array-literal n) ")")]
        (is (= "SELECT * FROM t WHERE id = ANY(ARRAY[NULL])" (sql-parsing/strip-large-literal-lists sql))
            (str n " items should be stripped")))))
  (testing "Casing and string arrays"
    (let [sql (str "SELECT array['" (str/join "', '" (range 150)) "'] AS a FROM t")]
      (is (= "SELECT array[NULL] AS a FROM t" (sql-parsing/strip-large-literal-lists sql)))))
  (testing "Array literals containing non-literals are not stripped"
    (doseq [bad ["col_ref" "foo(1)" "ARRAY[1]" "1:5"]]
      (let [sql (str "SELECT ARRAY[" (str/join ", " (concat (range 150) [bad])) "] FROM t")]
        (is (identical? sql (sql-parsing/strip-large-literal-lists sql))
            (str "array containing " (pr-str bad) " should not be stripped")))))
  (testing "Array subscript access on a column named array is untouched"
    (doseq [sql ["SELECT array[1] FROM t"
                 "SELECT arr[1] FROM t"
                 "SELECT arr[1:5] FROM t"]]
      (is (identical? sql (sql-parsing/strip-large-literal-lists sql)) sql)))
  (testing "A large ARRAY nested inside an unstripped IN subquery is still stripped"
    (let [sql (str "SELECT * FROM t WHERE id IN (SELECT id FROM u WHERE tags && " (array-literal 150) ")")]
      (is (= "SELECT * FROM t WHERE id IN (SELECT id FROM u WHERE tags && ARRAY[NULL])"
             (sql-parsing/strip-large-literal-lists sql))))))

(deftest ^:parallel stripped-sql-parses-e2e-test
  (testing "every analysis entry point tolerates SQL whose lists were stripped"
    (let [sql (str "SELECT a.name FROM accounts a WHERE a.id " (in-list 150))]
      (is (= [[nil nil "accounts"]] (sql-parsing/referenced-tables "postgres" sql)))
      (is (= {:is_simple true} (sql-parsing/simple-query? "postgres" sql)))
      (is (=? {:status "ok"} (sql-parsing/validate-query "postgres" sql nil)))
      (is (=? {:used-fields set? :returned-fields vector? :errors #{}}
              (sql-parsing/field-references "postgres" sql)))))
  (testing "tuple IN lists and ARRAY literals also parse after stripping"
    (doseq [sql [(str "SELECT a.name FROM accounts a WHERE (a.id, a.org_id) IN ("
                      (str/join ", " (map #(format "(%d, %d)" % %) (range 20000))) ")")
                 (str "SELECT a.name FROM accounts a WHERE a.id = ANY(" (array-literal 20000) ")")]]
      (is (= [[nil nil "accounts"]] (sql-parsing/referenced-tables "postgres" sql)))
      (is (=? {:errors #{}} (sql-parsing/field-references "postgres" sql))))))

(deftest ^:parallel large-values-referenced-tables-test
  (testing "referenced-tables works on queries with massive VALUES clauses"
    (let [tuples (str/join ", " (map #(format "(%d, %d)" % (mod % 100)) (range 20000)))
          sql    (str "WITH lookup AS (SELECT * FROM (VALUES " tuples
                      ") AS v(id, score)) "
                      "SELECT a.name, l.score FROM accounts a "
                      "JOIN lookup l ON l.id = a.id")
          result (sql-parsing/referenced-tables "postgres" sql)]
      (is (= [[nil nil "accounts"]] result)))))

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

;;; ------------------------------------------------ Parse errors --------------------------------------------------

(deftest parse-error-test
  (testing "unparseable SQL surfaces as a transport-agnostic parse error"
    (let [e (try
              (sql-parsing/referenced-tables "postgres" "SELECT !!!")
              (catch Exception e e))]
      (is (sql-parsing/parse-error? e)))))
