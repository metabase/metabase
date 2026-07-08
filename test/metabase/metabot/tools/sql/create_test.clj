(ns metabase.metabot.tools.sql.create-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.metabot.tools.sql.create :as create-sql-query]
   [metabase.test :as mt]))

(deftest create-sql-query-test
  (mt/test-drivers #{:postgres :h2}
    (mt/with-temp [:model/Database {db-id :id} {:engine driver/*driver*}]
      (testing "creates a basic SQL query"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [sql "SELECT 1 as test"

                {result :action-result}
                (create-sql-query/create-sql-query
                 {:database-id db-id
                  :sql sql
                  :name "Test Query"})]
            (is (contains? result :query-id))
            (is (re-find #"(?si)SELECT\s+1\s+AS\s+\"?test\"?" (:query-content result)))
            (is (= db-id (:database result)))
            (is (=? {:database db-id
                     :type :native
                     :native {:query #(re-find #"(?si)SELECT\s+1\s+AS\s+\"?test\"?" %)}}
                    (:query result)))))))))

(deftest create-sql-query-validation-error-test
  (mt/test-drivers #{:postgres}
    (mt/with-temp [:model/Database {db-id :id} {:engine driver/*driver*}]
      (testing "attempts to create query with wrong syntax"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [sql "select 123abc ="

                {{:keys [valid? dialect error-message]} :validation-result}
                (create-sql-query/create-sql-query
                 {:database-id db-id
                  :sql sql
                  :name "Test Query"})]
            (is (= (name driver/*driver*) dialect))
            (is (false? valid?))
            (is (str/starts-with? error-message "Invalid expression / Unexpected token."))))))))
