(ns metabase.sql-tools.macaw.replace-names-test
  "Tests for replace-names functionality via the sql-tools API.

   Note: Macaw's replace-names uses a specific format for replacement maps:
   - :tables  - keys are {:schema s :table t} maps, values are new table names
   - :columns - keys are {:schema s :table t :column c} maps, values are new column names
   - :schemas - keys are schema name strings, values are new schema names"
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-tools.core :as sql-tools]
   ;; Load implementations for multimethod registration
   [metabase.sql-tools.init]))

;;; Test cases adapted from Macaw's test suite to verify the sql-tools wrapper.
;;; Macaw keys use {:schema ... :table ... :column ...} maps, not plain strings.

(deftest ^:parallel basic-table-rename-test
  (testing "Basic table rename"
    (is (= "SELECT * FROM users"
           (sql-tools/replace-names :postgres
                                    "SELECT * FROM people"
                                    {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel basic-column-rename-test
  (testing "Basic column rename"
    (is (= "SELECT user_id FROM orders"
           (sql-tools/replace-names :postgres
                                    "SELECT id FROM orders"
                                    {:columns {{:table "orders" :column "id"} "user_id"}})))))

(deftest ^:parallel schema-rename-test
  (testing "Schema rename"
    (is (= "SELECT * FROM private.orders"
           (sql-tools/replace-names :postgres
                                    "SELECT * FROM public.orders"
                                    {:schemas {"public" "private"}})))))

(deftest ^:parallel combined-renames-test
  (testing "Combined schema, table, and column renames"
    (is (= "SELECT amount FROM private.transactions"
           (sql-tools/replace-names :postgres
                                    "SELECT total FROM public.orders"
                                    {:schemas {"public" "private"}
                                     :tables {{:schema "public" :table "orders"} "transactions"}
                                     :columns {{:schema "public" :table "orders" :column "total"} "amount"}})))))

(deftest ^:parallel aliased-table-test
  (testing "Table with alias - alias is preserved, only table name changes"
    (is (= "SELECT p.name FROM users p"
           (sql-tools/replace-names :postgres
                                    "SELECT p.name FROM people p"
                                    {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel join-rename-test
  (testing "Renames in JOIN queries - alias preserved"
    (is (= "SELECT p.id, o.total FROM users p JOIN orders o ON p.id = o.user_id"
           (sql-tools/replace-names :postgres
                                    "SELECT p.id, o.total FROM people p JOIN orders o ON p.id = o.user_id"
                                    {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel multiple-table-renames-test
  (testing "Multiple table renames"
    (is (= "SELECT * FROM users, transactions"
           (sql-tools/replace-names :postgres
                                    "SELECT * FROM people, orders"
                                    {:tables {{:table "people"} "users"
                                              {:table "orders"} "transactions"}})))))

(deftest ^:parallel qualified-column-rename-test
  (testing "Qualified column in SELECT"
    (is (= "SELECT orders.amount FROM orders"
           (sql-tools/replace-names :postgres
                                    "SELECT orders.total FROM orders"
                                    {:columns {{:table "orders" :column "total"} "amount"}})))))

(deftest ^:parallel subquery-rename-test
  (testing "Renames in subqueries"
    (is (= "SELECT * FROM (SELECT id FROM users) sub"
           (sql-tools/replace-names :postgres
                                    "SELECT * FROM (SELECT id FROM people) sub"
                                    {:tables {{:table "people"} "users"}})))))

(deftest ^:parallel case-sensitive-match-test
  (testing "Case-sensitive matching - must match exact case"
    ;; Without case-insensitive option, matches are exact
    ;; PEOPLE won't match {:table "people"}
    (is (= "SELECT * FROM users"
           (sql-tools/replace-names :postgres
                                    "SELECT * FROM people"
                                    {:tables {{:table "people"} "users"}})))
    ;; Upper case needs upper case key
    (is (= "SELECT * FROM users"
           (sql-tools/replace-names :postgres
                                    "SELECT * FROM PEOPLE"
                                    {:tables {{:table "PEOPLE"} "users"}})))))
