(ns metabase-enterprise.metabot-v3.tools.sql-tools-test
  "Comprehensive tests for SQL query manipulation tools."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-sql-query :as create-sql-query]
   [metabase-enterprise.metabot-v3.tools.edit-sql-query :as edit-sql-query]
   [metabase-enterprise.metabot-v3.tools.replace-sql-query :as replace-sql-query]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest edit-sql-query-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}]
        (testing "single replacement edit"
          (let [original-sql "SELECT * FROM users WHERE id = 1"
                query-id "q1"
                queries-state {query-id {:database db-id
                                         :type :native
                                         :native {:query original-sql}}}
                result (edit-sql-query/edit-sql-query
                        {:query-id query-id
                         :queries-state queries-state
                         :edits [{:old_string "id = 1"
                                  :new_string "id = 2"}]})]
            (is (= query-id (:query-id result)))
            (is (= "SELECT * FROM users WHERE id = 2" (:query-content result)))))

        (testing "replace-all edit"
          (let [original-sql "SELECT id, id FROM users WHERE id = 1"
                query-id "q3"
                queries-state {query-id {:database db-id
                                         :type :native
                                         :native {:query original-sql}}}
                result (edit-sql-query/edit-sql-query
                        {:query-id query-id
                         :queries-state queries-state
                         :edits [{:old_string "id"
                                  :new_string "user_id"
                                  :replace_all true}]})]
            (is (= "SELECT user_id, user_id FROM users WHERE user_id = 1"
                   (:query-content result)))))

        (testing "rejects ambiguous edits"
          (let [original-sql "SELECT id, id FROM users"
                query-id "q4"
                queries-state {query-id {:database db-id
                                         :type :native
                                         :native {:query original-sql}}}]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"found multiple times"
                 (edit-sql-query/edit-sql-query
                  {:query-id query-id
                   :queries-state queries-state
                   :edits [{:old_string "id"
                            :new_string "user_id"}]})))))))))

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
                              :edits [{:old_string "electronics"
                                       :new_string "furniture"}]})]
            (is (str/includes? (:query-content edit-result) "furniture"))))))))
