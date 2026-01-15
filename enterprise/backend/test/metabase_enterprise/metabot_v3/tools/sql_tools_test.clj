(ns metabase-enterprise.metabot-v3.tools.sql-tools-test
  "Comprehensive tests for SQL query manipulation tools."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-sql-query :as create-sql-query]
   [metabase-enterprise.metabot-v3.tools.edit-sql-query :as edit-sql-query]
   [metabase-enterprise.metabot-v3.tools.replace-sql-query :as replace-sql-query]
   [metabase-enterprise.metabot-v3.tools.sql-search :as sql-search]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest edit-sql-query-test
  (mt/test-drivers #{:h2}
    (mt/with-temp [:model/Database {db-id :id} {}]
      (testing "replace edit type"
        (let [original-sql "SELECT * FROM users WHERE id = 1"
              card (t2/insert-returning-instance! :model/Card
                                                  {:name "Test Card"
                                                   :dataset_query {:database db-id
                                                                   :type :native
                                                                   :native {:query original-sql}}
                                                   :display :table
                                                   :creator_id (mt/user->id :crowberto)})
              result (edit-sql-query/edit-sql-query
                      {:query-id (:id card)
                       :edit {:type :replace
                              :old "id = 1"
                              :new "id = 2"}})]
          (is (= (:id card) (:query-id result)))
          (is (= "SELECT * FROM users WHERE id = 2" (:query-content result)))))

      (testing "append edit type"
        (let [original-sql "SELECT * FROM users"
              card (t2/insert-returning-instance! :model/Card
                                                  {:name "Test Card"
                                                   :dataset_query {:database db-id
                                                                   :type :native
                                                                   :native {:query original-sql}}
                                                   :display :table
                                                   :creator_id (mt/user->id :crowberto)})
              result (edit-sql-query/edit-sql-query
                      {:query-id (:id card)
                       :edit {:type :append
                              :text "WHERE active = true"}})]
          (is (clojure.string/includes? (:query-content result) "WHERE active = true"))))

      (testing "replace-all edit type"
        (let [original-sql "SELECT id, id FROM users WHERE id = 1"
              card (t2/insert-returning-instance! :model/Card
                                                  {:name "Test Card"
                                                   :dataset_query {:database db-id
                                                                   :type :native
                                                                   :native {:query original-sql}}
                                                   :display :table
                                                   :creator_id (mt/user->id :crowberto)})
              result (edit-sql-query/edit-sql-query
                      {:query-id (:id card)
                       :edit {:type :replace-all
                              :old "id"
                              :new "user_id"}})]
          (is (= "SELECT user_id, user_id FROM users WHERE user_id = 1"
                 (:query-content result)))))

      (testing "insert-after edit type"
        (let [original-sql "SELECT *\nFROM users"
              card (t2/insert-returning-instance! :model/Card
                                                  {:name "Test Card"
                                                   :dataset_query {:database db-id
                                                                   :type :native
                                                                   :native {:query original-sql}}
                                                   :display :table
                                                   :creator_id (mt/user->id :crowberto)})
              result (edit-sql-query/edit-sql-query
                      {:query-id (:id card)
                       :edit {:type :insert-after
                              :marker "FROM users"
                              :text "WHERE active = true"}})]
          (is (clojure.string/includes? (:query-content result) "FROM users\nWHERE active")))))))

(deftest replace-sql-query-test
  (mt/test-drivers #{:h2}
    (mt/with-temp [:model/Database {db-id :id} {}]
      (testing "replaces SQL content entirely"
        (let [original-sql "SELECT * FROM users"
              new-sql "SELECT id, name FROM customers"
              card (t2/insert-returning-instance! :model/Card
                                                  {:name "Original Query"
                                                   :description "Original description"
                                                   :dataset_query {:database db-id
                                                                   :type :native
                                                                   :native {:query original-sql}}
                                                   :display :table
                                                   :creator_id (mt/user->id :crowberto)})
              result (replace-sql-query/replace-sql-query
                      {:query-id (:id card)
                       :sql new-sql})]
          (is (= new-sql (:query-content result)))

          ;; Verify metadata was preserved
          (let [updated-card (t2/select-one :model/Card :id (:id card))]
            (is (= "Original Query" (:name updated-card)))
            (is (= "Original description" (:description updated-card))))))

      (testing "replaces SQL and updates name/description"
        (let [card (t2/insert-returning-instance! :model/Card
                                                  {:name "Old Name"
                                                   :dataset_query {:database db-id
                                                                   :type :native
                                                                   :native {:query "SELECT 1"}}
                                                   :display :table
                                                   :creator_id (mt/user->id :crowberto)})
              result (replace-sql-query/replace-sql-query
                      {:query-id (:id card)
                       :sql "SELECT 2"
                       :name "New Name"
                       :description "New Description"})]
          (let [updated-card (t2/select-one :model/Card :id (:id card))]
            (is (= "New Name" (:name updated-card)))
            (is (= "New Description" (:description updated-card)))
            (is (= "SELECT 2" (get-in updated-card [:dataset_query :native :query])))))))))

(deftest sql-search-test
  (mt/test-drivers #{:h2}
    (mt/with-temp [:model/Database {db-id :id} {}]
      (testing "finds queries by SQL content"
        ;; Create test queries
        (t2/insert! :model/Card
                    {:name "Revenue Query"
                     :dataset_query {:database db-id
                                     :type :native
                                     :native {:query "SELECT SUM(revenue) FROM orders"}}
                     :display :table
                     :creator_id (mt/user->id :crowberto)
                     :archived false})
        (t2/insert! :model/Card
                    {:name "Users Query"
                     :dataset_query {:database db-id
                                     :type :native
                                     :native {:query "SELECT * FROM users"}}
                     :display :table
                     :creator_id (mt/user->id :crowberto)
                     :archived false})
        (t2/insert! :model/Card
                    {:name "Another Revenue Query"
                     :dataset_query {:database db-id
                                     :type :native
                                     :native {:query "SELECT revenue FROM sales"}}
                     :display :table
                     :creator_id (mt/user->id :crowberto)
                     :archived false})

        ;; Search for "revenue"
        (let [result (sql-search/sql-search {:query "revenue"})]
          (is (contains? result :data))
          (is (contains? result :total_count))
          (is (>= (:total_count result) 2)) ; Should find at least 2 revenue queries
          (is (every? #(or (clojure.string/includes? (clojure.string/lower-case (:name %)) "revenue")
                           (clojure.string/includes? (clojure.string/lower-case (or (:query_snippet %) "")) "revenue"))
                      (:data result)))))

      (testing "filters by database_id"
        (mt/with-temp [:model/Database {other-db-id :id} {}]
          (t2/insert! :model/Card
                      {:name "Other DB Query"
                       :dataset_query {:database other-db-id
                                       :type :native
                                       :native {:query "SELECT test FROM table"}}
                       :display :table
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
                       :creator_id (mt/user->id :crowberto)
                       :archived false}))

        (let [result (sql-search/sql-search {:query "common" :limit 10})]
          (is (<= (:total_count result) 10)))))))

(deftest integration-create-edit-search-test
  (mt/test-drivers #{:h2}
    (mt/with-temp [:model/Database {db-id :id} {}]
      (testing "full workflow: create, edit, search"
        ;; 1. Create a query
        (let [create-result (create-sql-query/create-sql-query
                             {:database-id db-id
                              :sql "SELECT * FROM products WHERE category = 'electronics'"
                              :name "Electronics Products"})
              query-id (:query-id create-result)]

          ;; 2. Edit the query
          (let [edit-result (edit-sql-query/edit-sql-query
                             {:query-id query-id
                              :edit {:type :replace
                                     :old "electronics"
                                     :new "furniture"}})]
            (is (clojure.string/includes? (:query-content edit-result) "furniture")))

          ;; 3. Search for the query
          (let [search-result (sql-search/sql-search {:query "furniture"})]
            (is (some #(= query-id (:id %)) (:data search-result)))))))))
