(ns metabase.sql-tools.core-test
  "Tests for sql-tools that run against both :macaw and :sqlglot backends.

   These tests verify that both parser implementations produce compatible results
   for common operations, ensuring we can switch backends without breaking the app."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
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
