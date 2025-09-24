(ns metabase-enterprise.metabot-v3.table-utils-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.query-analyzer :as query-analyzer]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]
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
    (is (table-utils/similar? "PEOPLE" "PEOPL"))    ; remove 1 char (our use case!)
    (is (table-utils/similar? "ORDERS" "ORDRE"))    ; change 1 char
    (is (table-utils/similar? "ACCOUNTS" "ACOUNT")))) ; remove 2 chars

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
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {table1-id :id} {:db_id db-id, :name "users", :schema "public", :active true, :visibility_type nil}
                   :model/Table    {} {:db_id db-id, :name "orders", :schema "public", :active true, :visibility_type nil}]

      (testing "handles query with recognized tables"
        (mt/with-current-user (mt/user->id :crowberto)
          ;; Mock query analyzer result with recognized table
          (with-redefs [query-analyzer/tables-for-native
                        (fn [_query & _opts]
                          {:tables [{:table "users" :table-id table1-id :schema "public"}]})]
            (let [query {:database db-id :native {:query "SELECT * FROM users"}}
                  tables (table-utils/used-tables query)]
              (is (seq tables))
              (is (some #(= table1-id (:id %)) tables))))))

      (testing "handles query with unrecognized tables that have fuzzy matches"
        (mt/with-current-user (mt/user->id :crowberto)
          ;; Mock query analyzer result with unrecognized table
          (with-redefs [query-analyzer/tables-for-native
                        (fn [_query & _opts]
                          {:tables [{:table "user" :schema "public"}]})]  ; "user" should match "users"
            (let [query {:database db-id :native {:query "SELECT * FROM user"}}
                  tables (table-utils/used-tables query)]
              (is (seq tables))
              ;; Should find the fuzzy match for "users" table
              (is (some #(= "users" (:name %)) tables))))))

      (testing "handles empty query analysis result"
        (mt/with-current-user (mt/user->id :crowberto)
          (with-redefs [query-analyzer/tables-for-native
                        (fn [_query & _opts] {:tables []})]
            (let [query {:database db-id :native {:query "SELECT 1"}}
                  tables (table-utils/used-tables query)]
              (is (empty? tables))))))

      (testing "handles mixed recognized and unrecognized tables"
        (mt/with-current-user (mt/user->id :crowberto)
          (with-redefs [query-analyzer/tables-for-native
                        (fn [_query & _opts]
                          {:tables [{:table "users" :table-id table1-id :schema "public"}    ; recognized
                                    {:table "order" :schema "public"}]})]                     ; unrecognized, should match "orders"
            (let [query {:database db-id :native {:query "SELECT * FROM users JOIN order ON ..."}}
                  tables (table-utils/used-tables query)]
              (is (>= (count tables) 1))  ; At least the recognized table
              (is (some #(= table1-id (:id %)) tables)))))))))

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
      (let [query {:database 1 :native {:query "SELECT * FROM users"}}]
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
