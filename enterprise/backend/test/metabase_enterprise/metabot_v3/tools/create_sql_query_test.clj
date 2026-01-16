(ns metabase-enterprise.metabot-v3.tools.create-sql-query-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-sql-query :as create-sql-query]
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

(deftest create-sql-query-tool-test
  (mt/test-drivers #{:h2}
    (mt/with-temp [:model/Database {db-id :id} {}]
      (testing "tool handler returns structured output"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [result (create-sql-query/create-sql-query-tool
                        {:database-id db-id
                         :sql "SELECT 1"
                         :name "Tool Test"})]
            (is (contains? result :structured-output))
            (is (contains? (:structured-output result) :query-id))
            (is (contains? result :data-parts)))))

      (testing "tool handler returns error output on failure"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [result (create-sql-query/create-sql-query-tool
                        {:database-id 999999 ; non-existent database
                         :sql "SELECT 1"})]
            (is (contains? result :output))
            (is (string? (:output result)))))))))
