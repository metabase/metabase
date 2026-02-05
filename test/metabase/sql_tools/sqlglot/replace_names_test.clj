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

(deftest ^:parallel case-sensitive-match-test
  (testing "Case-sensitive matching - must match exact case"
    ;; Lower case matches lower case
    (is (= "SELECT * FROM users"
           (replace-names :postgres
                          "SELECT * FROM people"
                          {:tables {{:table "people"} "users"}})))
    ;; Upper case needs upper case key
    (is (= "SELECT * FROM users"
           (replace-names :postgres
                          "SELECT * FROM PEOPLE"
                          {:tables {{:table "PEOPLE"} "users"}})))))

(deftest ^:parallel table-rename-with-schema-map-value-test
  (testing "Table rename using map value with schema and table (workspace isolation pattern)"
    ;; This is the pattern used by workspaces to isolate tables into a new schema
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
