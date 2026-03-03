(ns metabase-enterprise.metabot-v3.tools.create-sql-query-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-sql-query :as create-sql-query]
   [metabase.driver :as driver]
   [metabase.test :as mt]))

(deftest create-sql-query-test
  (mt/test-drivers #{:postgres :h2}
    (mt/with-temp [:model/Database {db-id :id} {}]
      (testing "creates a basic SQL query"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [sql "SELECT 1 as test"
                result (create-sql-query/create-sql-query
                        {:database-id db-id
                         :sql sql
                         :name "Test Query"})]
            (is (contains? result :query-id))
            (is (= sql (:query-content result)))
            (is (= db-id (:database result)))
            (is (= {:database db-id
                    :type :native
                    :native {:query sql}}
                   (:query result)))))))))

(deftest create-sql-query-validation-failure-test
  (mt/test-drivers #{:postgres}
    (mt/with-temp [:model/Database {db-id :id} {:engine driver/*driver*}]
      (testing "attempts to create query with wrong syntax"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [sql "select 123abc ="

                {:keys [valid? dialect error-message]}
                (create-sql-query/create-sql-query
                 {:database-id db-id
                  :sql sql
                  :name "Test Query"})]
            (is (= "postgres" dialect))
            (is (false? valid?))
            (is (str/starts-with? error-message "Invalid expression / Unexpected token."))))))))
