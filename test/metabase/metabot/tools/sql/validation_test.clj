(ns metabase.metabot.tools.sql.validation-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest testing is]]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.metabot.tools.sql.validation :as metabot.tools.sql.validation]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log.capture :as log.capture]))

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

;;;; validate-sql with a metadata provider - identifier casing correction

(def ^:private orders-mp
  "ORDERS and CUSTOMERS synced the way Snowflake reports unquoted identifiers: folded to uppercase."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"    :schema "PUBLIC" :db-id 1}
               {:id 11 :name "CUSTOMERS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"       :table-id 10 :base-type :type/Integer}
               {:id 101 :name "SUBTOTAL" :table-id 10 :base-type :type/Float}
               {:id 110 :name "ID"       :table-id 11 :base-type :type/Integer}
               {:id 111 :name "NAME"     :table-id 11 :base-type :type/Text}]}))

(def ^:private mixed-case-id-mp
  "Two tables whose synced ID casings disagree, so a shared USING column has no single correction."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"    :schema "PUBLIC" :db-id 1}
               {:id 11 :name "CUSTOMERS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID" :table-id 10 :base-type :type/Integer}
               {:id 110 :name "Id" :table-id 11 :base-type :type/Integer}]}))

(def ^:private pg-orders-mp
  "The same tables synced the way Postgres reports them: folded to lowercase."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "orders" :schema "public" :db-id 1}]
    :fields   [{:id 100 :name "id"       :table-id 10 :base-type :type/Integer}
               {:id 101 :name "subtotal" :table-id 10 :base-type :type/Float}
               {:id 102 :name "total"    :table-id 10 :base-type :type/Float}]}))

(def ^:private pg-filtered-table-mp
  "Stands in for a filtered metadata view that hides the real lowercase `orders` table and shows
  only a case-distinct `ORDERS`, e.g. because the real one is hidden/technical."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS" :schema "public" :db-id 1}]
    :fields   [{:id 100 :name "SUBTOTAL" :table-id 10 :base-type :type/Float}]}))

(def ^:private pg-filtered-column-mp
  "Stands in for a filtered metadata view where the table is visible but its real lowercase
  `subtotal` column is hidden/sensitive, leaving only a case-distinct `SUBTOTAL`."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "orders" :schema "public" :db-id 1}]
    :fields   [{:id 100 :name "SUBTOTAL" :table-id 10 :base-type :type/Float}]}))

(def ^:private snowflake-filtered-column-mp
  "The real Snowflake-canonical uppercase `SUBTOTAL` field is hidden/sensitive; only a visible,
  case-distinct quoted-created `SubTotal` remains in the synced (filtered) metadata."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "SubTotal" :table-id 10 :base-type :type/Float}]}))

(def ^:private scalar-subquery-mp
  "ORDERS and CUSTOMERS each have a physical column, differently cased, that collides
  case-insensitively with the other's in a way that must stay scoped to its own table."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"    :schema "PUBLIC" :db-id 1}
               {:id 11 :name "CUSTOMERS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "DISCOUNT" :table-id 10 :base-type :type/Float}
               {:id 110 :name "SUBTOTAL" :table-id 11 :base-type :type/Float}]}))

(def ^:private column-alias-list-mp
  "ORDERS synced normally; used with a query that shadows its columns via an explicit
  table column-alias list (`AS o(subtotal, id)`)."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"       :table-id 10 :base-type :type/Integer}
               {:id 101 :name "SUBTOTAL" :table-id 10 :base-type :type/Float}]}))

(defn- mock-table-ids-by-name
  "Stands in for the appdb name lookup: mock providers have no appdb rows to look up, so serve the
  same case-insensitive prefilter from the mock's own tables."
  [mp]
  (fn [_database-id table-names]
    (let [names (into #{} (map u/lower-case-en) table-names)]
      (into #{}
            (comp (filter #(contains? names (u/lower-case-en (:name %))))
                  (map :id))
            (lib.metadata/tables mp)))))

(defn- validated [dialect sql mp]
  (mt/with-dynamic-fn-redefs [sql-tools/table-ids-by-name (mock-table-ids-by-name mp)]
    (metabot.tools.sql.validation/validate-sql dialect sql mp)))

(defn- transpiled [dialect sql mp]
  (:transpiled-sql (validated dialect sql mp)))

(deftest ^:parallel corrects-lowercase-identifiers-test
  (testing "a lowercase column and table become the synced uppercase names"
    (is (= "SELECT\n  \"SUBTOTAL\"\nFROM \"ORDERS\""
           (transpiled "snowflake" "select subtotal from orders" orders-mp)))))

(deftest ^:parallel corrects-mixed-case-identifiers-test
  (is (= "SELECT\n  \"SUBTOTAL\"\nFROM \"ORDERS\""
         (transpiled "snowflake" "select SubTotal from Orders" orders-mp))))

(deftest ^:parallel corrects-postgres-direction-test
  (testing "synced names lowercase, LLM wrote uppercase"
    (is (= "SELECT\n  \"subtotal\"\nFROM \"orders\""
           (transpiled "postgres" "select SUBTOTAL from ORDERS" pg-orders-mp)))))

(deftest ^:parallel corrects-schema-qualification-test
  (testing "schema casing is corrected together with the table's"
    (is (= "SELECT\n  \"ID\"\nFROM \"PUBLIC\".\"ORDERS\""
           (transpiled "snowflake" "select id from public.orders" orders-mp)))))

(deftest ^:parallel corrects-table-qualified-columns-test
  (testing "a table-name qualifier follows the table's corrected casing"
    (is (= "SELECT\n  \"ORDERS\".\"SUBTOTAL\"\nFROM \"ORDERS\""
           (transpiled "snowflake" "select orders.subtotal from orders" orders-mp)))))

(deftest ^:parallel corrects-alias-qualified-columns-test
  (is (= "SELECT\n  \"o\".\"SUBTOTAL\"\nFROM \"ORDERS\" AS \"o\""
         (transpiled "snowflake" "select o.subtotal from orders as o" orders-mp))))

(deftest ^:parallel corrects-mixed-case-qualifier-test
  (testing "an unquoted qualifier resolves to its source case-insensitively, like unquoted SQL does"
    (is (= "SELECT\n  \"ORDERS\".\"SUBTOTAL\"\nFROM \"ORDERS\""
           (transpiled "snowflake" "select Orders.SubTotal from orders" orders-mp)))))

(deftest ^:parallel corrects-mixed-case-alias-qualifier-test
  (is (= "SELECT\n  \"o\".\"SUBTOTAL\"\nFROM \"ORDERS\" AS \"o\""
         (transpiled "snowflake" "select O.subtotal from orders o" orders-mp))))

(deftest ^:parallel corrects-qualified-star-test
  (is (= "SELECT\n  \"ORDERS\".*\nFROM \"ORDERS\""
         (transpiled "snowflake" "select orders.* from orders" orders-mp))))

(deftest ^:parallel corrects-schema-qualified-star-test
  (is (= "SELECT\n  \"PUBLIC\".\"ORDERS\".*\nFROM \"PUBLIC\".\"ORDERS\""
         (transpiled "snowflake" "select public.orders.* from public.orders" orders-mp))))

(deftest ^:parallel corrects-join-using-test
  (is (= "SELECT\n  *\nFROM \"ORDERS\"\nJOIN \"CUSTOMERS\"\n  USING (\"ID\")"
         (transpiled "snowflake" "select * from orders join customers using (id)" orders-mp))))

(deftest ^:parallel ambiguous-join-using-untouched-test
  (testing "joined tables that disagree on the synced casing leave the USING identifier alone"
    (is (= "SELECT\n  *\nFROM \"ORDERS\"\nJOIN \"CUSTOMERS\"\n  USING (\"id\")"
           (transpiled "snowflake" "select * from orders join customers using (id)" mixed-case-id-mp)))))

(deftest ^:parallel corrects-order-by-select-name-test
  (testing "an ORDER BY reference follows the corrected select column it names"
    (is (= "SELECT\n  \"SUBTOTAL\"\nFROM \"ORDERS\"\nORDER BY\n  \"SUBTOTAL\""
           (transpiled "snowflake" "select subtotal from orders order by subtotal" orders-mp)))))

(deftest ^:parallel corrects-having-reference-test
  (is (= "SELECT\n  SUM(\"SUBTOTAL\")\nFROM \"ORDERS\"\nHAVING\n  SUM(\"SUBTOTAL\") > 1"
         (transpiled "snowflake" "select sum(subtotal) from orders having sum(subtotal) > 1" orders-mp))))

(deftest ^:parallel order-by-alias-untouched-test
  (testing "an ORDER BY reference to a select alias keeps naming the alias"
    (is (= "SELECT\n  \"SUBTOTAL\" AS \"x\"\nFROM \"ORDERS\"\nORDER BY\n  \"x\""
           (transpiled "snowflake" "select subtotal as x from orders order by x" orders-mp)))))

(deftest ^:parallel correct-casing-untouched-test
  (is (= "SELECT\n  \"SUBTOTAL\"\nFROM \"PUBLIC\".\"ORDERS\""
         (transpiled "snowflake" "select SUBTOTAL from PUBLIC.ORDERS" orders-mp))))

(deftest ^:parallel no-metadata-provider-skips-correction-test
  (testing "without a metadata provider the SQL transpiles with its casing left as written"
    (is (= "SELECT\n  \"subtotal\"\nFROM \"orders\""
           (:transpiled-sql (metabot.tools.sql.validation/validate-sql
                             "snowflake" "select subtotal from orders"))))))

(deftest ^:parallel multi-statement-still-rejected-test
  (testing "multi-statement input is rejected, not quietly collapsed into one statement"
    (is (=? {:valid? false
             :error-message "Multiple SQL statements are not supported. Please provide a single query."}
            (validated "snowflake" "select subtotal from orders; select 1" orders-mp)))))

(deftest ^:parallel unknown-table-untouched-test
  (is (str/includes? (transpiled "snowflake" "select id from nonexistent_table" orders-mp)
                     "\"nonexistent_table\"")))

(deftest ^:parallel derived-table-alias-untouched-test
  (testing "an outer reference to a derived column alias is not rewritten to the physical name"
    (is (= (str "SELECT\n  \"subtotal\"\nFROM (\n  SELECT\n    \"amount\" AS \"subtotal\"\n"
                "  FROM \"ORDERS\"\n) AS \"d\"")
           (transpiled "snowflake"
                       "select subtotal from (select amount as subtotal from orders) as d"
                       orders-mp)))))

(deftest ^:parallel derived-table-output-name-follows-correction-test
  (testing "a bare (unaliased) derived-table projection is corrected without an alias, so the
           derived table exposes the dialect's canonical output name and the outer reference
           is corrected to follow it"
    (let [sql (transpiled "snowflake"
                          "select subtotal from (select subtotal from orders) as d"
                          orders-mp)]
      (is (= (str "SELECT\n  \"SUBTOTAL\"\nFROM (\n  SELECT\n    \"SUBTOTAL\"\n"
                  "  FROM \"ORDERS\"\n) AS \"d\"")
             sql))
      (is (= "ok" (:status (sql-parsing/validate-query
                            "snowflake" sql "PUBLIC" {"PUBLIC" {"ORDERS" {"SUBTOTAL" "FLOAT"}}})))
          "the corrected query must still resolve, not just read as plausible SQL"))))

(deftest ^:parallel cte-output-name-follows-correction-test
  (testing "the CTE body is corrected against the physical table and the outer reference follows
           the corrected output name, so the result column keeps the dialect's canonical spelling"
    (let [sql (transpiled "snowflake"
                          "with subs as (select subtotal from orders) select subtotal from subs"
                          orders-mp)]
      (is (= (str "WITH \"subs\" AS (\n  SELECT\n    \"SUBTOTAL\"\n  FROM \"ORDERS\"\n)\n"
                  "SELECT\n  \"SUBTOTAL\"\nFROM \"subs\"")
             sql))
      (is (= "ok" (:status (sql-parsing/validate-query
                            "snowflake" sql "PUBLIC" {"PUBLIC" {"ORDERS" {"SUBTOTAL" "FLOAT"}}})))
          "the corrected query must still resolve, not just read as plausible SQL"))))

(deftest ^:parallel correlated-references-corrected-test
  (testing "correlated references resolve through the scope that owns them: alias-qualified,
           table-name-qualified, and bare"
    (is (= (str "SELECT\n  *\nFROM \"ORDERS\" AS \"o\"\nWHERE\n  EXISTS(\n    SELECT\n      1\n"
                "    FROM \"CUSTOMERS\" AS \"c\"\n    WHERE\n      \"c\".\"ID\" = \"o\".\"ID\"\n  )")
           (transpiled "snowflake"
                       "select * from orders o where exists (select 1 from customers c where c.id = o.id)"
                       orders-mp)))
    (is (str/includes?
         (transpiled "snowflake"
                     "select * from orders where exists (select 1 from customers c where c.id = orders.id)"
                     orders-mp)
         "\"c\".\"ID\" = \"ORDERS\".\"ID\""))
    (is (str/includes?
         (transpiled "snowflake"
                     "select * from orders o where exists (select 1 from customers c where subtotal > 100)"
                     orders-mp)
         "\"SUBTOTAL\" > 100"))))

(deftest ^:parallel set-operation-output-contract-test
  (testing "an outer reference through a set-operation wrapper follows the corrected first-arm
           output, for every operator in both derived-table and CTE form"
    (doseq [op  ["union all" "intersect" "except"]
            sql [(format "select subtotal from (select subtotal from orders %s select subtotal from orders) d" op)
                 (format "with d as (select subtotal from orders %s select subtotal from orders) select subtotal from d" op)]]
      (let [corrected (transpiled "snowflake" sql orders-mp)]
        (is (not (str/includes? corrected "\"subtotal\"")) sql)
        (is (= "ok" (:status (sql-parsing/validate-query
                              "snowflake" corrected "PUBLIC" {"PUBLIC" {"ORDERS" {"SUBTOTAL" "FLOAT"}}})))
            sql)))))

(deftest ^:parallel fold-equivalent-nonphysical-alias-test
  (testing "an unquoted reference bound to a case-different derived alias or CTE name is rewritten
           to the exact spelling transpile will quote"
    (is (= "SELECT\n  \"d\".\"SUBTOTAL\"\nFROM (\n  SELECT\n    \"SUBTOTAL\"\n  FROM \"ORDERS\"\n) AS \"d\""
           (transpiled "snowflake" "select D.subtotal from (select subtotal from orders) d" orders-mp)))
    (is (= (str "WITH \"X\" AS (\n  SELECT\n    \"SUBTOTAL\"\n  FROM \"ORDERS\"\n)\n"
                "SELECT\n  \"X\".\"SUBTOTAL\"\nFROM \"X\"")
           (transpiled "snowflake" "with X as (select subtotal from orders) select x.subtotal from X" orders-mp)))))

(deftest ^:parallel cte-shadowed-table-untouched-test
  (testing "a fold-equivalent spelling of a CTE name reads the CTE, so the physical table it
           shadows must not capture the reference"
    (is (= "WITH \"Orders\" AS (\n  SELECT\n    1 AS \"id\"\n)\nSELECT\n  \"id\"\nFROM \"ORDERS\""
           (transpiled "postgres" "WITH Orders AS (SELECT 1 AS id) SELECT id FROM ORDERS" pg-orders-mp)))))

(deftest ^:parallel order-by-alias-column-collision-untouched-test
  (testing "an ORDER BY reference that could name both a select alias and a physical column
           stays as written instead of being pinned to either"
    (is (= "SELECT\n  \"subtotal\" AS \"Total\"\nFROM \"orders\"\nORDER BY\n  \"TOTAL\""
           (transpiled "postgres" "select subtotal as Total from orders order by TOTAL" pg-orders-mp)))))

(deftest ^:parallel outer-cte-does-not-leak-into-sibling-test
  (testing "an outer CTE's output names are not visible inside a sibling CTE, so they neither
           block nor hijack a physical-column correction there"
    (is (= (str "WITH \"a\" AS (\n  SELECT\n    1 AS \"SubTotal\"\n), \"b\" AS (\n  SELECT\n"
                "    \"subtotal\"\n  FROM \"orders\"\n)\nSELECT\n  *\nFROM \"b\"")
           (transpiled "postgres"
                       "with a as (select 1 as SubTotal), b as (select SUBTOTAL from orders) select * from b"
                       pg-orders-mp)))))

(deftest ^:parallel quoted-alias-fold-mismatch-untouched-test
  (testing "an unquoted qualifier never binds a quoted alias whose spelling is not its fold,
           and no outer scope may rewrite it into a capturing spelling either"
    (is (= (str "SELECT\n  (\n    SELECT\n      \"O\".\"ID\"\n    FROM \"CUSTOMERS\" AS \"o\"\n  )\n"
                "FROM \"ORDERS\" AS \"o\"")
           (transpiled "snowflake"
                       "select (select O.ID from customers as \"o\") from orders as o"
                       orders-mp)))))

(deftest ^:parallel postgres-output-identity-test
  (testing "the lowercase fold direction: an uppercase spelling becomes the canonical lowercase
           output name end to end, not a pinned uppercase alias"
    (is (= (str "WITH \"x\" AS (\n  SELECT\n    \"subtotal\"\n  FROM \"orders\"\n)\n"
                "SELECT\n  \"subtotal\"\nFROM \"x\"")
           (transpiled "postgres" "with x as (select SUBTOTAL from ORDERS) select subtotal from x" pg-orders-mp)))))

(deftest ^:parallel quoted-identifiers-untouched-test
  (testing "an explicitly quoted identifier denotes an exact object and is never re-cased"
    (is (= "SELECT\n  \"subtotal\"\nFROM \"orders\""
           (transpiled "snowflake" "select \"subtotal\" from \"orders\"" orders-mp)))))

(deftest ^:parallel catalog-qualified-untouched-test
  (testing "a catalog-qualified table is outside the current database's metadata scope"
    (is (= "SELECT\n  \"subtotal\"\nFROM \"other\".\"public\".\"orders\""
           (transpiled "snowflake" "select subtotal from other.public.orders" orders-mp)))))

(deftest correction-failure-does-not-log-sql-test
  (testing "SQL that fails to parse during correction stays out of the warn log: it can hold literals"
    (let [msgs (log.capture/with-log-messages-for-level [msgs [metabase.metabot.tools.sql.validation :warn]]
                 (validated "snowflake" "select * from orders where token = 'synthetic-secret' and" orders-mp)
                 (msgs))]
      (is (seq msgs))
      (is (not (str/includes? (pr-str msgs) "synthetic-secret"))))))

(deftest ^:parallel case-insensitive-dialects-skip-correction-test
  (testing "a dialect that doesn't quote identifiers transpiles without a correction pass"
    (is (= "SELECT\n  SubTotal\nFROM Orders"
           (transpiled "mysql" "select SubTotal from Orders" orders-mp)))))

(deftest ^:parallel filtered-metadata-does-not-retarget-valid-table-test
  (testing "a table name already at Postgres's unquoted fold is left alone even when the only
           metadata match is a case-distinct object a filtered view happened to show"
    (is (= "SELECT\n  \"subtotal\"\nFROM \"orders\""
           (transpiled "postgres" "select subtotal from orders" pg-filtered-table-mp)))))

(deftest ^:parallel filtered-metadata-does-not-retarget-valid-column-test
  (testing "a column name already at Postgres's unquoted fold is left alone even when the table
           matches and the only metadata for the column is a case-distinct name"
    (is (= "SELECT\n  \"subtotal\"\nFROM \"orders\""
           (transpiled "postgres" "select subtotal from orders" pg-filtered-column-mp)))))

(deftest ^:parallel filtered-metadata-does-not-retarget-upper-fold-column-test
  (testing "a Snowflake column not already at the uppercase fold is left alone (not rewritten to a
           case-distinct name) when the only metadata match isn't the exact canonical fold"
    (is (= "SELECT\n  \"subtotal\"\nFROM \"ORDERS\""
           (transpiled "snowflake" "select subtotal from orders" snowflake-filtered-column-mp)))))

(deftest ^:parallel scalar-subquery-column-scoped-to-its-own-table-test
  (testing "a bare column inside a scalar subquery is corrected against its own table, not the
           outer query's table, even though scope.columns leaks it into the outer scope too"
    (is (= "SELECT\n  (\n    SELECT\n      \"SUBTOTAL\"\n    FROM \"CUSTOMERS\"\n  )\nFROM \"ORDERS\""
           (transpiled "snowflake" "select (select subtotal from customers) from orders"
                       scalar-subquery-mp)))))

(deftest ^:parallel table-column-alias-list-skips-field-correction-test
  (testing "an explicit table column-alias list shadows the physical column names, so field
           correction is skipped for that source; table correction still applies"
    (is (= "SELECT\n  \"subtotal\"\nFROM \"ORDERS\" AS \"o\"(\"subtotal\", \"id\")"
           (transpiled "snowflake" "select subtotal from orders as o(subtotal, id)"
                       column-alias-list-mp)))))

(deftest ^:parallel corrects-mixed-case-group-by-alias-test
  (testing "a GROUP BY reference to a select alias is quoted to match the alias, not left mismatched"
    (is (= "SELECT\n  \"SUBTOTAL\" AS \"Total\"\nFROM \"ORDERS\"\nGROUP BY\n  \"Total\""
           (transpiled "snowflake" "select subtotal as Total from orders group by total" orders-mp)))))

(deftest ^:parallel corrects-mixed-case-order-by-alias-test
  (testing "an ORDER BY reference to a select alias is quoted to match the alias, not left mismatched"
    (is (= "SELECT\n  \"SUBTOTAL\" AS \"Total\"\nFROM \"ORDERS\"\nORDER BY\n  \"Total\""
           (transpiled "snowflake" "select subtotal as Total from orders order by total" orders-mp)))))

(deftest casing-correction-fetches-only-named-tables-test
  (testing "casing correction looks up only the tables the SQL names, never the whole catalog"
    (let [catalog-fetches (atom 0)
          all-tables      lib.metadata/tables]
      (with-redefs [lib.metadata/tables (fn [mp] (swap! catalog-fetches inc) (all-tables mp))]
        (testing "the referenced table still resolves and gets its casing corrected"
          (is (= "SELECT\n  \"SUBTOTAL\"\nFROM \"ORDERS\""
                 (:transpiled-sql (metabot.tools.sql.validation/validate-sql
                                   "snowflake" "select subtotal from orders" (mt/metadata-provider))))))
        (testing "without fetching the catalog"
          (is (zero? @catalog-fetches)))))))
