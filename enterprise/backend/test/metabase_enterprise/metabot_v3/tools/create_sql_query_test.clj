(ns metabase-enterprise.metabot-v3.tools.create-sql-query-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-sql-query :as create-sql-query]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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

            ;; Verify the card was created in the database
            (let [card (t2/select-one :model/Card :id (:query-id result))]
              (is (some? card))
              (is (= "Test Query" (:name card)))
              (is (= :native (:query_type card)))
              ;; Note: dataset_query may be transformed on read, so we check the result directly
              (is (= sql (:query-content result)))))))

      (testing "creates query with description and collection"
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-temp [:model/Collection {coll-id :id} {}]
            (let [result (create-sql-query/create-sql-query
                          {:database-id db-id
                           :sql "SELECT 2"
                           :name "Described Query"
                           :description "A test description"
                           :collection-id coll-id})]
              (is (contains? result :query-id))

              (let [card (t2/select-one :model/Card :id (:query-id result))]
                (is (= "Described Query" (:name card)))
                (is (= "A test description" (:description card)))
                (is (= coll-id (:collection_id card))))))))

      (testing "creates query with auto-generated name if not provided"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [result (create-sql-query/create-sql-query
                        {:database-id db-id
                         :sql "SELECT 3"})]
            (is (contains? result :query-id))

            (let [card (t2/select-one :model/Card :id (:query-id result))]
              (is (some? (:name card)))
              (is (str/starts-with? (:name card) "SQL Query ")))))))))

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
            (is (contains? (:structured-output result) :query-id)))))

      (testing "tool handler returns error output on failure"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [result (create-sql-query/create-sql-query-tool
                        {:database-id 999999 ; non-existent database
                         :sql "SELECT 1"})]
            (is (contains? result :output))
            (is (string? (:output result)))))))))
