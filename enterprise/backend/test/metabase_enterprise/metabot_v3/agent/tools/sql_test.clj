(ns metabase-enterprise.metabot-v3.agent.tools.sql-test
  "Tests that agent-level SQL tools produce correctly formatted :output strings
   with preambles, query IDs in links, and operation-specific instructions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.agent.tools.sql :as agent-sql]
   [metabase.test :as mt]))

(deftest create-sql-query-output-test
  (testing "create_sql_query output includes preamble, query XML, and query-ID-aware instructions"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db-id :id} {}]
          (let [result (agent-sql/create-sql-query-tool
                        {:database_id db-id
                         :sql_query   "SELECT 1"})
                output   (:output result)
                query-id (get-in result [:structured-output :query-id])]
            (is (string? output))
            (is (some? query-id))
            (testing "includes preamble"
              (is (str/includes? output "SQL query successfully constructed"))
              (is (str/includes? output (str "New query ID: " query-id))))
            (testing "includes query XML with correct type and database_id"
              (is (str/includes? output "<query "))
              (is (str/includes? output "type=\"sql\""))
              (is (str/includes? output (str "database_id=\"" db-id "\""))))
            (testing "instructions contain actual query ID link"
              (is (str/includes? output (str "metabase://query/" query-id))))))))))

(deftest edit-sql-query-output-test
  (testing "edit_sql_query output includes edit-specific instructions with query ID"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db-id :id} {}]
          (let [query-id "test-edit-q"
                memory   (atom {:state {:queries {query-id {:database db-id
                                                            :type     :native
                                                            :native   {:query "SELECT * FROM t"}}}}})
                result   (binding [shared/*memory-atom* memory]
                           (agent-sql/edit-sql-query-tool
                            {:query_id  query-id
                             :checklist "- [x] checked"
                             :edits     [{:old_string "SELECT *"
                                          :new_string "SELECT id"}]}))
                output   (:output result)]
            (is (string? output))
            (testing "includes query XML with edited content and correct attributes"
              (is (str/includes? output "SELECT id"))
              (is (str/includes? output "type=\"sql\""))
              (is (str/includes? output (str "database_id=\"" db-id "\""))))
            (testing "instructions reference the query ID"
              (is (str/includes? output (str "metabase://query/" query-id))))
            (testing "instructions mention error-analysis flow"
              (is (str/includes? output "If the returned SQL query is NOT correct"))
              (is (str/includes? output "Make further refinements using this tool again")))))))))

(deftest replace-sql-query-output-test
  (testing "replace_sql_query output includes replace-specific instructions with query ID"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db-id :id} {}]
          (let [query-id "test-replace-q"
                memory   (atom {:state {:queries {query-id {:database db-id
                                                            :type     :native
                                                            :native   {:query "SELECT 1"}}}}})
                result   (binding [shared/*memory-atom* memory]
                           (agent-sql/replace-sql-query-tool
                            {:query_id  query-id
                             :checklist "- [x] checked"
                             :new_query "SELECT 2"}))
                output   (:output result)]
            (is (string? output))
            (testing "includes query XML with replaced content and correct attributes"
              (is (str/includes? output "SELECT 2"))
              (is (str/includes? output "type=\"sql\""))
              (is (str/includes? output (str "database_id=\"" db-id "\""))))
            (testing "instructions reference the query ID"
              (is (str/includes? output (str "metabase://query/" query-id))))
            (testing "instructions mention edit_sql_query as alternative"
              (is (str/includes? output "this tool or edit_sql_query again")))))))))
