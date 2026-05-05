(ns ^:mb/driver-tests metabase.sql-tools.core-test
  "Tests for sql-tools that run against both :macaw and :sqlglot backends.

   These tests verify that both parser implementations produce compatible results
   for common operations, ensuring we can switch backends without breaking the app."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing are]]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.settings :as sql-tools.settings]
   [metabase.sql-tools.test-util :as sql-tools.tu]
   [metabase.test :as mt]))

;;; ------------------------------------------------ validate-query ------------------------------------------------

(deftest ^:parallel validate-query-syntax-error-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider) "complete nonsense query")]
       (testing "Gibberish SQL returns syntax error"
         (is (= #{(lib/syntax-error)}
                (sql-tools/validate-query driver/*driver* query))))))))

(deftest ^:parallel validate-query-missing-column-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider) "select nonexistent from orders")]
       (testing "Reference to non-existent column returns missing-column error"
         (is (= #{(lib/missing-column-error "NONEXISTENT")}
                (sql-tools/validate-query driver/*driver* query))))))))

(deftest ^:parallel validate-query-valid-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider) "select id, total from orders")]
       (testing "Valid query returns empty error set"
         (is (= #{}
                (sql-tools/validate-query driver/*driver* query))))))))

;;; ---------------------------------------------- referenced-tables -----------------------------------------------

(deftest ^:parallel referenced-tables-basic-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider) "select id from orders")]
       (testing "Single table reference"
         (is (= #{{:table (mt/id :orders)}}
                (sql-tools/referenced-tables driver/*driver* query))))))))

(deftest ^:parallel referenced-tables-join-test
  (sql-tools.tu/test-parser-backends
   (mt/test-driver :h2
     (let [query (lib/native-query (mt/metadata-provider)
                                   "select o.id from orders o join products p on o.product_id = p.id")]
       (testing "Join references both tables"
         (is (= #{{:table (mt/id :orders)}
                  {:table (mt/id :products)}}
                (sql-tools/referenced-tables driver/*driver* query))))))))

;;; ------------------------------------------------ replace-names -------------------------------------------------

(deftest ^:parallel replace-names-table-test
  (sql-tools.tu/test-parser-backends
   (testing "Basic table replacement"
     (is (= "SELECT * FROM new_orders"
            (sql-tools/replace-names :h2
                                     "SELECT * FROM orders"
                                     {:tables {{:table "orders"} "new_orders"}}))))))

(deftest ^:parallel replace-names-schema-test
  (sql-tools.tu/test-parser-backends
   (testing "Schema replacement"
     (is (= "SELECT * FROM new_schema.orders"
            (sql-tools/replace-names :h2
                                     "SELECT * FROM old_schema.orders"
                                     {:schemas {"old_schema" "new_schema"}}))))))

;;; -------------------------------------------- referenced-tables-raw ---------------------------------------------

(deftest ^:parallel referenced-tables-raw-test
  (sql-tools.tu/test-parser-backends
   (testing "Returns table names without resolving to IDs"
     ;; SQLGlot includes {:schema nil} while Macaw omits it - use =? for partial match
     (is (=? [{:table "orders"}]
             (sql-tools/referenced-tables-raw :h2 "SELECT * FROM orders"))))))

(deftest ^:parallel referenced-tables-raw-with-schema-test
  (sql-tools.tu/test-parser-backends
   (testing "Includes schema when present"
     (is (= [{:schema "public" :table "orders"}]
            (sql-tools/referenced-tables-raw :postgres "SELECT * FROM public.orders"))))))

;;; -------------------------------------------- transpile-sql ---------------------------------------------
;; transpile-sql is only implemented for the :sqlglot backend, so these tests bind it directly
;; rather than using test-parser-backends.

(deftest ^:parallel transpile-sql-snowflake-quotes-identifiers-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Snowflake should quote identifiers (case-sensitive dialect)"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql "SELECT id FROM PUBLIC.users"
                                                                     "snowflake" "snowflake")]
        (is (= :success status))
        (is (some? transpiled-sql))
        (is (str/includes? transpiled-sql "\"PUBLIC\""))
        (is (str/includes? transpiled-sql "\"users\""))))))

(deftest ^:parallel transpile-sql-postgres-quotes-identifiers-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "PostgreSQL should quote identifiers (case-sensitive dialect)"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql "SELECT id FROM public.users"
                                                                     "postgres" "postgres")]
        (is (= :success status))
        (is (some? transpiled-sql))
        (is (str/includes? transpiled-sql "\"public\""))
        (is (str/includes? transpiled-sql "\"users\""))))))

(deftest ^:parallel transpile-sql-mysql-no-quoting-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "MySQL should not add double-quote identifier quoting (not case-sensitive)"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql "SELECT id FROM users"
                                                                     "mysql" "mysql")]
        (is (= :success status))
        (is (some? transpiled-sql))
        (is (not (str/includes? transpiled-sql "\"")))))))

(deftest ^:parallel transpile-sql-multi-statement-rejected-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Multiple SQL statements should be rejected"
      (let [{:keys [status error-message]} (sql-tools/transpile-sql "SELECT 1; SELECT 2"
                                                                    "postgres" "postgres")]
        (is (= :error status))
        (is (str/includes? error-message "Multiple SQL statements"))))))

(deftest ^:parallel transpile-sql-preserves-query-structure-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Transpilation preserves query structure"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql
                                             "SELECT a, b FROM t WHERE x > 1 ORDER BY a"
                                             "snowflake" "snowflake")]
        (is (= :success status))
        (is (str/includes? transpiled-sql "SELECT"))
        (is (str/includes? transpiled-sql "FROM"))
        (is (str/includes? transpiled-sql "WHERE"))
        (is (str/includes? transpiled-sql "ORDER BY"))))))

(deftest ^:parallel transpile-sql-pretty-formatting-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Transpilation applies pretty formatting (newlines)"
      (let [{:keys [status transpiled-sql]} (sql-tools/transpile-sql "SELECT a,b,c FROM users WHERE id=1"
                                                                     "postgres" "postgres")]
        (is (= :success status))
        (is (str/includes? transpiled-sql "\n"))))))

(deftest ^:parallel transpile-sql-template-tags-skipped-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "SQL with Metabase template tags is skipped"
      (let [{:keys [status reason]} (sql-tools/transpile-sql "SELECT * FROM {{#42}} WHERE id = {{user_id}}"
                                                             "postgres" "postgres")]
        (is (= :skipped status))
        (is (= :contains-templates reason))))
    (testing "SQL with optional clause brackets is skipped"
      (let [{:keys [status reason]} (sql-tools/transpile-sql "SELECT * FROM users [[WHERE active = true]]"
                                                             "mysql" "mysql")]
        (is (= :skipped status))
        (is (= :contains-templates reason))))))

(deftest ^:parallel transpile-sql-missing-dialect-skipped-test
  (binding [sql-tools.settings/*parser-backend-override* :sqlglot]
    (testing "Nil dialects are skipped"
      (let [{:keys [status reason]} (sql-tools/transpile-sql "SELECT 1" nil nil)]
        (is (= :skipped status))
        (is (= :missing-dialect reason))))))

(deftest ^:parallel is-single-stmt-of-type?-test
  (mt/test-drivers (mt/normal-drivers-with-feature :connection-impersonation)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))
          product-category (lib.metadata/field mp (mt/id :products :category))
          query (-> (lib/query mp products)
                    (lib/filter (lib/= product-category "Widget")))
          native-query (:query (qp.compile/compile-with-inline-parameters query))]
      (testing "A single SELECT statement returns true and the reconstructed SQL"
        (are [sql] (=? {:is-single-stmt? true, :sql string?}
                       (sql-tools/is-single-stmt-of-type? driver/*driver* sql "read"))
          native-query
          "SELECT 1"
          "SELECT * FROM table"
          "WITH x AS (SELECT * FROM foo) SELECT * from x"
          "WITH x AS (SELECT a FROM foo), y AS (SELECT b FROM bar), z AS (SELECT c FROM baz) SELECT x.a, y.b, z.c FROM x, y, z")))
    (testing "All other read queries are rejected"
      (are [sql] (=? {:is-single-stmt? false}
                     (sql-tools/is-single-stmt-of-type? driver/*driver* sql "read"))
        "SELECT ("
        "SELECT 1; SELECT 2"
        "SET ROLE NONE"
        "DROP TABLE table"
        "SET ROLE NONE; DROP TABLE table"
        "SELECT set_config('role', 'none', false); DROP TABLE table"
        "DO $$ BEGIN EXECUTE 'SET ROLE NONE; DROP TABLE table'; END $$;"))
    (testing "A single insert, update or delete statement returns true and the reconstructed SQL"
      (are [sql] (=? {:is-single-stmt? true, :sql string?}
                     (sql-tools/is-single-stmt-of-type? driver/*driver* sql "write"))
        "INSERT INTO table VALUES (1)"
        "UPDATE table SET column = 1"
        "DELETE FROM table WHERE id = 1"))
    (testing "All other write queries are rejected"
      (are [sql] (=? {:is-single-stmt? false}
                     (sql-tools/is-single-stmt-of-type? driver/*driver* sql "write"))
        "SELECT 1"
        "INSERT INTO table VALUES (1); SELECT 1"
        "UPDATE table SET column = 1; SELECT 1"
        "DELETE FROM table WHERE id = 1; SELECT 1"
        "SET ROLE NONE; INSERT INTO table VALUES (1)"
        "SELECT set_config('role', 'none', false); DELETE FROM table WHERE id = 1"))))
