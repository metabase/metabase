(ns metabase.llm.context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.context :as context]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- parse-table-mentions Tests -------------------------------------------

(deftest parse-table-mentions-test
  (testing "extracts single table ID"
    (is (= #{42}
           (context/parse-table-mentions "Show [Orders](metabase://table/42)"))))

  (testing "extracts multiple table IDs"
    (is (= #{42 15}
           (context/parse-table-mentions
            "Join [Orders](metabase://table/42) with [Products](metabase://table/15)"))))

  (testing "handles no mentions"
    (is (= #{} (context/parse-table-mentions "Show me all sales"))))

  (testing "handles nil input"
    (is (nil? (context/parse-table-mentions nil))))

  (testing "handles empty string"
    (is (= #{} (context/parse-table-mentions ""))))

  (testing "ignores malformed mentions - invalid ID"
    (is (= #{42}
           (context/parse-table-mentions
            "[Valid](metabase://table/42) [Invalid](metabase://table/abc)"))))

  (testing "handles display names with special characters"
    (is (= #{123}
           (context/parse-table-mentions
            "[Order's & Items](metabase://table/123)"))))

  (testing "handles multiple mentions of same table (returns set)"
    (is (= #{42}
           (context/parse-table-mentions
            "[Orders](metabase://table/42) and also [Orders Table](metabase://table/42)"))))

  (testing "handles text before and after mentions"
    (is (= #{1 2}
           (context/parse-table-mentions
            "Please show me data from [Users](metabase://table/1) joined with [Orders](metabase://table/2) filtered by date")))))

;;; ------------------------------------------ DDL Formatting Tests ------------------------------------------

(deftest format-schema-ddl-test
  (testing "formats simple table"
    (let [tables [{:name "users" :schema nil :columns [{:name "id" :database_type "INTEGER"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (= "CREATE TABLE users (\n  id INTEGER\n);" result))))

  (testing "formats table with schema"
    (let [tables [{:name "users" :schema "public" :columns [{:name "id" :database_type "INTEGER"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (= "CREATE TABLE public.users (\n  id INTEGER\n);" result))))

  (testing "formats table with multiple columns"
    (let [tables [{:name "orders"
                   :schema nil
                   :columns [{:name "id" :database_type "INTEGER"}
                             {:name "total" :database_type "DECIMAL"}
                             {:name "created_at" :database_type "TIMESTAMP"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (str/includes? result "id INTEGER"))
      (is (str/includes? result "total DECIMAL"))
      (is (str/includes? result "created_at TIMESTAMP"))))

  (testing "escapes special characters in identifiers"
    (let [tables [{:name "user data" :schema nil :columns [{:name "first name" :database_type "VARCHAR"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (str/includes? result "\"user data\""))
      (is (str/includes? result "\"first name\""))))

  (testing "formats multiple tables"
    (let [tables [{:name "users" :schema nil :columns [{:name "id" :database_type "INTEGER"}]}
                  {:name "orders" :schema nil :columns [{:name "id" :database_type "INTEGER"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (str/includes? result "CREATE TABLE users"))
      (is (str/includes? result "CREATE TABLE orders"))))

  (testing "formats table with description"
    (let [tables [{:name "orders"
                   :schema "public"
                   :description "Customer purchase transactions"
                   :columns [{:name "id" :database_type "INTEGER"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (= "-- Customer purchase transactions\nCREATE TABLE public.orders (\n  id INTEGER\n);" result))))

  (testing "formats table without description (no comment line)"
    (let [tables [{:name "orders"
                   :schema nil
                   :description nil
                   :columns [{:name "id" :database_type "INTEGER"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (= "CREATE TABLE orders (\n  id INTEGER\n);" result)))))

;;; ----------------------------------------- build-schema-context Tests -----------------------------------------

(deftest build-schema-context-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Database db     {}
                   :model/Table    table1 {:db_id (:id db) :name "orders" :schema "public"}
                   :model/Field    _f1    {:table_id (:id table1) :name "id" :database_type "INTEGER" :base_type :type/Integer}
                   :model/Field    _f2    {:table_id (:id table1) :name "total" :database_type "DECIMAL" :base_type :type/Decimal}]
      (testing "returns DDL for accessible tables"
        (let [result (context/build-schema-context (:id db) #{(:id table1)})]
          (is (some? result))
          (is (str/includes? result "CREATE TABLE"))
          (is (str/includes? result "orders"))
          (is (str/includes? result "id"))
          (is (str/includes? result "total"))))

      (testing "returns nil for empty table-ids"
        (is (nil? (context/build-schema-context (:id db) #{}))))

      (testing "returns nil for nil table-ids"
        (is (nil? (context/build-schema-context (:id db) nil))))

      (testing "returns nil for nil database-id"
        (is (nil? (context/build-schema-context nil #{(:id table1)}))))

      (testing "returns nil for non-existent tables"
        (is (nil? (context/build-schema-context (:id db) #{99999})))))))

(deftest build-schema-context-multiple-tables-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Database db     {}
                   :model/Table    t1     {:db_id (:id db) :name "users" :schema "public"}
                   :model/Field    _f1    {:table_id (:id t1) :name "id" :database_type "INTEGER" :base_type :type/Integer}
                   :model/Field    _f2    {:table_id (:id t1) :name "email" :database_type "VARCHAR" :base_type :type/Text}
                   :model/Table    t2     {:db_id (:id db) :name "orders" :schema "public"}
                   :model/Field    _f3    {:table_id (:id t2) :name "id" :database_type "INTEGER" :base_type :type/Integer}
                   :model/Field    _f4    {:table_id (:id t2) :name "user_id" :database_type "INTEGER" :base_type :type/Integer}]
      (testing "returns DDL for multiple tables"
        (let [result (context/build-schema-context (:id db) #{(:id t1) (:id t2)})]
          (is (some? result))
          (is (str/includes? result "users"))
          (is (str/includes? result "orders"))
          (is (str/includes? result "email"))
          (is (str/includes? result "user_id")))))))

;;; ----------------------------------------- Fingerprint Formatting Tests -----------------------------------------

(deftest format-numeric-stats-test
  (testing "formats integer range"
    (is (= "range: 1-100, avg: 50"
           (#'context/format-numeric-stats {:min 1 :max 100 :avg 50}))))

  (testing "formats decimal range"
    (is (= "range: 0.00-999.99, avg: 127.50"
           (#'context/format-numeric-stats {:min 0.0 :max 999.99 :avg 127.5}))))

  (testing "handles missing avg"
    (is (= "range: 0-100"
           (#'context/format-numeric-stats {:min 0 :max 100}))))

  (testing "returns nil when min/max missing"
    (is (nil? (#'context/format-numeric-stats {:avg 50})))
    (is (nil? (#'context/format-numeric-stats {})))))

(deftest format-temporal-stats-test
  (testing "formats date range"
    (is (= "2020-01-01 to 2024-12-31"
           (#'context/format-temporal-stats {:earliest "2020-01-01T00:00:00Z"
                                             :latest   "2024-12-31T23:59:59Z"}))))

  (testing "handles short date strings"
    (is (= "2020-01-01 to 2024-12-31"
           (#'context/format-temporal-stats {:earliest "2020-01-01"
                                             :latest   "2024-12-31"}))))

  (testing "returns nil when dates missing"
    (is (nil? (#'context/format-temporal-stats {:earliest "2020-01-01"})))
    (is (nil? (#'context/format-temporal-stats {})))))

;;; ----------------------------------------- Column Comment Building Tests -----------------------------------------

(deftest build-column-comment-test
  (testing "description takes priority"
    (is (= "Customer email address"
           (#'context/build-column-comment
            {:description "Customer email address"
             :semantic_type :type/Email}
            nil nil))))

  (testing "sample values for category"
    (is (= "active, inactive, pending"
           (#'context/build-column-comment
            {:semantic_type :type/Category}
            ["active" "inactive" "pending"]
            nil))))

  (testing "FK reference"
    (is (= "FK->users.id"
           (#'context/build-column-comment
            {:fk_target_field_id 123}
            nil
            {:table "users" :field "id"}))))

  (testing "semantic type hints"
    (is (= "PK"
           (#'context/build-column-comment {:semantic_type :type/PK} nil nil)))
    (is (= "Email"
           (#'context/build-column-comment {:semantic_type :type/Email} nil nil))))

  (testing "numeric fingerprint stats"
    (is (= "range: 0-1000, avg: 127.50"
           (#'context/build-column-comment
            {:fingerprint {:type {:type/Number {:min 0 :max 1000 :avg 127.5}}}}
            nil nil))))

  (testing "temporal fingerprint stats"
    (is (= "2020-01-01 to 2024-12-31"
           (#'context/build-column-comment
            {:fingerprint {:type {:type/DateTime {:earliest "2020-01-01T00:00:00Z"
                                                  :latest   "2024-12-31T23:59:59Z"}}}}
            nil nil))))

  (testing "combined metadata"
    (is (= "Order status; pending, shipped, delivered"
           (#'context/build-column-comment
            {:description "Order status"}
            ["pending" "shipped" "delivered"]
            nil))))

  (testing "returns nil for no metadata"
    (is (nil? (#'context/build-column-comment {} nil nil)))))

(deftest truncate-value-test
  (testing "short values unchanged"
    (is (= "active" (#'context/truncate-value "active"))))

  (testing "long values truncated"
    (is (= "this is a very long value t..."
           (#'context/truncate-value "this is a very long value that exceeds the limit")))))

;;; ----------------------------------------- DDL with Comments Tests -----------------------------------------

(deftest format-schema-ddl-with-comments-test
  (testing "formats table with column comments"
    (let [tables [{:name "orders"
                   :schema nil
                   :columns [{:name "id" :database_type "INTEGER" :comment "PK"}
                             {:name "status" :database_type "VARCHAR" :comment "pending, shipped, delivered"}
                             {:name "total" :database_type "DECIMAL" :comment "range: 0-9999.99"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (str/includes? result "-- PK"))
      (is (str/includes? result "-- pending, shipped, delivered"))
      (is (str/includes? result "-- range: 0-9999.99"))
      (is (str/includes? result "id INTEGER"))
      (is (str/includes? result "status VARCHAR"))
      (is (str/includes? result "total DECIMAL"))))

  (testing "formats table with mixed commented and non-commented columns"
    (let [tables [{:name "users"
                   :schema nil
                   :columns [{:name "id" :database_type "INTEGER" :comment "PK"}
                             {:name "name" :database_type "VARCHAR"}
                             {:name "email" :database_type "VARCHAR" :comment "email"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (str/includes? result "-- PK"))
      (is (str/includes? result "-- email"))
      (is (str/includes? result "id INTEGER"))
      (is (str/includes? result "name VARCHAR"))
      (is (str/includes? result "email VARCHAR"))))

  (testing "formats table without any comments (backward compatible)"
    (let [tables [{:name "simple"
                   :schema nil
                   :columns [{:name "a" :database_type "INT"}
                             {:name "b" :database_type "TEXT"}]}]
          result (#'context/format-schema-ddl tables)]
      (is (= "CREATE TABLE simple (\n  a INT,\n  b TEXT\n);" result)))))

;;; ----------------------------------------- Enriched Context Integration Tests -----------------------------------------

(deftest build-schema-context-with-description-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (:id db) :name "products" :schema "public"}
                   :model/Field    _f1   {:table_id    (:id table)
                                          :name        "id"
                                          :database_type "INTEGER"
                                          :base_type   :type/Integer
                                          :semantic_type :type/PK}
                   :model/Field    _f2   {:table_id    (:id table)
                                          :name        "name"
                                          :database_type "VARCHAR"
                                          :base_type   :type/Text
                                          :description "Product display name"}]
      (testing "includes field description in DDL comments"
        (let [result (context/build-schema-context (:id db) #{(:id table)})]
          (is (some? result))
          (is (str/includes? result "products"))
          (is (str/includes? result "-- Product display name")))))))

(deftest build-schema-context-with-fk-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Database db     {}
                   :model/Table    users  {:db_id (:id db) :name "users" :schema "public"}
                   :model/Field    uid    {:table_id (:id users) :name "id" :database_type "INTEGER" :base_type :type/Integer}
                   :model/Table    orders {:db_id (:id db) :name "orders" :schema "public"}
                   :model/Field    _oid   {:table_id (:id orders) :name "id" :database_type "INTEGER" :base_type :type/Integer}
                   :model/Field    _fk    {:table_id         (:id orders)
                                           :name             "user_id"
                                           :database_type    "INTEGER"
                                           :base_type        :type/Integer
                                           :semantic_type    :type/FK
                                           :fk_target_field_id (:id uid)}]
      (testing "includes FK relationship in DDL comments"
        (let [result (context/build-schema-context (:id db) #{(:id orders)})]
          (is (some? result))
          (is (str/includes? result "FK->users.id")))))))

(deftest build-schema-context-with-field-values-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Database   db    {}
                   :model/Table      table {:db_id (:id db) :name "orders" :schema "public"}
                   :model/Field      field {:table_id       (:id table)
                                            :name           "status"
                                            :database_type  "VARCHAR"
                                            :base_type      :type/Text
                                            :has_field_values :list}
                   :model/FieldValues _fv  {:field_id (:id field)
                                            :values   ["pending" "shipped" "delivered"]
                                            :type     :full}]
      (testing "includes sample values in DDL comments"
        (let [result (context/build-schema-context (:id db) #{(:id table)})]
          (is (some? result))
          (is (str/includes? result "pending"))
          (is (str/includes? result "shipped"))
          (is (str/includes? result "delivered")))))))

(deftest build-schema-context-with-table-description-test
  (mt/with-test-user :crowberto
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id       (:id db)
                                          :name        "orders"
                                          :schema      "public"
                                          :description "Customer purchase transactions"}
                   :model/Field    _f1   {:table_id      (:id table)
                                          :name          "id"
                                          :database_type "INTEGER"
                                          :base_type     :type/Integer}]
      (testing "includes table description as comment above CREATE TABLE"
        (let [result (context/build-schema-context (:id db) #{(:id table)})]
          (is (some? result))
          (is (str/includes? result "-- Customer purchase transactions"))
          (is (str/includes? result "CREATE TABLE")))))))

;;; ----------------------------------------- extract-tables-from-sql Tests -----------------------------------------

(deftest extract-tables-from-sql-test
  (testing "returns empty set for nil inputs"
    (is (= #{} (context/extract-tables-from-sql nil nil)))
    (is (= #{} (context/extract-tables-from-sql 1 nil)))
    (is (= #{} (context/extract-tables-from-sql nil "SELECT 1"))))

  (testing "returns empty set for empty SQL"
    (is (= #{} (context/extract-tables-from-sql 1 "")))
    (is (= #{} (context/extract-tables-from-sql 1 "   ")))))

(deftest extract-tables-from-sql-with-sample-database-test
  (mt/with-test-user :crowberto
    (testing "extracts single table from simple SELECT"
      (let [result (context/extract-tables-from-sql (mt/id) "SELECT * FROM ORDERS")]
        (is (set? result))
        (is (contains? result (mt/id :orders)))))

    (testing "extracts multiple tables from JOIN"
      (let [result (context/extract-tables-from-sql (mt/id)
                                                    "SELECT * FROM ORDERS o JOIN PRODUCTS p ON o.PRODUCT_ID = p.ID")]
        (is (set? result))
        (is (contains? result (mt/id :orders)))
        (is (contains? result (mt/id :products)))))

    (testing "extracts tables from subquery"
      (let [result (context/extract-tables-from-sql (mt/id)
                                                    "SELECT * FROM (SELECT * FROM PEOPLE) sub")]
        (is (set? result))
        (is (contains? result (mt/id :people)))))

    (testing "returns empty set for non-existent table"
      (let [result (context/extract-tables-from-sql (mt/id) "SELECT * FROM NONEXISTENT_TABLE")]
        (is (= #{} result))))

    (testing "returns empty set for invalid SQL (graceful failure)"
      (let [result (context/extract-tables-from-sql (mt/id) "THIS IS NOT SQL")]
        (is (= #{} result))))))
