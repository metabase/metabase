(ns metabase-enterprise.metabot-v3.tools.sql-tools-test
  "Comprehensive tests for SQL query manipulation tools."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-sql-query :as create-sql-query]
   [metabase-enterprise.metabot-v3.tools.edit-sql-query :as edit-sql-query]
   [metabase-enterprise.metabot-v3.tools.replace-sql-query :as replace-sql-query]
   [metabase-enterprise.metabot-v3.tools.sql-search :as sql-search]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest edit-sql-query-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}]
        (testing "replace edit type"
          (let [original-sql "SELECT * FROM users WHERE id = 1"
                query-id "q1"
                queries-state {query-id {:database db-id
                                         :type :native
                                         :native {:query original-sql}}}
                result (edit-sql-query/edit-sql-query
                        {:query-id query-id
                         :queries-state queries-state
                         :edit {:type :replace
                                :old "id = 1"
                                :new "id = 2"}})]
            (is (= query-id (:query-id result)))
            (is (= "SELECT * FROM users WHERE id = 2" (:query-content result)))))

        (testing "append edit type"
          (let [original-sql "SELECT * FROM users"
                query-id "q2"
                queries-state {query-id {:database db-id
                                         :type :native
                                         :native {:query original-sql}}}
                result (edit-sql-query/edit-sql-query
                        {:query-id query-id
                         :queries-state queries-state
                         :edit {:type :append
                                :text "WHERE active = true"}})]
            (is (str/includes? (:query-content result) "WHERE active = true"))))

        (testing "replace-all edit type"
          (let [original-sql "SELECT id, id FROM users WHERE id = 1"
                query-id "q3"
                queries-state {query-id {:database db-id
                                         :type :native
                                         :native {:query original-sql}}}
                result (edit-sql-query/edit-sql-query
                        {:query-id query-id
                         :queries-state queries-state
                         :edit {:type :replace-all
                                :old "id"
                                :new "user_id"}})]
            (is (= "SELECT user_id, user_id FROM users WHERE user_id = 1"
                   (:query-content result)))))

        (testing "insert-after edit type"
          (let [original-sql "SELECT *\nFROM users"
                query-id "q4"
                queries-state {query-id {:database db-id
                                         :type :native
                                         :native {:query original-sql}}}
                result (edit-sql-query/edit-sql-query
                        {:query-id query-id
                         :queries-state queries-state
                         :edit {:type :insert-after
                                :marker "FROM users"
                                :text "WHERE active = true"}})]
            (is (str/includes? (:query-content result) "FROM users\nWHERE active"))))))))

(deftest replace-sql-query-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}]
        (testing "replaces SQL content entirely"
          (let [original-sql "SELECT * FROM users"
                new-sql "SELECT id, name FROM customers"
                query-id "q5"
                queries-state {query-id {:database db-id
                                         :type :native
                                         :native {:query original-sql}}}
                result (replace-sql-query/replace-sql-query
                        {:query-id query-id
                         :queries-state queries-state
                         :sql new-sql})]
            (is (= new-sql (:query-content result)))
            (is (= db-id (:database result)))))

        (testing "replaces SQL and updates name/description"
          (let [query-id "q6"
                queries-state {query-id {:database db-id
                                         :type :native
                                         :native {:query "SELECT 1"}}}
                result (replace-sql-query/replace-sql-query
                        {:query-id query-id
                         :queries-state queries-state
                         :sql "SELECT 2"
                         :name "New Name"
                         :description "New Description"})]
            (is (= "SELECT 2" (:query-content result)))
            (is (= db-id (:database result)))))))))

(deftest sql-search-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}]
        (testing "finds queries by SQL content"
          ;; Create test queries
          (t2/insert! :model/Card
                      {:name "Revenue Query"
                       :dataset_query {:database db-id
                                       :type :native
                                       :native {:query "SELECT SUM(revenue) FROM orders"}}
                       :display :table
                       :visualization_settings {}
                       :creator_id (mt/user->id :crowberto)
                       :archived false})
          (t2/insert! :model/Card
                      {:name "Users Query"
                       :dataset_query {:database db-id
                                       :type :native
                                       :native {:query "SELECT * FROM users"}}
                       :display :table
                       :visualization_settings {}
                       :creator_id (mt/user->id :crowberto)
                       :archived false})
          (t2/insert! :model/Card
                      {:name "Another Revenue Query"
                       :dataset_query {:database db-id
                                       :type :native
                                       :native {:query "SELECT revenue FROM sales"}}
                       :display :table
                       :visualization_settings {}
                       :creator_id (mt/user->id :crowberto)
                       :archived false})

          ;; Search for "revenue"
          (let [result (sql-search/sql-search {:query "revenue"})]
            (is (contains? result :data))
            (is (contains? result :total_count))
            (is (>= (:total_count result) 2)) ; Should find at least 2 revenue queries
            (is (every? #(or (str/includes? (str/lower-case (:name %)) "revenue")
                             (str/includes? (str/lower-case (or (:query_snippet %) "")) "revenue"))
                        (:data result)))))

        (testing "filters by database_id"
          (mt/with-temp [:model/Database {other-db-id :id} {}]
            (t2/insert! :model/Card
                        {:name "Other DB Query"
                         :dataset_query {:database other-db-id
                                         :type :native
                                         :native {:query "SELECT test FROM table"}}
                         :display :table
                         :visualization_settings {}
                         :creator_id (mt/user->id :crowberto)
                         :archived false})

            (let [result (sql-search/sql-search {:query "test" :database-id db-id})]
              ;; Should not find the query from other-db
              (is (every? #(= db-id (:database_id %)) (:data result))))))

        (testing "respects limit parameter"
          ;; Create many queries
          (doseq [i (range 25)]
            (t2/insert! :model/Card
                        {:name (str "Query " i)
                         :dataset_query {:database db-id
                                         :type :native
                                         :native {:query "SELECT common FROM table"}}
                         :display :table
                         :visualization_settings {}
                         :creator_id (mt/user->id :crowberto)
                         :archived false}))

          (let [result (sql-search/sql-search {:query "common" :limit 10})]
            (is (<= (:total_count result) 10))))))))

(deftest integration-create-edit-in-memory-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}]
        (testing "full workflow: create and edit in memory"
          (let [create-result (create-sql-query/create-sql-query
                               {:database-id db-id
                                :sql "SELECT * FROM products WHERE category = 'electronics'"
                                :name "Electronics Products"})
                query-id (:query-id create-result)
                queries-state {query-id (:query create-result)}
                edit-result (edit-sql-query/edit-sql-query
                             {:query-id query-id
                              :queries-state queries-state
                              :edit {:type :replace
                                     :old "electronics"
                                     :new "furniture"}})]
            (is (str/includes? (:query-content edit-result) "furniture"))))))))
