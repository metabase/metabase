(ns metabase-enterprise.metabot-v3.table-utils-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.query-analyzer :as query-analyzer]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;; ======================================
;; Unit Tests for Helper Functions
;; ======================================

(deftest similar?-identical-strings-test
  (testing "similar? function with identical strings"
    (is (table-utils/similar? "users" "users"))
    (is (table-utils/similar? "PEOPLE" "PEOPLE"))))

(deftest similar?-case-differences-test
  (testing "similar? function with case differences"
    (is (table-utils/similar? "USERS" "users"))
    (is (table-utils/similar? "Users" "USERS"))
    (is (table-utils/similar? "PEOPLE" "people"))
    (is (table-utils/similar? "People" "PEOPLE"))))

(deftest similar?-small-differences-test
  (testing "similar? function with small differences within threshold"
    (is (table-utils/similar? "users" "user"))      ; remove 1 char
    (is (table-utils/similar? "orders" "order"))    ; remove 1 char
    (is (table-utils/similar? "people" "person"))   ; change 2 chars
    (is (table-utils/similar? "accounts" "account")) ; remove 1 char
    (is (table-utils/similar? "products" "product")) ; remove 1 char
    (is (table-utils/similar? "PEOPLE" "PEOPL"))    ; codespell:ignore | remove 1 char (our use case!)
    (is (table-utils/similar? "ORDERS" "ORDRE"))    ; change 1 char
    (is (table-utils/similar? "ACCOUNTS" "ACOUNT")))) ; codespell:ignore | remove 2 chars

(deftest similar?-threshold-boundary-test
  (testing "similar? function at threshold boundary"
    (is (table-utils/similar? "abcd" "abcdefgh"))     ; add 4 chars - should pass
    (is (not (table-utils/similar? "abcd" "abcdefghi"))))) ; add 5 chars - should fail

(deftest similar?-different-strings-test
  (testing "similar? function with completely different strings"
    (is (not (table-utils/similar? "users" "products")))
    (is (not (table-utils/similar? "accounts" "inventory")))
    (is (not (table-utils/similar? "people" "widgets")))))

(deftest similar?-empty-and-nil-test
  (testing "similar? function with empty and nil handling"
    (is (not (table-utils/similar? "" "test")))
    (is (not (table-utils/similar? "test" "")))
    (is (table-utils/similar? "" ""))))

(deftest matching-tables?-test
  (testing "matching-tables? function with schema matching"
    (let [table1 {:name "users" :schema "public"}
          table2 {:name "USERS" :schema "PUBLIC"}  ; case different
          table3 {:name "user" :schema "public"}   ; name similar
          table4 {:name "users" :schema "private"} ; different schema
          table5 {:name "users" :schema nil}       ; nil schema
          table6 {:name "people" :schema "public"}] ; different name

      (testing "exact matches with schema matching disabled"
        (is (table-utils/matching-tables? table1 table2 {:match-schema? false})))

      (testing "fuzzy name matches with schema matching disabled"
        (is (table-utils/matching-tables? table1 table3 {:match-schema? false})))

      (testing "schema matching enabled - both schemas must match"
        (is (table-utils/matching-tables? table1 table2 {:match-schema? true}))
        (is (not (table-utils/matching-tables? table1 table4 {:match-schema? true}))))

      (testing "nil schema handling - should match any schema when one is nil"
        (is (table-utils/matching-tables? table1 table5 {:match-schema? true}))
        (is (table-utils/matching-tables? table5 table1 {:match-schema? true})))

      (testing "completely different names should not match"
        (is (not (table-utils/matching-tables? table1 table6 {:match-schema? false})))))))

(deftest smoke-test
  (testing "Basic smoke test that all functions work"
    (is (table-utils/similar? "test" "test"))
    (is (table-utils/matching-tables? {:name "test" :schema nil}
                                      {:name "test" :schema nil}
                                      {:match-schema? false}))))
;; ======================================
;; Integration Tests for Database Functions
;; ======================================

(deftest database-tables-test
  (testing "database-tables function"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table1-id :id} {:db_id db-id, :name "users", :schema "public", :active true, :visibility_type nil}
                   :model/Table    {table2-id :id} {:db_id db-id, :name "orders", :schema "public", :active true, :visibility_type nil}
                   :model/Table    {} {:db_id db-id, :name "products", :schema "private", :active true, :visibility_type nil}
                   :model/Field    {} {:table_id table1-id, :name "id", :database_type "INTEGER"}
                   :model/Field    {} {:table_id table1-id, :name "name", :database_type "VARCHAR"}
                   :model/Field    {} {:table_id table2-id, :name "id", :database_type "INTEGER"}
                   :model/Field    {} {:table_id table2-id, :name "total", :database_type "DECIMAL"}]

      (testing "returns tables with proper formatting"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [tables (table-utils/database-tables db-id)]
            (is (vector? tables))
            (is (every? #(contains? % :name) tables))
            (is (every? #(contains? % :schema) tables))
            (is (every? #(contains? % :columns) tables))
            (is (every? #(every? (fn [col] (contains? col :name)) (:columns %)) tables)))))

      (testing "respects all-tables-limit option"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [tables (table-utils/database-tables db-id {:all-tables-limit 1})]
            (is (<= (count tables) 1)))))

      (testing "excludes specified table IDs"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [all-tables (table-utils/database-tables db-id)
                filtered-tables (table-utils/database-tables db-id {:exclude-table-ids #{table1-id}})]
            (is (< (count filtered-tables) (count all-tables)))
            (is (not-any? #(= table1-id (:id %)) filtered-tables)))))

      (testing "prioritizes specified tables"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [priority-table {:id table2-id :name "orders" :schema "public"}
                tables (table-utils/database-tables db-id {:priority-tables [priority-table]})]
            (is (seq tables))
            ;; Priority table should appear first (if it appears at all)
            (is (= "orders" (-> tables first :name)))))))))

(deftest find-matching-tables-test
  (testing "find-matching-tables function"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table1-id :id} {:db_id db-id, :name "users", :schema "public", :active true, :visibility_type nil}
                   :model/Table    {} {:db_id db-id, :name "user_profiles", :schema "public", :active true, :visibility_type nil}
                   :model/Table    {} {:db_id db-id, :name "orders", :schema "public", :active true, :visibility_type nil}]

      (testing "finds tables with similar names"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [unrecognized [{:name "user" :schema "public"}]  ; similar to "users"
                matches (table-utils/find-matching-tables db-id unrecognized [])]
            (is (seq matches))
            (is (some #(= "users" (:name %)) matches)))))

      (testing "excludes used table IDs"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [unrecognized [{:name "user" :schema "public"}]
                matches (table-utils/find-matching-tables db-id unrecognized [table1-id])]
            (is (not-any? #(= table1-id (:id %)) matches)))))

      (testing "handles empty unrecognized tables"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [matches (table-utils/find-matching-tables db-id [] [])]
            (is (empty? matches)))))

      (testing "returns empty for completely different names"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [unrecognized [{:name "completely_different_xyz123" :schema "public"}]
                matches (table-utils/find-matching-tables db-id unrecognized [])]
            (is (empty? matches))))))))

(deftest used-tables-test
  (testing "used-tables function"
    (mt/with-temp [:model/Database {db-id :id :as db} {}
                   :model/Table    {table1-id :id} {:db_id db-id, :name "users", :schema "public", :active true, :visibility_type nil}
                   :model/Table    {} {:db_id db-id, :name "orders", :schema "public", :active true, :visibility_type nil}]

      (testing "handles query with recognized tables"
        (mt/with-current-user (mt/user->id :crowberto)
          ;; Mock query analyzer result with recognized table
          (with-redefs [query-analyzer/tables-for-native
                        (fn [_query & _opts]
                          {:tables [{:table "users" :table-id table1-id :schema "public"}]})]
            (let [query (mt/with-db db
                          (lib/native-query (mt/metadata-provider) "SELECT * FROM users"))
                  tables (table-utils/used-tables query)]
              (is (seq tables))
              (is (some #(= table1-id (:id %)) tables))))))

      (testing "handles query with unrecognized tables that have fuzzy matches"
        (mt/with-current-user (mt/user->id :crowberto)
          ;; Mock query analyzer result with unrecognized table
          (with-redefs [query-analyzer/tables-for-native
                        (fn [_query & _opts]
                          {:tables [{:table "user" :schema "public"}]})]  ; "user" should match "users"
            (let [query (mt/with-db db
                          (lib/native-query (mt/metadata-provider) "SELECT * FROM user"))
                  tables (table-utils/used-tables query)]
              (is (seq tables))
              ;; Should find the fuzzy match for "users" table
              (is (some #(= "users" (:name %)) tables))))))

      (testing "handles empty query analysis result"
        (mt/with-current-user (mt/user->id :crowberto)
          (with-redefs [query-analyzer/tables-for-native
                        (fn [_query & _opts] {:tables []})]
            (let [query (mt/with-db db
                          (lib/native-query (mt/metadata-provider) "SELECT 1"))
                  tables (table-utils/used-tables query)]
              (is (empty? tables))))))

      (testing "handles mixed recognized and unrecognized tables"
        (mt/with-current-user (mt/user->id :crowberto)
          (with-redefs [query-analyzer/tables-for-native
                        (fn [_query & _opts]
                          {:tables [{:table "users" :table-id table1-id :schema "public"}    ; recognized
                                    {:table "order" :schema "public"}]})]                     ; unrecognized, should match "orders"
            (let [query (mt/with-db db
                          (lib/native-query (mt/metadata-provider) "SELECT * FROM users JOIN order ON ..."))
                  tables (table-utils/used-tables query)]
              (is (>= (count tables) 1))  ; At least the recognized table
              (is (some #(= table1-id (:id %)) tables)))))))))

(deftest used-tables-from-ids-test
  (testing "used-tables-from-ids function"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Database {other-db-id :id} {}
                   :model/Table {table1-id :id} {:db_id db-id, :name "users", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table2-id :id} {:db_id db-id, :name "orders", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table3-id :id} {:db_id db-id, :name "products", :schema "inventory", :active true, :visibility_type nil}
                   :model/Table {inactive-id :id} {:db_id db-id, :name "old_data", :schema "public", :active false, :visibility_type nil}
                   :model/Table {hidden-id :id} {:db_id db-id, :name "sensitive", :schema "public", :active true, :visibility_type :hidden}
                   :model/Table {other-db-table-id :id} {:db_id other-db-id, :name "other_table", :schema "public", :active true, :visibility_type nil}]

      (testing "returns tables with correct structure for valid table-ids"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (= [{:id table1-id :name "users" :schema "public"}
                  {:id table3-id :name "products" :schema "inventory"}]
                 (table-utils/used-tables-from-ids db-id [table1-id table3-id])))))

      (testing "handles empty table-ids collection"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (empty? (table-utils/used-tables-from-ids db-id [])))))

      (testing "filters by database-id"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (= [{:id table1-id :name "users" :schema "public"}]
                 (table-utils/used-tables-from-ids db-id [table1-id other-db-table-id])))))

      (testing "filters out inactive tables"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (= [{:id table1-id :name "users" :schema "public"}]
                 (table-utils/used-tables-from-ids db-id [table1-id inactive-id])))))

      (testing "filters out hidden tables"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (= [{:id table1-id :name "users" :schema "public"}]
                 (table-utils/used-tables-from-ids db-id [table1-id hidden-id])))))

      (testing "handles non-existent table-ids"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [fake-id 999999]
            (is (empty? (table-utils/used-tables-from-ids db-id [fake-id]))))))

      (testing "handles mix of valid and invalid table-ids"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [fake-id 999999]
            (is (= [{:id table1-id :name "users" :schema "public"}
                    {:id table2-id :name "orders" :schema "public"}]
                   (table-utils/used-tables-from-ids db-id [table1-id fake-id table2-id])))))))))

;; ======================================
;; Edge Cases and Error Handling
;; ======================================

(deftest edge-cases-test
  (testing "edge cases and error handling"

    (testing "similar? with special characters"
      (is (table-utils/similar? "user-profiles" "user_profiles"))
      (is (table-utils/similar? "user.table" "user_table"))
      (is (not (table-utils/similar? "completely@different!table" "another#table"))))

    (testing "matching-tables? with nil values"
      (is (table-utils/matching-tables? {:name "test" :schema nil}
                                        {:name "test" :schema nil}
                                        {:match-schema? true}))
      (is (table-utils/matching-tables? {:name "test" :schema "public"}
                                        {:name "test" :schema nil}
                                        {:match-schema? true}))
      (is (table-utils/matching-tables? {:name "test" :schema "public"}
                                        {:name "test" :schema nil}
                                        {:match-schema? true}))))

  (testing "database-tables with invalid database ID"
    (mt/with-current-user (mt/user->id :crowberto)
      (is (empty? (table-utils/database-tables -1)))))

  (testing "find-matching-tables with empty database"
    (mt/with-temp [:model/Database {db-id :id} {}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [matches (table-utils/find-matching-tables db-id [{:name "nonexistent"}] [])]
          (is (empty? matches))))))

  (testing "used-tables handles query analyzer exceptions"
    (with-redefs [query-analyzer/tables-for-native
                  (fn [_query & _opts] (throw (Exception. "Query analysis failed")))]
      (let [query (lib/native-query (mt/metadata-provider) "SELECT * FROM users")]
        (is (thrown? Exception (table-utils/used-tables query))))))

  (testing "database-tables with inactive tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {} {:db_id db-id, :name "active_table", :active true, :visibility_type nil}
                   :model/Table    {} {:db_id db-id, :name "inactive_table", :active false, :visibility_type nil}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [tables (table-utils/database-tables db-id)]
          (is (every? #(not= "inactive_table" (:name %)) tables))
          (is (some #(= "active_table" (:name %)) tables))))))

  (testing "database-tables with hidden tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {} {:db_id db-id, :name "visible_table", :active true, :visibility_type nil}
                   :model/Table    {} {:db_id db-id, :name "hidden_table", :active true, :visibility_type "hidden"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [tables (table-utils/database-tables db-id)]
          (is (every? #(not= "hidden_table" (:name %)) tables))
          (is (some #(= "visible_table" (:name %)) tables)))))))

(deftest enhanced-database-tables-test
  (testing "enhanced-database-tables function with new format"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table1-id :id} {:db_id db-id, :name "users", :schema "public", :active true, :visibility_type nil}
                   :model/Table    {table2-id :id} {:db_id db-id, :name "orders", :schema "public", :active true, :visibility_type nil}
                   :model/Field    {user-id-field :id} {:table_id table1-id, :name "id", :database_type "INTEGER", :base_type :type/Integer, :semantic_type :type/PK}
                   :model/Field    {} {:table_id table1-id, :name "name", :database_type "VARCHAR", :base_type :type/Text}
                   :model/Field    {} {:table_id table2-id, :name "id", :database_type "INTEGER", :base_type :type/Integer, :semantic_type :type/PK}
                   :model/Field    {} {:table_id table2-id, :name "user_id", :database_type "INTEGER", :base_type :type/Integer, :semantic_type :type/FK, :fk_target_field_id user-id-field}
                   :model/Field    {} {:table_id table2-id, :name "total", :database_type "DECIMAL", :base_type :type/Decimal}]

      (testing "returns tables with new enhanced formatting"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [tables (table-utils/enhanced-database-tables db-id)]
            (is (vector? tables))
            (is (every? #(contains? % :name) tables))
            (is (every? #(contains? % :database_schema) tables))
            (is (every? #(contains? % :fields) tables))
            (is (every? #(contains? % :type) tables))
            (is (every? #(contains? % :display_name) tables))
            (is (every? #(= :table (:type %)) tables))
            (is (every? #(every? (fn [field] (contains? field :field_id)) (:fields %)) tables))
            (is (every? #(every? (fn [field] (contains? field :name)) (:fields %)) tables))
            (is (every? #(every? (fn [field] (contains? field :type)) (:fields %)) tables))
            (is (every? #(every? (fn [field] (contains? field :database_type)) (:fields %)) tables))
            (is (every? #(contains? % :metrics) tables)))))

      (testing "includes table_reference for implicitly joined fields"
        (mt/dataset test-data
          (mt/with-current-user (mt/user->id :crowberto)
            (let [test-db-id (mt/id)
                  tables (table-utils/enhanced-database-tables test-db-id)
                  orders-table (first (filter #(= "ORDERS" (:name %)) tables))
                  all-fields (:fields orders-table)
                  user-fields (filter #(= "User" (:table_reference %)) all-fields)
                  product-fields (filter #(= "Product" (:table_reference %)) all-fields)]
              (is (some? orders-table) "Expected to find ORDERS table")
              (is (seq user-fields) "Expected to find fields with table-reference 'User' from implicit join")
              (is (some #(= "NAME" (:name %)) user-fields) "Expected to find User NAME field from implicit join")
              (is (seq product-fields) "Expected to find fields with table-reference 'Product' from implicit join")
              (is (some #(= "TITLE" (:name %)) product-fields) "Expected to find Product TITLE field from implicit join")))))

      (testing "enhanced format respects all-tables-limit option"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [tables (table-utils/enhanced-database-tables db-id {:all-tables-limit 1})]
            (is (<= (count tables) 1)))))

      (testing "enhanced format excludes specified table IDs"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [all-tables (table-utils/enhanced-database-tables db-id)
                filtered-tables (table-utils/enhanced-database-tables db-id {:exclude-table-ids #{table1-id}})]
            (is (< (count filtered-tables) (count all-tables)))
            (is (not-any? #(= table1-id (:id %)) filtered-tables)))))

      (testing "enhanced format prioritizes specified tables"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [priority-table {:id table2-id :name "orders" :schema "public"}
                tables (table-utils/enhanced-database-tables db-id {:priority-tables [priority-table]})]
            (is (seq tables))
            ;; Priority table should appear first (if it appears at all)
            (is (= "orders" (-> tables first :name)))))))))

(deftest ^:parallel format-escaped-test
  (are [in out] (= out
                   (with-out-str (#'table-utils/format-escaped in *out*)))
    "almallama"      "almallama"
    "alma llama"     "\"alma llama\""
    "\"alma\" llama" "\"\"\"alma\"\" llama\""))

(deftest schema-sample-basic-functionality-test
  (testing "schema-sample with fewer tables than limit"
    (mt/with-temp [:model/Database {db-id :id :as db} {}
                   :model/Table {table1-id :id} {:db_id db-id, :name "users", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table2-id :id} {:db_id db-id, :name "orders", :schema "public", :active true, :visibility_type nil}
                   :model/Field {} {:table_id table1-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table1-id, :name "name", :database_type "VARCHAR(255)"}
                   :model/Field {} {:table_id table2-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table2-id, :name "total", :database_type "DECIMAL(10,2)"}]
      (let [query (mt/with-db db
                    (lib/native-query (mt/metadata-provider) "SELECT * FROM users"))
            ddl (table-utils/schema-sample query {:all-tables-limit 10})]
        (testing "returns DDL string"
          (is (string? ddl)))
        (testing "includes table definitions"
          (is (re-find #"CREATE TABLE" ddl))
          (is (re-find #"users" ddl))
          (is (re-find #"orders" ddl)))
        (testing "includes field definitions"
          (is (re-find #"id INTEGER" ddl))
          (is (re-find #"name VARCHAR\(255\)" ddl))
          (is (re-find #"total DECIMAL\(10,2\)" ddl)))
        (testing "includes schema prefix"
          (is (re-find #"public\.users" ddl))
          (is (re-find #"public\.orders" ddl)))))))

(deftest schema-sample-query-based-selection-test
  (testing "schema-sample with more tables than limit - uses query-based selection"
    (mt/with-temp [:model/Database {db-id :id :as db} {}
                   :model/Table {table1-id :id} {:db_id db-id, :name "users", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table2-id :id} {:db_id db-id, :name "orders", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table3-id :id} {:db_id db-id, :name "products", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table4-id :id} {:db_id db-id, :name "customers", :schema "public", :active true, :visibility_type nil}
                   :model/Field {} {:table_id table1-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table2-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table3-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table4-id, :name "id", :database_type "INTEGER"}]
      (mt/with-current-user (mt/user->id :crowberto)
        ;; Mock query analyzer to return only "users" table
        (with-redefs [query-analyzer/tables-for-native
                      (fn [_query & _opts]
                        {:tables [{:table "users" :table-id table1-id :schema "public"}]})]
          (let [query (mt/with-db db
                        (lib/native-query (mt/metadata-provider) "SELECT * FROM users"))
                ;; Set limit to 2, but we have 4 tables, so it should use query-based selection
                ddl (table-utils/schema-sample query {:all-tables-limit 2})]
            (testing "returns DDL string"
              (is (string? ddl)))
            (testing "includes table from query"
              (is (re-find #"users" ddl)))
            (testing "includes field definitions"
              (is (re-find #"id INTEGER" ddl)))))))))

(deftest schema-sample-default-limit-test
  (testing "schema-sample with default all-tables-limit"
    (mt/with-temp [:model/Database {db-id :id :as db} {}
                   :model/Table {table1-id :id} {:db_id db-id, :name "table1", :schema nil, :active true, :visibility_type nil}
                   :model/Field {} {:table_id table1-id, :name "col1", :database_type "TEXT"}]
      (let [query (mt/with-db db
                    (lib/native-query (mt/metadata-provider) "SELECT * FROM table1"))
            ddl (table-utils/schema-sample query)] ; No options, uses default limit
        (testing "returns DDL string"
          (is (string? ddl)))
        (testing "includes table without schema"
          (is (re-find #"CREATE TABLE table1" ddl))
          ;; Should not have schema prefix when schema is nil
          (is (not (re-find #"\.table1" ddl))))))))

(deftest schema-sample-special-characters-test
  (testing "schema-sample handles tables with special characters in names"
    (mt/with-temp [:model/Database {db-id :id :as db} {}
                   :model/Table {table1-id :id} {:db_id db-id, :name "user-profiles", :schema "my schema", :active true, :visibility_type nil}
                   :model/Field {} {:table_id table1-id, :name "user id", :database_type "INTEGER"}]
      (let [query (mt/with-db db
                    (lib/native-query (mt/metadata-provider) "SELECT * FROM \"user-profiles\""))
            ddl (table-utils/schema-sample query)]
        (testing "escapes table and schema names with special characters"
          (is (re-find #"\"my schema\"\.\"user-profiles\"" ddl)))
        (testing "escapes field names with special characters"
          (is (re-find #"\"user id\"" ddl)))))))

(deftest schema-sample-empty-database-test
  (testing "schema-sample handles empty database"
    (mt/with-temp [:model/Database db {}]
      (let [query (mt/with-db db
                    (lib/native-query (mt/metadata-provider) "SELECT 1"))
            ddl (table-utils/schema-sample query)]
        (testing "returns empty string for no tables"
          (is (string? ddl))
          (is (= "" ddl)))))))

(deftest schema-sample-table-visibility-test
  (testing "schema-sample excludes inactive and hidden tables"
    (mt/with-temp [:model/Database {db-id :id :as db} {}
                   :model/Table {table1-id :id} {:db_id db-id, :name "active_table", :active true, :visibility_type nil}
                   :model/Table {} {:db_id db-id, :name "inactive_table", :active false, :visibility_type nil}
                   :model/Table {} {:db_id db-id, :name "hidden_table", :active true, :visibility_type "hidden"}
                   :model/Field {} {:table_id table1-id, :name "id", :database_type "INTEGER"}]
      (let [query (mt/with-db db
                    (lib/native-query (mt/metadata-provider) "SELECT * FROM active_table"))
            ddl (table-utils/schema-sample query)]
        (testing "includes only active, visible tables"
          (is (re-find #"active_table" ddl))
          (is (not (re-find #"inactive_table" ddl)))
          (is (not (re-find #"hidden_table" ddl))))))))

(deftest schema-sample-empty-tables-test
  (testing "schema-sample handles tables without fields"
    (mt/with-temp [:model/Database {db-id :id :as db} {}
                   :model/Table {} {:db_id db-id, :name "empty_table", :schema "public", :active true, :visibility_type nil}]
      (let [query (mt/with-db db
                    (lib/native-query (mt/metadata-provider) "SELECT * FROM empty_table"))
            ddl (table-utils/schema-sample query)]
        (testing "creates DDL for table without fields"
          (is (re-find #"CREATE TABLE public\.empty_table \(\n\);" ddl)))))))

(deftest schema-sample-limit-exceeded-fuzzy-matching-test
  (testing "schema-sample when limit exceeded, uses fuzzy matching for query tables"
    (mt/with-temp [:model/Database {db-id :id :as db} {}
                   :model/Table {table1-id :id} {:db_id db-id, :name "users", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table2-id :id} {:db_id db-id, :name "user_profiles", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table3-id :id} {:db_id db-id, :name "products", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table4-id :id} {:db_id db-id, :name "customers", :schema "public", :active true, :visibility_type nil}
                   :model/Field {} {:table_id table1-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table2-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table3-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table4-id, :name "id", :database_type "INTEGER"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (with-redefs [query-analyzer/tables-for-native
                      (fn [_query & _opts]
                        {:tables [{:table "users" :table-id table1-id :schema "public"}
                                  {:table "products" :table-id table3-id :schema "public"}]})]
          (let [query (mt/with-db db
                        (lib/native-query (mt/metadata-provider) "SELECT * FROM users JOIN products"))
                ddl (table-utils/schema-sample query {:all-tables-limit 1})]
            (testing "includes tables that match query"
              (is (re-find #"users" ddl))
              (is (re-find #"products" ddl))
              (is (re-find #"customers" ddl)))))))))

(deftest schema-sample-fuzzy-matching-similar-names-test
  (testing "schema-sample fuzzy matching behavior with similar table names"
    ;; This test documents the fuzzy matching behavior when limit is exceeded
    (mt/with-temp [:model/Database {db-id :id :as db} {}
                   :model/Table {table1-id :id} {:db_id db-id, :name "order", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table2-id :id} {:db_id db-id, :name "orders", :schema "public", :active true, :visibility_type nil}
                   :model/Table {table3-id :id} {:db_id db-id, :name "order_items", :schema "public", :active true, :visibility_type nil}
                   :model/Field {} {:table_id table1-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table2-id, :name "id", :database_type "INTEGER"}
                   :model/Field {} {:table_id table3-id, :name "id", :database_type "INTEGER"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (with-redefs [query-analyzer/tables-for-native
                      (fn [_query & _opts]
                        ;; Return "order" which will fuzzy match multiple tables
                        {:tables [{:table "order" :schema "public"}]})]
          (let [query (mt/with-db db
                        (lib/native-query (mt/metadata-provider) "SELECT * FROM order"))
                ddl (table-utils/schema-sample query {:all-tables-limit 1})]
            (testing "fuzzy matches similar table names"
              ;; "order" will match both "order" and "orders" due to fuzzy matching
              (is (re-find #"\border\b" ddl))
              (is (re-find #"\borders\b" ddl)))))))))
