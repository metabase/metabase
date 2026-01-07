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
      (is (str/includes? result "CREATE TABLE orders")))))

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
