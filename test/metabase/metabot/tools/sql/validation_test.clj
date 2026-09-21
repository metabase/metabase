(ns metabase.metabot.tools.sql.validation-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest testing is]]
   [metabase.metabot.tools.sql.validation :as metabot.tools.sql.validation]
   [metabase.sql-parsing.core :as sql-parsing]))

;;;; contains-template-tags?

(def ^:private contains-template-tags-positive-cases
  [{:context "Should detect {{variable}} syntax"
    :dialect "postgres" :sql "SELECT * FROM users WHERE id = {{user_id}}"}
   {:context "Should detect {{#model_id}} syntax"
    :dialect "postgres" :sql "SELECT * FROM {{#123}} as orders"}
   {:context "Should detect {{snippet: name}} syntax"
    :dialect "postgres" :sql "SELECT * FROM {{snippet: common_joins}}"}
   {:context "Should detect [[optional]] syntax"
    :dialect "postgres" :sql "SELECT * FROM users [[WHERE id = {{id}}]]"}
   {:context "Should detect [[ and ]] even without variables"
    :dialect "postgres" :sql "SELECT * FROM users [[WHERE active = true]]"}])

(deftest contains-template-tags?-positive-test
  (doseq [{:keys [context  sql]} contains-template-tags-positive-cases]
    (testing context
      (is (true? (#'metabot.tools.sql.validation/contains-template-tags? sql))))))

(def ^:private contains-template-tags-negative-cases
  [{:context "Single curly braces (e.g., JSON) should not trigger detection"
    :sql "SELECT '{\"key\": \"value\"}'::jsonb"}
   {:context "Pure SQL without templates should return False"
    :sql "SELECT id, name FROM users WHERE active = true"}
   {:context "Empty string should return False"
    :sql ""}])

(deftest contains-template-tags?-negative-test
  (doseq [{:keys [context  sql]} contains-template-tags-negative-cases]
    (testing context
      (is (false? (#'metabot.tools.sql.validation/contains-template-tags? sql))))))

;;;; validate-sql

(def ^:private validation-cases
  [{:context "Valid PostgreSQL SQL should pass validation and return normalized SQL."
    :dialect "postgres" :sql "SELECT id, name FROM users WHERE created_at > NOW()"
    :expected {:valid? true :dialect "postgres"}}
   {:context "SQL with syntax errors should fail validation"
    :dialect "postgres" :sql "SELECT * FORM users"
    :expected {:valid? false :error-message #(str/starts-with? % "Invalid expression / Unexpected token.")}}
   {:context "SQL with Metabase templates should skip validation entirely"
    :dialect "bigquery" :sql "SELECT * FROM {{#42}} as orders WHERE total > {{min_total}}"
    :expected {:valid? true :dialect "bigquery"}}
   {:context "CTE with model reference should skip validation (not attempt to parse)"
    :dialect "postgres" :sql "WITH cte AS {{#128-shopify-fulfillment-facts}} SELECT count(*) FROM cte"
    :expected {:valid? true :dialect "postgres"}}
   {:context "EXISTS with model reference should skip validation"
    :dialect "postgres" :sql "SELECT * FROM foo WHERE EXISTS {{#123-mymodel}}"
    :expected {:valid? true :dialect "postgres"}}
   {:context "Optional filter clauses should skip validation"
    :dialect "mysql" :sql "SELECT count(*) FROM products [[WHERE category = {{cat}}]]"
    :expected {:valid? true :dialect "mysql"}}
   {:context "Snippet references should skip validation"
    :dialect "postgres" :sql "SELECT * FROM {{snippet: common_user_joins}}"
    :expected {:valid? true :dialect "postgres"}}
   {:context "Validation should be skipped when no dialect is provided"
    :dialect nil :sql "SELECT * FROM users"
    :expected {:valid? true :dialect nil}}
   {:context "Validation should be skipped for unknown dialects"
    :dialect "unknown_dialect" :sql "SELECT * FROM users"
    :expected {:valid? true :dialect "unknown_dialect"}}
   {:context "Validation should be skipped for explicitly unsupported dialects"
    :dialect "druid" :sql "SELECT * FROM users"
    :expected {:valid? true :dialect "druid"}}
   {:context "Empty SQL should pass validation (graceful handling)"
    :dialect "postgres" :sql ""
    :expected {:valid? true :dialect "postgres"}}
   {:context "Whitespace-only SQL should pass validation"
    :dialect "postgres" :sql "   \n\t  "
    :expected {:valid? true :dialect "postgres"}}])

(deftest validate-sql-test
  (doseq [{:keys [context dialect expected sql]} validation-cases]
    (testing context
      (is (=? expected
              (metabot.tools.sql.validation/validate-sql dialect sql))))))

(def ^:private transpilation-cases
  "Testing _context_ describe a test case. Apart from that, pretty formatting is checked by comparisons of raw output
  strings in `:transpiled-sql`."
  [{:context "Snowflake identifiers keep the quoting they were written with"
    :dialect "snowflake" :sql "SELECT id FROM PUBLIC.users"
    :expected {:valid? true :transpiled-sql "SELECT\n  id\nFROM PUBLIC.users"}}
   {:context "PostgreSQL identifiers keep the quoting they were written with"
    :dialect "postgres" :sql "SELECT id FROM public.users"
    :expected {:valid? true :transpiled-sql "SELECT\n  id\nFROM public.users"}}
   {:context "MySQL identifiers keep the quoting they were written with"
    :dialect "mysql" :sql "SELECT id FROM users"
    :expected {:valid? true :transpiled-sql "SELECT\n  id\nFROM users"}}
   {:context "Multiple SQL statements should be rejected"
    :dialect "postgres" :sql "SELECT 1; SELECT 2"
    :expected {:valid? false
               :error-message "Multiple SQL statements are not supported. Please provide a single query."}}
   {:context "Transpilation should preserve the query's logical structure"
    :dialect "snowflake" :sql "SELECT a, b FROM t WHERE x > 1 ORDER BY a"
    :expected {:valid? true :transpiled-sql
               "SELECT\n  a,\n  b\nFROM t\nWHERE\n  x > 1\nORDER BY\n  a"}}])

(deftest transpile-sql-test
  (doseq [{:keys [context dialect expected sql]} transpilation-cases]
    (testing context
      (is (=? expected
              (metabot.tools.sql.validation/validate-sql dialect sql))))))

;;;; identifier quoting preservation
;;
;; Transpilation must not add identifier quoting: dialects like Snowflake and Postgres fold
;; unquoted identifiers, so quoting locks in the written casing and breaks references that the
;; database itself would have resolved (BOT-1013). Identifiers keep the quoting they were
;; written with, in both fold directions. The one exception is a name that collides with the
;; target dialect's reserved words, which is quoted in the dialect's folded case so it still
;; resolves to the same object.

(defn- transpiled-sql [dialect sql]
  (:transpiled-sql (metabot.tools.sql.validation/validate-sql dialect sql)))

(def ^:private quoting-cases
  [{:context "unquoted identifiers stay unquoted through an uppercase-folding dialect"
    :dialect "snowflake" :sql "select SubTotal, \"Weird Col\" from Orders as O where o.Total > 0"
    :expected "SELECT\n  SubTotal,\n  \"Weird Col\"\nFROM Orders AS O\nWHERE\n  o.Total > 0"}
   {:context "unquoted identifiers stay unquoted through a lowercase-folding dialect"
    :dialect "postgres" :sql "SELECT subtotal AS \"Total\" FROM orders WHERE total > 0"
    :expected "SELECT\n  subtotal AS \"Total\"\nFROM orders\nWHERE\n  total > 0"}
   {:context "CTE declarations and references keep their spelling"
    :dialect "postgres" :sql "WITH Orders AS (SELECT 1 AS id) SELECT id FROM ORDERS"
    :expected "WITH Orders AS (\n  SELECT\n    1 AS id\n)\nSELECT\n  id\nFROM ORDERS"}
   {:context "table-valued functions transpile"
    :dialect "postgres" :sql "SELECT * FROM generate_series(1, 10) AS g(n)"
    :expected "SELECT\n  *\nFROM GENERATE_SERIES(1, 10) AS g(n)"}
   {:context "reserved words are quoted in the dialect's folded case, lowercase dialect"
    :dialect "postgres" :sql "select Order, user from t"
    :expected "SELECT\n  \"order\",\n  \"user\"\nFROM t"}
   {:context "reserved words are quoted in the dialect's folded case, uppercase dialect"
    :dialect "snowflake" :sql "select order from t"
    :expected "SELECT\n  \"ORDER\"\nFROM t"}
   {:context "Snowflake-specific reserved words are covered, not just the ANSI ones"
    :dialect "snowflake" :sql "SELECT BY FROM t"
    :expected "SELECT\n  \"BY\"\nFROM t"}
   {:context "Oracle-specific reserved words are covered, not just the ANSI ones"
    :dialect "oracle" :sql "SELECT DATE, LEVEL, USER FROM t"
    :expected "SELECT\n  \"DATE\",\n  \"LEVEL\",\n  \"USER\"\nFROM t"}
   {:context "a word another dialect reserves stays bare where the target does not reserve it:
             on SQLite a quoted unresolved identifier silently becomes a string literal"
    :dialect "sqlite" :sql "SELECT user FROM orders LIMIT 3"
    :expected "SELECT\n  user\nFROM orders\nLIMIT 3"}])

(deftest ^:parallel quoting-preservation-test
  (doseq [{:keys [context dialect expected sql]} quoting-cases]
    (testing context
      (is (= expected (transpiled-sql dialect sql))))))

(deftest ^:parallel transpiled-sql-resolves-test
  (testing "transpiled SQL must resolve against the folded-case names the warehouse reports;
           quoting it (the old identify=True behavior) makes exactly these fail"
    (doseq [[dialect sql default-schema sqlglot-schema]
            [["snowflake" "select subtotal from orders"
              "PUBLIC" {"PUBLIC" {"ORDERS" {"SUBTOTAL" "FLOAT"}}}]
             ["snowflake" "select SubTotal from Orders as O where o.Total > 0"
              "PUBLIC" {"PUBLIC" {"ORDERS" {"SUBTOTAL" "FLOAT", "TOTAL" "FLOAT"}}}]
             ["postgres" "SELECT subtotal AS \"Total\" FROM orders WHERE total > 0"
              "public" {"public" {"orders" {"subtotal" "FLOAT", "total" "FLOAT"}}}]
             ["postgres" "SELECT SubTotal FROM Orders WHERE Total > 0"
              "public" {"public" {"orders" {"subtotal" "FLOAT", "total" "FLOAT"}}}]
             ["postgres" "SELECT \"order\" FROM t"
              "public" {"public" {"t" {"order" "FLOAT"}}}]
             ["postgres" "SELECT order FROM t"
              "public" {"public" {"t" {"order" "FLOAT"}}}]
             ["postgres" "WITH Orders AS (SELECT 1 AS id) SELECT id FROM ORDERS"
              "public" {"public" {"unrelated" {"x" "INT"}}}]
             ["snowflake" "WITH x AS (SELECT * FROM orders) SELECT subtotal FROM x"
              "PUBLIC" {"PUBLIC" {"ORDERS" {"SUBTOTAL" "FLOAT"}}}]]]
      (testing sql
        (is (= "ok" (:status (sql-parsing/validate-query
                              dialect (transpiled-sql dialect sql) default-schema sqlglot-schema))))))))
