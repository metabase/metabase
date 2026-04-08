(ns metabase.metabot.tools.sql.tools-test
  "Comprehensive tests for SQL query manipulation tools."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.sql.common :as sql-common]
   [metabase.metabot.tools.sql.create :as create-sql-query]
   [metabase.metabot.tools.sql.edit :as edit-sql-query]
   [metabase.metabot.tools.sql.replace :as replace-sql-query]
   [metabase.test :as mt]))

(deftest edit-sql-query-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id :as db} {:engine :h2}]
        (mt/with-db db
          (testing "single replacement edit"
            (let [mp (mt/metadata-provider)
                  original-sql "SELECT * FROM users WHERE id = 1"
                  query-id "q1"
                  queries-state {query-id (-> (lib/native-query mp original-sql)
                                              lib/->legacy-MBQL)}

                  {result :action-result}
                  (edit-sql-query/edit-sql-query
                   {:query-id query-id
                    :queries-state queries-state
                    :edits [{:old_string "id = 1"
                             :new_string "id = 2"}]})]
              (is (= query-id (:query-id result)))
              (is (= "SELECT * FROM users WHERE id = 2" (:query-content result)))))

          (testing "edit with JSON-parsed MBQL 5 query (string enum values)"
            (let [original-sql "SELECT * FROM users WHERE id = 1"
                  query-id "q-mbql5"
                  ;; Simulates JSON round-tripped MBQL 5: keyword keys, string values
                  queries-state {query-id {:lib/type "mbql/query"
                                           :database db-id
                                           :stages   [{:lib/type "mbql.stage/native"
                                                       :native  original-sql}]}}
                  {result :action-result}
                  (edit-sql-query/edit-sql-query
                   {:query-id query-id
                    :queries-state queries-state
                    :edits [{:old_string "id = 1"
                             :new_string "id = 2"}]})]
              (is (= query-id (:query-id result)))
              (is (= "SELECT * FROM users WHERE id = 2" (:query-content result)))))

          (testing "replace-all edit"
            (let [mp (mt/metadata-provider)
                  original-sql "SELECT id, id FROM users WHERE id = 1"
                  query-id "q3"
                  queries-state {query-id (-> (lib/native-query mp original-sql)
                                              lib/->legacy-MBQL)}

                  {result :action-result}
                  (edit-sql-query/edit-sql-query
                   {:query-id query-id
                    :queries-state queries-state
                    :edits [{:old_string "id"
                             :new_string "user_id"
                             :replace_all true}]})]
              (is (= "SELECT user_id, user_id FROM users WHERE user_id = 1"
                     (:query-content result)))))

          (testing "rejects ambiguous edits"
            (let [mp (mt/metadata-provider)
                  original-sql "SELECT id, id FROM users"
                  query-id "q4"
                  queries-state {query-id (-> (lib/native-query mp original-sql)
                                              lib/->legacy-MBQL)}]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"found multiple times"
                   (edit-sql-query/edit-sql-query
                    {:query-id query-id
                     :queries-state queries-state
                     :edits [{:old_string "id"
                              :new_string "user_id"}]}))))))))))

(deftest replace-sql-query-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id :as db} {:engine :h2}]
        (mt/with-db db
          (testing "replaces SQL content entirely"
            (let [mp (mt/metadata-provider)
                  original-sql "SELECT * FROM users"
                  new-sql "SELECT id, name FROM customers"
                  query-id "q5"
                  queries-state {query-id (-> (lib/native-query mp original-sql)
                                              lib/->legacy-MBQL)}

                  {result :action-result}
                  (replace-sql-query/replace-sql-query
                   {:query-id query-id
                    :queries-state queries-state
                    :sql new-sql})]
              (is (= new-sql (:query-content result)))
              (is (= db-id (:database result)))))

          (testing "replace with JSON-parsed MBQL 5 query (string enum values)"
            (let [original-sql "SELECT * FROM users"
                  new-sql "SELECT id, name FROM customers"
                  query-id "q-mbql5-replace"
                  queries-state {query-id {:lib/type "mbql/query"
                                           :database db-id
                                           :stages   [{:lib/type "mbql.stage/native"
                                                       :native  original-sql}]}}
                  {result :action-result}
                  (replace-sql-query/replace-sql-query
                   {:query-id query-id
                    :queries-state queries-state
                    :sql new-sql})]
              (is (= new-sql (:query-content result)))
              (is (= db-id (:database result)))))

          (testing "replaces SQL and updates name/description"
            (let [mp (mt/metadata-provider)
                  query-id "q6"
                  queries-state {query-id (-> (lib/native-query mp "SELECT 1")
                                              lib/->legacy-MBQL)}

                  {result :action-result}
                  (replace-sql-query/replace-sql-query
                   {:query-id query-id
                    :queries-state queries-state
                    :sql "SELECT 2"
                    :name "New Name"
                    :description "New Description"})]
              (is (= "SELECT 2" (:query-content result)))
              (is (= db-id (:database result))))))))))

(deftest update-query-sql-with-json-mbql5-test
  (mt/test-drivers #{:h2}
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
      (testing "MBQL 5 query with string enum values (as received from frontend JSON)"
        ;; Simulates what cheshire/decode+kw produces: keyword keys but string values
        ;; for enum-like fields such as :lib/type.
        (let [json-mbql5 {:lib/type "mbql/query"
                          :database db-id
                          :stages   [{:lib/type "mbql.stage/native"
                                      :native  "SELECT 1"}]}
              result     (sql-common/update-query-sql json-mbql5 "SELECT 2")]
          (is (lib/native-only-query? result))
          (is (= "SELECT 2" (lib/raw-native-query result)))))
      (testing "already-normalized MBQL 5 query"
        (let [mp         (mt/metadata-provider)
              mbql5      (lib/native-query mp "SELECT 1")
              result     (sql-common/update-query-sql mbql5 "SELECT 2")]
          (is (lib/native-only-query? result))
          (is (= "SELECT 2" (lib/raw-native-query result)))))
      (testing "legacy MBQL query"
        (let [legacy {:type     :native
                      :native   {:query "SELECT 1"}
                      :database db-id}
              result (sql-common/update-query-sql legacy "SELECT 2")]
          (is (lib/native-only-query? result))
          (is (= "SELECT 2" (lib/raw-native-query result))))))))

(deftest integration-create-edit-in-memory-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
        (testing "full workflow: create and edit in memory"
          (let [{create-result :action-result} (create-sql-query/create-sql-query
                                                {:database-id db-id
                                                 :sql "SELECT * FROM products WHERE category = 'electronics'"
                                                 :name "Electronics Products"})

                query-id (:query-id create-result)
                queries-state {query-id (:query create-result)}

                {edit-result :action-result}
                (edit-sql-query/edit-sql-query
                 {:query-id query-id
                  :queries-state queries-state
                  :edits [{:old_string "electronics"
                           :new_string "furniture"}]})]
            (is (str/includes? (:query-content edit-result) "furniture"))))))))
