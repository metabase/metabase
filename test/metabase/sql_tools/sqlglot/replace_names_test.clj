(ns metabase.sql-tools.sqlglot.replace-names-test
  "Tests for replace-names functionality using SQLGlot backend.

   These tests mirror the Macaw tests to ensure feature parity between backends.
   Tests call sql-parsing/replace-names directly since it doesn't need Metabase metadata."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-parsing.core :as sql-parsing]))

(defn- replace-names
  "Helper that mirrors sql-tools/replace-names API but calls SQLGlot directly."
  [driver sql-string replacements]
  ;; Convert map keys to list-of-pairs for JSON serialization
  (let [dialect (case driver
                  :postgres "postgres"
                  :mysql "mysql"
                  :sqlserver "tsql"
                  :clickhouse "clickhouse"
                  nil)
        replacements' (-> replacements
                          (update :tables #(when % (vec %)))
                          (update :columns #(when % (vec %))))]
    (sql-parsing/replace-names dialect sql-string replacements')))

(deftest ^:parallel basic-table-rename-test
  (testing "Basic table rename"
    (is (= "SELECT * FROM users"
           (replace-names :postgres
                          "SELECT * FROM people"
                          {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel basic-column-rename-test
  (testing "Basic column rename"
    (is (= "SELECT user_id FROM orders"
           (replace-names :postgres
                          "SELECT id FROM orders"
                          {:columns {{:table "orders" :column "id"} "user_id"}})))))

(deftest ^:parallel schema-rename-test
  (testing "Schema rename"
    (is (= "SELECT * FROM private.orders"
           (replace-names :postgres
                          "SELECT * FROM public.orders"
                          {:schemas {"public" "private"}})))))

(deftest ^:parallel combined-renames-test
  (testing "Combined schema, table, and column renames"
    (is (= "SELECT amount FROM private.transactions"
           (replace-names :postgres
                          "SELECT total FROM public.orders"
                          {:schemas {"public" "private"}
                           :tables {{:schema "public" :table "orders"} "transactions"}
                           :columns {{:schema "public" :table "orders" :column "total"} "amount"}})))))

(deftest ^:parallel aliased-table-test
  (testing "Table with alias - alias is preserved, only table name changes"
    (is (= "SELECT p.name FROM users AS p"
           (replace-names :postgres
                          "SELECT p.name FROM people p"
                          {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel join-rename-test
  (testing "Renames in JOIN queries - alias preserved"
    (is (= "SELECT p.id, o.total FROM users AS p JOIN orders AS o ON p.id = o.user_id"
           (replace-names :postgres
                          "SELECT p.id, o.total FROM people p JOIN orders o ON p.id = o.user_id"
                          {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel multiple-table-renames-test
  (testing "Multiple table renames"
    (is (= "SELECT * FROM users, transactions"
           (replace-names :postgres
                          "SELECT * FROM people, orders"
                          {:tables {{:table "people"} "users"
                                    {:table "orders"} "transactions"}})))))

(deftest ^:parallel qualified-column-rename-test
  (testing "Qualified column in SELECT"
    (is (= "SELECT orders.amount FROM orders"
           (replace-names :postgres
                          "SELECT orders.total FROM orders"
                          {:columns {{:table "orders" :column "total"} "amount"}})))))

(deftest ^:parallel subquery-rename-test
  (testing "Renames in subqueries"
    (is (= "SELECT * FROM (SELECT id FROM users) AS sub"
           (replace-names :postgres
                          "SELECT * FROM (SELECT id FROM people) sub"
                          {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel cte-shadows-a-table-test
  (testing "a bare reference to a CTE names the CTE, not the table the key renames"
    (is (= "WITH people AS (SELECT 1 AS id) SELECT id FROM people"
           (replace-names :postgres
                          "WITH people AS (SELECT 1 AS id) SELECT id FROM people"
                          {:tables {{:table "people"} "users"}}))))
  (testing "a real table of another name is still renamed alongside the CTE"
    (is (= "WITH other AS (SELECT 1 AS id) SELECT id FROM users"
           (replace-names :postgres
                          "WITH other AS (SELECT 1 AS id) SELECT id FROM people"
                          {:tables {{:table "people"} "users"}}))))
  (testing "a qualified reference names a real table, which a CTE cannot shadow"
    (is (= "WITH people AS (SELECT 1 AS id) SELECT id FROM public.users"
           (replace-names :postgres
                          "WITH people AS (SELECT 1 AS id) SELECT id FROM public.people"
                          {:tables {{:schema "public" :table "people"} "users"}})))))

(deftest ^:parallel cte-shadows-a-table-in-any-case-test
  (testing "a reference to a CTE names the CTE however either is cased"
    (is (= "WITH orders AS (SELECT 1 AS id) SELECT * FROM ORDERS"
           (replace-names :postgres
                          "WITH orders AS (SELECT 1 AS id) SELECT * FROM ORDERS"
                          {:tables {{:table "orders"} "users"}}))))
  (testing "a CTE shadows only inside the query that declares it"
    ;; The outer `orders` is the real table: the CTE belongs to the subquery, and renaming stops at its edge.
    (is (= (str "SELECT * FROM users UNION ALL "
                "SELECT * FROM (WITH orders AS (SELECT 1 AS id) SELECT id FROM orders) AS t")
           (replace-names :postgres
                          (str "SELECT * FROM orders UNION ALL "
                               "SELECT * FROM (WITH orders AS (SELECT 1 AS id) SELECT id FROM orders) t")
                          {:tables {{:table "orders"} "users"}})))))

(deftest ^:parallel alias-shadows-a-qualifier-in-any-case-test
  (testing "a column qualifier naming a FROM alias is left alone however either is cased"
    (is (= "SELECT People.id FROM users AS PEOPLE"
           (replace-names :postgres
                          "SELECT People.id FROM people PEOPLE"
                          {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel quoted-reference-is-case-significant-test
  (testing "a quoted reference matches only a key of the same case: the engine reads it literally"
    (is (= "SELECT * FROM \"Orders\""
           (replace-names :postgres
                          "SELECT * FROM \"Orders\""
                          {:tables {{:table "orders"} "users"}}))))
  (testing "and still matches a key spelled the same way"
    (is (= "SELECT * FROM \"users\""
           (replace-names :postgres
                          "SELECT * FROM \"Orders\""
                          {:tables {{:table "Orders"} "users"}})))))

(deftest ^:parallel case-agnostic-match-test
  (testing "a key matches a reference written in any case"
    ;; Metabase treats every database as case-agnostic (see `macaw-options`): unquoted identifiers are
    ;; case-insensitive per SQL-92, and where they are not (MySQL, SQL Server) it depends on the file
    ;; system or collation rather than on the query. A key that only matched one spelling would leave
    ;; the other pointing at the real table.
    (is (= "SELECT * FROM users"
           (replace-names :postgres
                          "SELECT * FROM people"
                          {:tables {{:table "people"} "users"}})))
    (is (= "SELECT * FROM users"
           (replace-names :postgres
                          "SELECT * FROM PEOPLE"
                          {:tables {{:table "people"} "users"}})))
    (is (= "SELECT * FROM users"
           (replace-names :postgres
                          "SELECT * FROM people"
                          {:tables {{:table "PEOPLE"} "users"}}))))
  (testing "the schema may differ in case too"
    ;; A string replacement renames the table and leaves the schema where it was, whatever its case.
    (is (= "SELECT * FROM PUBLIC.users"
           (replace-names :postgres
                          "SELECT * FROM PUBLIC.PEOPLE"
                          {:tables {{:schema "public" :table "people"} "users"}})))
    (is (= "SELECT * FROM public.users"
           (replace-names :postgres
                          "SELECT * FROM public.people"
                          {:tables {{:schema "public" :table "people"} "users"}}))))
  (testing "a key matching as written wins over one matching only by case"
    (is (= "SELECT * FROM exact"
           (replace-names :postgres
                          "SELECT * FROM people"
                          {:tables {{:table "people"} "exact"
                                    {:table "PEOPLE"} "folded"}}))))
  (testing "keys differing only in case answer nothing, rather than one of them arbitrarily"
    (is (= "SELECT * FROM People"
           (replace-names :postgres
                          "SELECT * FROM People"
                          {:tables {{:table "people"} "one"
                                    {:table "PEOPLE"} "two"}}))))
  (testing "a column key matches its column and qualifier in any case"
    (is (= "SELECT user_id FROM people"
           (replace-names :postgres
                          "SELECT ID FROM people"
                          {:columns {{:table "PEOPLE" :column "id"} "user_id"}})))))

(deftest ^:parallel table-rename-with-schema-map-value-test
  (testing "Table rename using map value with schema and table (schema relocation pattern)"
    ;; Relocating a table into a different schema as part of the rename
    (is (= "SELECT * FROM ws_isolated_123.public__orders"
           (replace-names :postgres
                          "SELECT * FROM orders"
                          {:tables {{:table "orders"} {:schema "ws_isolated_123" :table "public__orders"}}})))
    ;; Qualified source table
    (is (= "SELECT * FROM ws_isolated_123.public__orders"
           (replace-names :postgres
                          "SELECT * FROM public.orders"
                          {:tables {{:schema "public" :table "orders"} {:schema "ws_isolated_123" :table "public__orders"}}})))))

(deftest ^:parallel table-rename-add-schema-only-test
  (testing "Table rename that only adds schema (qualify unqualified reference)"
    (is (= "SELECT * FROM public.orders"
           (replace-names :postgres
                          "SELECT * FROM orders"
                          {:tables {{:table "orders"} {:schema "public" :table "orders"}}})))))

(deftest ^:parallel clickhouse-positional-placeholders-preserved-test
  (testing "ClickHouse: positional `?` placeholders survive the rewrite"
    ;; sqlglot renders ClickHouse placeholders in named-parameter syntax, which turns a
    ;; positional `?` into the invalid `{?: }` — this broke rewritten incremental
    ;; transforms, whose compiled checkpoint filters carry prepared-statement params
    ;; (GDGT-2847). Patched in sql_tools.py.
    (is (= "SELECT * FROM \"zz\".\"iso__src\" WHERE (\"ts\" > \"parseDateTimeBestEffort\"(?)) AND (\"ts\" <= \"parseDateTimeBestEffort\"(?))"
           (replace-names :clickhouse
                          "SELECT * FROM `zz`.`src` WHERE (`ts` > `parseDateTimeBestEffort`(?)) AND (`ts` <= `parseDateTimeBestEffort`(?))"
                          {:tables {{:schema "zz" :table "src"} "iso__src"}}))))
  (testing "ClickHouse: named query parameters still render as {name: Type}"
    (is (= "SELECT * FROM \"zz\".\"iso__src\" WHERE \"id\" = {uid: UInt32}"
           (replace-names :clickhouse
                          "SELECT * FROM `zz`.`src` WHERE `id` = {uid: UInt32}"
                          {:tables {{:schema "zz" :table "src"} "iso__src"}})))))

(deftest ^:parallel table-qualified-column-follows-table-rename-test
  (testing "A column qualified by a replaced table is qualified by its replacement"
    (is (= "SELECT users.id, users.name FROM users"
           (replace-names :postgres
                          "SELECT people.id, people.name FROM people"
                          {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel schema-qualified-column-follows-table-rename-test
  (testing "A schema-qualified column loses the schema along with its table"
    (is (= "SELECT tmp_people.id FROM tmp_people WHERE tmp_people.name IS NULL"
           (replace-names :postgres
                          "SELECT public.people.id FROM public.people WHERE public.people.name IS NULL"
                          {:tables {{:schema "public" :table "people"} {:schema nil :table "tmp_people"}}}))))
  (testing "Quoted qualifiers stay quoted"
    (is (= "SELECT \"tmp_people\".\"ID\" FROM \"tmp_people\""
           (replace-names :postgres
                          "SELECT \"PUBLIC\".\"PEOPLE\".\"ID\" FROM \"PUBLIC\".\"PEOPLE\""
                          {:tables {{:schema "PUBLIC" :table "PEOPLE"} {:schema nil :table "tmp_people"}}})))))

(deftest ^:parallel alias-qualified-column-is-not-renamed-test
  (testing "A qualifier naming an alias is left alone, even when a replaced table has the same name"
    (is (= "SELECT people.id FROM orders AS people"
           (replace-names :postgres
                          "SELECT people.id FROM orders AS people"
                          {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel qualified-column-rename-with-table-rename-test
  (testing "A column rename still applies when its table qualifier is renamed"
    (is (= "SELECT transactions.amount FROM transactions"
           (replace-names :postgres
                          "SELECT orders.total FROM orders"
                          {:tables  {{:table "orders"} "transactions"}
                           :columns {{:table "orders" :column "total"} "amount"}})))))
