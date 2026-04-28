(ns metabase.metabot.tools.sql.validation-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest testing is]]
   [metabase.metabot.tools.sql.validation :as metabot.tools.sql.validation]))

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
  stirngs in `:transpiled-sql`."
  [{:context "Snowflake should quote identifiers in normalized SQL"
    :dialect "snowflake" :sql "SELECT id FROM PUBLIC.users"
    :expected {:valid? true :transpiled-sql "SELECT\n  \"id\"\nFROM \"PUBLIC\".\"users\""}}
   {:context "PostgreSQL should quote identifiers in normalized SQL"
    :dialect "postgres" :sql "SELECT id FROM public.users"
    :expected {:valid? true :transpiled-sql "SELECT\n  \"id\"\nFROM \"public\".\"users\""}}
   {:context "MySQL should not add identifier quoting (not case-sensitive)"
    :dialect "mysql" :sql "SELECT id FROM users"
    :expected {:valid? true :transpiled-sql "SELECT\n  id\nFROM users"}}
   {:context "Multiple SQL statements should be rejected"
    :dialect "postgres" :sql "SELECT 1; SELECT 2"
    :expected {:valid? false
               :error-message "Multiple SQL statements are not supported. Please provide a single query."}}
   {:context "Transpilation should preserve the query's logical structure"
    :dialect "snowflake" :sql "SELECT a, b FROM t WHERE x > 1 ORDER BY a"
    :expected {:valid? true :transpiled-sql
               "SELECT\n  \"a\",\n  \"b\"\nFROM \"t\"\nWHERE\n  \"x\" > 1\nORDER BY\n  \"a\""}}])

(deftest transpile-sql-test
  (doseq [{:keys [context dialect expected sql]} transpilation-cases]
    (testing context
      (is (=? expected
              (metabot.tools.sql.validation/validate-sql dialect sql))))))
