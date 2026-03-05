(ns metabase-enterprise.metabot-v3.tools.sql-tools-test
  "Comprehensive tests for SQL query manipulation tools."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-sql-query :as create-sql-query]
   [metabase-enterprise.metabot-v3.tools.edit-sql-query :as edit-sql-query]
   [metabase-enterprise.metabot-v3.tools.replace-sql-query :as replace-sql-query]
   [metabase-enterprise.metabot-v3.tools.sql.validation :as validation]
   [metabase.test :as mt]))

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

                {result :action-result}
                (edit-sql-query/edit-sql-query
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

                {result :action-result}
                (replace-sql-query/replace-sql-query
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

                {result :action-result}
                (replace-sql-query/replace-sql-query
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

;;; -------------------------------------------- validate-sql -----------------------------------------------

(deftest ^:parallel validate-sql-nil-dialect-test
  (testing "nil dialect is skipped"
    (let [result (validation/validate-sql nil "SELECT 1")]
      (is (:valid? result))
      (is (nil? (:dialect result)))
      (is (= "SELECT 1" (:transpiled-sql result))))))

(deftest ^:parallel validate-sql-blank-sql-test
  (testing "blank SQL is skipped"
    (let [result (validation/validate-sql "postgres" "")]
      (is (:valid? result))
      (is (= "" (:transpiled-sql result)))))
  (testing "whitespace-only SQL is skipped"
    (let [result (validation/validate-sql "postgres" "   \n\t  ")]
      (is (:valid? result)))))

(deftest ^:parallel validate-sql-unknown-dialect-test
  (testing "unknown dialect not in mapping is skipped"
    (let [result (validation/validate-sql "unknown_database" "SELECT 1")]
      (is (:valid? result))
      (is (nil? (:dialect result)))
      (is (= "SELECT 1" (:transpiled-sql result))))))

(deftest ^:parallel validate-sql-nil-mapped-dialect-test
  (testing "h2 maps to nil and is skipped without Python roundtrip"
    (let [result (validation/validate-sql "h2" "SELECT 1")]
      (is (:valid? result))
      (is (nil? (:dialect result)))
      (is (= "SELECT 1" (:transpiled-sql result)))))
  (testing "vertica maps to nil and is skipped"
    (let [result (validation/validate-sql "vertica" "SELECT 1")]
      (is (:valid? result))
      (is (nil? (:dialect result))))))

(deftest ^:parallel validate-sql-template-tags-test
  (testing "SQL with template variables is skipped"
    (let [result (validation/validate-sql "postgres" "SELECT * FROM {{#42}} WHERE id = {{user_id}}")]
      (is (:valid? result))
      (is (= "postgres" (:dialect result)))))
  (testing "SQL with optional clauses is skipped"
    (let [result (validation/validate-sql "mysql" "SELECT * FROM users [[WHERE active = true]]")]
      (is (:valid? result))
      (is (= "mysql" (:dialect result)))))
  (testing "SQL with snippet references is skipped"
    (let [result (validation/validate-sql "snowflake" "SELECT * FROM {{snippet: common_joins}}")]
      (is (:valid? result)))))

(deftest ^:parallel validate-sql-returns-mapped-dialect-test
  (testing "returns the mapped sqlglot dialect, not the raw driver name"
    (is (= "bigquery" (:dialect (validation/validate-sql "bigquery-cloud-sdk" ""))))
    (is (= "postgres" (:dialect (validation/validate-sql "postgresql" ""))))
    (is (= "mysql" (:dialect (validation/validate-sql "mariadb" ""))))
    (is (= "trino" (:dialect (validation/validate-sql "athena" ""))))))

(deftest validate-sql-valid-postgres-test
  (mt/test-drivers #{:postgres}
    (testing "valid PostgreSQL SQL passes validation and returns transpiled SQL"
      (let [result (validation/validate-sql "postgres" "SELECT id, name FROM users WHERE id > 1")]
        (is (:valid? result))
        (is (= "postgres" (:dialect result)))
        (is (some? (:transpiled-sql result)))
        (is (str/includes? (:transpiled-sql result) "SELECT"))))))

(deftest validate-sql-invalid-syntax-test
  (mt/test-drivers #{:postgres}
    (testing "SQL with syntax errors fails validation"
      (let [result (validation/validate-sql "postgres" "SELECT =")]
        (is (not (:valid? result)))
        (is (some? (:error-message result)))
        (is (nil? (:transpiled-sql result)))))))

(deftest create-sql-query-with-validation-test
  (mt/test-drivers #{:postgres}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {:engine :postgres}]
        (testing "valid SQL passes through transpilation"
          (let [{:keys [validation-result action-result]}
                (create-sql-query/create-sql-query
                 {:database-id db-id
                  :sql "SELECT id FROM users"})]
            (is (:valid? validation-result))
            (is (= "postgres" (:dialect validation-result)))
            (is (some? (:query-content action-result)))))
        (testing "invalid SQL fails validation"
          (let [{:keys [validation-result action-result]}
                (create-sql-query/create-sql-query
                 {:database-id db-id
                  :sql "SELECT ="})]
            (is (not (:valid? validation-result)))
            (is (some? (:error-message validation-result)))
            (is (nil? action-result))))))))
