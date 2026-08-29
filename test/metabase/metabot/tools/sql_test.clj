(ns metabase.metabot.tools.sql-test
  "Tests that agent-level SQL tools produce correctly formatted :output strings
   with preambles, query IDs in links, and operation-specific instructions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.sql :as agent-sql]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(deftest create-sql-query-output-test
  (testing "create_sql_query output includes preamble, query XML, and query-ID-aware instructions"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
          (let [result (agent-sql/create-sql-query-tool
                        {:database_id db-id
                         :sql_query   "SELECT 1"
                         :title       "Results"})
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

(deftest create-sql-query-validation-error-output-test
  (testing "create_sql_query output contains appropriate info on validation failure"
    (mt/test-drivers #{:postgres}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db-id :id} {:engine :postgres}]
          (let [result (agent-sql/create-sql-query-tool
                        {:database_id db-id
                         :sql_query   "SELECT ="
                         :title       "Results"})
                output   (:output result)]
            (is (string? output))
            (is (str/starts-with? (:instructions result) "The SQL query has a syntax error"))
            (is (str/starts-with? (:output result) "<result>\nSQL query construction failed.\n</result>\n<instructions>\nThe SQL query has a syntax error"))))))))

(defn- create-sql-query-in-code-editor
  [args]
  (binding [shared/*memory-atom* (atom {:context {:user_is_viewing [{:type    "code_editor"
                                                                     :buffers [{:id "buf-1"}]}]}})]
    (agent-sql/create-sql-query-code-edit-tool (merge {:sql_query "SELECT 1"
                                                       :title     "Results"}
                                                      args))))

(deftest create-sql-query-code-edit-agent-error-output-test
  (testing "create_sql_query in the code editor returns agent errors as output instead of throwing"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [{:keys [output]} (create-sql-query-in-code-editor {:database_id Integer/MAX_VALUE})]
        (is (str/includes? output "not found"))))))

(deftest create-sql-query-code-edit-permission-error-output-test
  (testing "create_sql_query in the code editor returns a permission failure as terminal output with its status code"
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [output status-code terminal-error?]} (create-sql-query-in-code-editor {:database_id db-id})]
            (is (= 403 status-code))
            (is (= "You do not have access to this database." output))
            (is (true? terminal-error?))))))))

(deftest create-sql-query-code-edit-unexpected-error-test
  (testing "create_sql_query in the code editor rethrows non-agent errors so they stay tracked as failures"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
                                  (fn [& _] (throw (ex-info "boom" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"boom"
             (create-sql-query-in-code-editor {:database_id 1})))))))

(deftest edit-sql-query-output-test
  (testing "edit_sql_query output includes edit-specific instructions with query ID"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db-id :id :as db} {:engine :h2}]
          (mt/with-db db
            (let [mp (mt/metadata-provider)
                  query-id "test-edit-q"
                  memory   (atom {:state {:queries {query-id (-> (lib/native-query mp "SELECT * FROM t")
                                                                 lib/->legacy-MBQL)}}})
                  result   (binding [shared/*memory-atom* memory]
                             (agent-sql/edit-sql-query-tool
                              {:query_id  query-id
                               :checklist "- [x] checked"
                               :edits     [{:old_string "SELECT *"
                                            :new_string "SELECT id"}]
                               :title     "Results"}))
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
                (is (str/includes? output "Make further refinements using this tool again"))))))))))

(deftest edit-sql-query-validation-error-output-test
  (testing "edit_sql_query output contains appropriate info on validation failure"
    (mt/test-drivers #{:postgres}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database db {:engine :postgres}]
          (mt/with-db db
            (let [mp (mt/metadata-provider)
                  query-id "test-edit-q-validation-failure"
                  memory   (atom {:state {:queries {query-id (-> (lib/native-query mp "SELECT * FROM t")
                                                                 lib/->legacy-MBQL)}}})
                  result   (binding [shared/*memory-atom* memory]
                             (agent-sql/edit-sql-query-tool
                              {:query_id  query-id
                               :checklist "- [x] checked"
                               :edits     [{:old_string "SELECT *"
                                            :new_string "SELECT ="}]
                               :title     "Results"}))
                  output   (:output result)]
              (is (string? output))
              (is (str/starts-with? (:instructions result) "The SQL query has a syntax error"))
              (is (str/starts-with? (:output result) "<result>\nSQL query construction failed.\n</result>\n<instructions>\nThe SQL query has a syntax error")))))))))

(deftest replace-sql-query-output-test
  (testing "replace_sql_query output includes replace-specific instructions with query ID"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db-id :id :as db} {:engine :h2}]
          (mt/with-db db
            (let [mp (mt/metadata-provider)
                  query-id "test-replace-q"
                  memory   (atom {:state {:queries {query-id (-> (lib/native-query mp "SELECT 1")
                                                                 lib/->legacy-MBQL)}}})
                  result   (binding [shared/*memory-atom* memory]
                             (agent-sql/replace-sql-query-tool
                              {:query_id  query-id
                               :checklist "- [x] checked"
                               :new_query "SELECT 2"
                               :title     "Results"}))
                  output   (:output result)]
              (is (string? output))
              (testing "includes query XML with replaced content and correct attributes"
                (is (str/includes? output "SELECT 2"))
                (is (str/includes? output "type=\"sql\""))
                (is (str/includes? output (str "database_id=\"" db-id "\""))))
              (testing "instructions reference the query ID"
                (is (str/includes? output (str "metabase://query/" query-id))))
              (testing "instructions mention edit_sql_query as alternative"
                (is (str/includes? output "this tool or edit_sql_query again"))))))))))

(deftest replace-sql-query-validtion-error-output-test
  (testing "replace_sql_query output contains appropriate info on validation failure"
    (mt/test-drivers #{:postgres}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database db {:engine :postgres}]
          (mt/with-db db
            (let [mp (mt/metadata-provider)
                  query-id "test-replace-q"
                  memory   (atom {:state {:queries {query-id (-> (lib/native-query mp "SELECT 1")
                                                                 lib/->legacy-MBQL)}}})

                  {:keys [output instructions]} (binding [shared/*memory-atom* memory]
                                                  (agent-sql/replace-sql-query-tool
                                                   {:query_id  query-id
                                                    :checklist "- [x] checked"
                                                    :new_query "SELECT ="
                                                    :title     "Results"}))]
              (is (string? output))
              (is (str/starts-with? instructions "The SQL query has a syntax error"))
              (is (str/starts-with? output "<result>\nSQL query construction failed.\n</result>\n<instructions>\nThe SQL query has a syntax error")))))))))

(deftest edit-sql-query-viz-part-test
  (testing "edit_sql_query emits a generated_entity card unless an open code-editor buffer wins"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {:as db} {:engine :h2}]
          (mt/with-db db
            (let [mp       (mt/metadata-provider)
                  query-id "test-inline-q"
                  query    (-> (lib/native-query mp "SELECT * FROM t") lib/->legacy-MBQL)
                  run      (fn [context]
                             (let [memory (atom {:state   {:queries {query-id query}}
                                                 :context context})]
                               (binding [shared/*memory-atom* memory]
                                 (agent-sql/edit-sql-query-tool
                                  {:query_id  query-id
                                   :checklist "- [x] checked"
                                   :edits     [{:old_string "SELECT *" :new_string "SELECT id"}]
                                   :title     "Results"}))))]
              (testing "no code-editor buffer -> a single generated_entity (native) part"
                (let [parts  (:data-parts (run {}))
                      entity (:data (first parts))]
                  (is (= 1 (count parts)))
                  (is (= "generated_entity" (:data-type (first parts))))
                  (is (= "card" (:type entity)))
                  (is (= :native (get-in entity [:query :query :type])))))
              (testing "an open code-editor buffer wins"
                (let [parts (:data-parts (run {:user_is_viewing [{:type    "code_editor"
                                                                  :buffers [{:id "buf-1"}]}]}))]
                  (is (= 1 (count parts)))
                  (is (= "code_edit" (:data-type (first parts)))))))))))))

(def ^:private no-native-permission-output
  "You do not have permission to write SQL queries against this database. Native query permissions are required.")

(deftest create-sql-query-refuses-database-without-native-permission-test
  (testing "create_sql_query is allowed per database, not per instance"
    (mt/with-temp [:model/Database {native-db :id} {:engine :h2}
                   :model/Database {builder-db :id} {:engine :h2}]
      (mt/with-no-data-perms-for-all-users!
        (doseq [db-id [native-db builder-db]]
          (perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted))
        (perms/set-database-permission! (perms-group/all-users) native-db :perms/create-queries :query-builder-and-native)
        (perms/set-database-permission! (perms-group/all-users) builder-db :perms/create-queries :query-builder)
        (mt/with-current-user (mt/user->id :rasta)
          (testing "the database the user has native permission on is queried"
            (is (str/includes? (:output (agent-sql/create-sql-query-tool
                                         {:database_id native-db
                                          :sql_query   "SELECT 1"
                                          :title       "Results"}))
                               "SQL query successfully constructed")))
          (testing "a database the user can browse but not query natively is refused"
            (let [result (agent-sql/create-sql-query-tool {:database_id builder-db
                                                           :sql_query   "SELECT 1"
                                                           :title       "Results"})]
              (is (= no-native-permission-output (:output result)))
              (is (true? (:terminal-error? result))
                  "marked terminal so a forced-tool-call profile stops instead of retrying"))))))))

(deftest create-sql-query-refuses-database-the-user-cannot-read-test
  (testing "the read-check denial is terminal too, so the stricter permission is not the looser stop"
    (mt/with-temp [:model/Database {native-db :id}     {:engine :h2}
                   :model/Database {unreadable-db :id} {:engine :h2}]
      (mt/with-no-data-perms-for-all-users!
        (doseq [db-id [native-db unreadable-db]]
          (perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted))
        (perms/set-database-permission! (perms-group/all-users) native-db :perms/create-queries :query-builder-and-native)
        (perms/set-database-permission! (perms-group/all-users) unreadable-db :perms/create-queries :no)
        (mt/with-current-user (mt/user->id :rasta)
          (let [result (agent-sql/create-sql-query-tool {:database_id unreadable-db
                                                         :sql_query   "SELECT 1"
                                                         :title       "Results"})]
            (is (= "You do not have access to this database." (:output result)))
            (is (true? (:terminal-error? result))))))))
  (testing "a database that does not exist stays retryable -- the model can list databases again"
    (mt/with-current-user (mt/user->id :rasta)
      (let [result (agent-sql/create-sql-query-tool {:database_id Integer/MAX_VALUE
                                                     :sql_query   "SELECT 1"
                                                     :title       "Results"})]
        (is (str/includes? (:output result) "not found"))
        (is (nil? (:terminal-error? result)))))))

(deftest edit-and-replace-sql-query-refuse-database-without-native-permission-test
  (testing "edit_sql_query and replace_sql_query refuse a query whose database the user cannot query natively"
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
        (perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :query-builder)
        (mt/with-current-user (mt/user->id :rasta)
          (let [query-id "seeded-q"
                memory   (atom {:state {:queries {query-id {:database db-id
                                                            :type     :native
                                                            :native   {:query "SELECT 1"}}}}})]
            (binding [shared/*memory-atom* memory]
              (is (= no-native-permission-output
                     (:output (agent-sql/edit-sql-query-tool
                               {:query_id  query-id
                                :checklist "- [x] checked"
                                :edits     [{:old_string "1" :new_string "2"}]
                                :title     "Results"}))))
              (is (= no-native-permission-output
                     (:output (agent-sql/replace-sql-query-tool
                               {:query_id  query-id
                                :checklist "- [x] checked"
                                :new_query "SELECT 2"
                                :title     "Results"})))))))))))
