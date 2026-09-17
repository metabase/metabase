(ns metabase.metabot.tools.run-query-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.run-query :as run-query]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- run
  [args & {:keys [user scopes queries] :or {user :crowberto scopes api-scope/unrestricted}}]
  (mt/with-current-user (mt/user->id user)
    (binding [scope/*current-user-scope* scopes
              shared/*memory-atom*       (atom {:state {:queries (or queries {})}})]
      (run-query/run-query-tool args))))

(deftest query-id-path-test
  (let [query {:database (mt/id)
               :type     :query
               :query    {:source-table (mt/id :products)
                          :aggregation  [[:count]]
                          :breakout     [[:field (mt/id :products :category) nil]]}}
        result (run {:query_id "q1"} :queries {"q1" query})]
    (is (str/includes? (:output result) "<query_execution status=\"completed\" returned=\"4\" truncated=\"false\" limit=\"100\""))
    (is (str/includes? (:output result) "visible only to you"))
    (testing "the same id and query go back into state, with the execution summary"
      (is (= {:query-id "q1" :query query :result-type :query
              :execution {:status "completed" :returned 4 :truncated false}}
             (:structured-output result))))
    (testing "nothing is emitted for the user"
      (is (nil? (:data-parts result)))))
  (testing "an unknown id names the ones that exist"
    (let [result (run {:query_id "nope"} :queries {"q1" {} "q2" {}})]
      (is (= "Unknown query_id nope. Available: q1, q2" (:output result)))
      (is (not (contains? result :structured-output))))))

(deftest sql-path-test
  (testing "raw SQL runs through the SQL tool's validation and honours row_limit"
    (let [result (run {:database_id (mt/id)
                       :sql         "SELECT CATEGORY, COUNT(*) AS N FROM PRODUCTS GROUP BY CATEGORY ORDER BY N DESC"
                       :row_limit   2})]
      (is (str/includes? (:output result) "returned=\"2\" truncated=\"true\" limit=\"2\""))
      (is (string? (get-in result [:structured-output :query-id])))
      (is (= {:status "completed" :returned 2 :truncated true} (get-in result [:structured-output :execution])))))
  (testing "a failed query returns the error and no structured output"
    (let [result (run {:database_id (mt/id) :sql "SELECT * FROM no_such_table"})]
      (is (str/includes? (:output result) "<query_execution status=\"failed\">"))
      (is (not (contains? result :structured-output)))))
  (testing "SQL is refused without the agent:sql:run scope"
    (let [result (run {:database_id (mt/id) :sql "SELECT 1"} :scopes #{"agent:query:*"})]
      (is (= "You do not have permission to run SQL queries." (:output result)))
      (is (true? (:terminal-error? result)))))
  (testing "SQL is refused for a user without native permissions on the database"
    (mt/with-no-data-perms-for-all-users!
      (let [result (run {:database_id (mt/id) :sql "SELECT 1"} :user :rasta)]
        (is (not (contains? result :structured-output)))
        (is (true? (:terminal-error? result)))))))

(deftest mbql-path-test
  (let [db-name (t2/select-one-fn :name :model/Database :id (mt/id))
        result  (run {:query {:lib/type "mbql/query"
                              :stages   [{:lib/type     "mbql.stage/mbql"
                                          :source-table [db-name "PUBLIC" "PRODUCTS"]
                                          :aggregation  [["count" {}]]}]}})]
    (is (str/includes? (:output result) "returned=\"1\" truncated=\"false\""))
    (is (str/includes? (:output result) "| 200 |"))
    (is (string? (get-in result [:structured-output :query-id])))
    (is (map? (get-in result [:structured-output :query]))))
  (testing "a query the pipeline rejects comes back as agent guidance"
    (let [result (run {:query {:lib/type "mbql/query"
                               :stages   [{:lib/type     "mbql.stage/mbql"
                                           :source-table ["No Such DB" "PUBLIC" "PRODUCTS"]
                                           :aggregation  [["count" {}]]}]}})]
      (is (str/includes? (:output result) "Unknown database: `No Such DB`"))
      (is (not (contains? result :structured-output))))))

(deftest input-shape-test
  (let [ambiguous "Pass exactly one of: query_id (a query from this conversation), query (an MBQL query object), or database_id together with sql."]
    (is (= ambiguous (:output (run {}))))
    (is (= ambiguous (:output (run {:query_id "q" :sql "SELECT 1" :database_id (mt/id)}))))
    (is (= ambiguous (:output (run {:sql "SELECT 1"}))))))
