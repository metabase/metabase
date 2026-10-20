(ns metabase.metabot.tools.sql-test
  "Runtime coverage for SQL creation, editing, replacement, and model-facing recovery."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as tools]
   [metabase.metabot.tools.recoverable.common :as recoverable]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.sql :as sql]
   [metabase.metabot.tools.sql.common :as sql.common]
   [metabase.metabot.tools.sql.create :as sql.create]
   [metabase.metabot.tools.sql.edit :as sql.edit]
   [metabase.metabot.tools.sql.replace :as sql.replace]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]))

(defn- invoke-sql-tool
  [profile memory tool-name args]
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (let [entries (tools/->entries [#'tools/edit-sql-query-tool #'tools/replace-sql-query-tool
                                   (if (= profile :sql)
                                     #'tools/create-sql-query-code-edit-tool
                                     #'tools/create-sql-query-tool)
                                   #'tools/read-resource-tool]
                                  (atom memory) nil profile)]
      ((get-in entries [tool-name :fn])
       (merge {:title "Birds"}
              (case tool-name
                "create_sql_query" (merge {:sql_query "SELECT 1"} args)
                (merge {:query_id "q1" :checklist "Checked"}
                       (select-keys args (if (= tool-name "edit_sql_query")
                                           [:query_id :edits :title :checklist]
                                           [:query_id :new_query :title :checklist])))))))))

(deftest create-sql-query-output-test
  (testing "create_sql_query output includes preamble, query XML, and query-ID-aware instructions"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
          (let [result (invoke-sql-tool :internal (some-> shared/*memory-atom* deref) "create_sql_query"
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

(deftest create-sql-query-says-whether-its-results-can-be-read-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
        (mt/with-temp [:model/MetabotConversation {own :id}    {:user_id (mt/user->id :crowberto)}
                       :model/MetabotConversation {theirs :id} {:user_id (mt/user->id :rasta)}]
          (doseq [:let [both #{"create_sql_query" "run_query"}]
                  [situation tool-names query-on? sql-on? conversation readable?]
                  [["run_query offered and SQL execution on"    both                  true  true  own    true]
                   ["run_query offered and SQL execution off"   both                  true  false own    false]
                   ["run_query offered and query execution off" both                  false true  own    false]
                   ["no run_query in the session"               #{"create_sql_query"} true  true  own    false]
                   ["a conversation someone else can read"      both                  true  true  theirs false]]]
            (testing situation
              (mt/with-temporary-setting-values [metabot-query-execution-enabled? query-on?
                                                 metabot-sql-execution-enabled?   sql-on?]
                (binding [shared/*memory-atom*                     (atom {:tool-names      tool-names
                                                                          :conversation-id conversation
                                                                          :state           {}})
                          scope/*current-user-metabot-permissions* scope/all-yes-permissions
                          scope/*current-user-scope*               (scope/user-metabot-perms->scopes
                                                                    scope/all-yes-permissions)]
                  (let [instructions (:output (invoke-sql-tool :internal (some-> shared/*memory-atom* deref) "create_sql_query" {:database_id db-id
                                                                                              :sql_query   "SELECT 1"
                                                                                              :title       "Results"}))]
                    (is (= [readable? (not readable?)]
                           [(str/includes? instructions "Run the query with `run_query`")
                            (str/includes? instructions "you cannot view the results directly yourself")]))))))))))))

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
                             (invoke-sql-tool :internal (some-> shared/*memory-atom* deref) "edit_sql_query"
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
                             (invoke-sql-tool :internal (some-> shared/*memory-atom* deref) "replace_sql_query"
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
                                 (invoke-sql-tool :internal (some-> shared/*memory-atom* deref) "edit_sql_query"
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
                                                                  :buffers [{:id "buf-1" :source {:language "sql" :database_id nil} :cursor {:line 0 :column 0}}]}]}))]
                  (is (= 1 (count parts)))
                  (is (= "code_edit" (:data-type (first parts)))))))))))))

(deftest edit-and-replace-sql-query-unexpected-error-test
  (mt/with-dynamic-fn-redefs [sql.edit/edit-sql-query (fn [_] (throw (ex-info "boom" {})))
                              sql.replace/replace-sql-query (fn [_] (throw (ex-info "boom" {})))]
    (doseq [tool-name ["edit_sql_query" "replace_sql_query"]]
      (let [result (invoke-sql-tool :internal {} tool-name
                                    (merge {:query_id "q1" :checklist "Checked" :title "Results"}
                                           (if (= tool-name "edit_sql_query")
                                             {:edits [{:old_string "1" :new_string "2"}]}
                                             {:new_query "SELECT 2"})))]
        (is (= {:class :unrecoverable :code :internal} (:error result)))
        (is (not (str/includes? (:output result) "boom")))))))

(deftest unknown-query-id-test
  (doseq [tool-name ["edit_sql_query" "replace_sql_query"]
          available? [false true]]
    (testing (str tool-name " / available queries: " available?)
      (let [queries (if available? {"q2" (lib/native-query (mt/metadata-provider) "SELECT 2")
                                      "q1" (lib/native-query (mt/metadata-provider) "SELECT 1")} {})
            result (invoke-sql-tool :sql {:state {:queries queries}} tool-name
                                    {:query_id "missing" :edits [] :new_query "SELECT 3"})]
        (is (= {:class :recoverable :code ::recoverable/unknown-query-id} (:error result)))
        (is (str/includes? (:output result) "Available query IDs:"))
        (is (str/includes? (:output result) (if available? "\"q1\", \"q2\"" "none")))))))

(deftest non-sql-query-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [tool-name ["edit_sql_query" "replace_sql_query"]]
      (let [query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))
            result (invoke-sql-tool :sql {:state {:queries {"q1" query}}} tool-name {:edits [] :new_query "SELECT 1"})]
        (is (= {:class :recoverable :code ::sql.common/not-sql} (:error result)))
        (is (str/includes? (:output result) "is not a SQL query"))))))

(deftest sql-edit-mismatch-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [[code old-string edits sql-before-edit]
            [[::sql.edit/edit-not-found "missing" [{:old_string "missing" :new_string "2"}] nil]
             [::sql.edit/edit-ambiguous "id" [{:old_string "id" :new_string "bird_id"}] nil]
             [::sql.edit/edit-not-found "missing" [{:old_string "birds" :new_string "owls"}
                                                   {:old_string "missing" :new_string "2"}]
              "SELECT id, id FROM owls"]]]
      (let [sql "SELECT id, id FROM birds"
            query (lib/native-query (mt/metadata-provider) sql)
            result (invoke-sql-tool :sql {:state {:queries {"q1" query}}} "edit_sql_query" {:edits edits})]
        (is (= {:class :recoverable :code code} (:error result)))
        (is (str/includes? (:output result) (str "Edit " (count edits))))
        (is (str/includes? (:output result) (str "\"" old-string "\"")))
        (is (str/includes? (:output result) (str "Current SQL: \"" sql "\"")))
        (is (str/includes? (:output result) "No edits were saved"))
        (when sql-before-edit
          (is (str/includes? (:output result) sql-before-edit)))))))

(deftest sql-syntax-error-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database db {:engine :postgres}]
      (mt/with-db db
        (doseq [tool-name ["edit_sql_query" "replace_sql_query"]]
          (let [query (lib/native-query (mt/metadata-provider) "SELECT 1")
                result (invoke-sql-tool :sql {:state {:queries {"q1" query}}} tool-name
                                        {:edits [{:old_string "1" :new_string "="}]
                                         :new_query "SELECT ="})]
            (is (= {:class :recoverable :code ::sql.common/sql-syntax-error} (:error result)))
            (is (str/includes? (:output result) "syntax error"))
            (is (str/includes? (:output result) "Fix the SQL syntax and retry"))))))))

(deftest parser-error-is-quoted-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database db {:engine :postgres}]
      (mt/with-db db
        (mt/with-dynamic-fn-redefs [sql-tools/transpile-sql
                                    (constantly {:status :error
                                                 :error-message "Invalid expression\nSELECT \u001b[4m=\u001b[0m"})]
          (let [query (lib/native-query (mt/metadata-provider) "SELECT 1")
                result (invoke-sql-tool :sql {:state {:queries {"q1" query}}} "replace_sql_query" {:new_query "SELECT ="})]
            (is (= :recoverable (get-in result [:error :class])))
            (is (str/includes? (:output result)
                               "Parser details: \"Invalid expression\\nSELECT \\u001b[4m=\\u001b[0m\""))))))))

(deftest sql-edit-context-is-quoted-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [sql "SELECT 'owl'\n-- \u001b[4mnotes"
          query (lib/native-query (mt/metadata-provider) sql)
          result (invoke-sql-tool :sql {:state {:queries {"q1" query}}} "edit_sql_query"
                                  {:edits [{:old_string "missing\n\u001b[4m" :new_string "2"}]})]
      (is (= ::sql.edit/edit-not-found (get-in result [:error :code])))
      (is (str/includes? (:output result) "\"missing\\n\\u001b[4m\""))
      (is (str/includes? (:output result) "Current SQL: \"SELECT 'owl'\\n-- \\u001b[4mnotes\"")))))

(deftest sql-edit-permission-error-test
  (mt/with-temp [:model/Database {db-id :id :as db} {:engine :h2}]
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
      (perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :query-builder)
      (mt/with-current-user (mt/user->id :rasta)
        (mt/with-db db
          (let [query (lib/native-query (mt/metadata-provider) "SELECT 1")]
            (doseq [tool-name ["edit_sql_query" "replace_sql_query"]]
              (let [result (invoke-sql-tool :sql {:state {:queries {"q1" query}}} tool-name
                                            {:edits [{:old_string "1" :new_string "2"}]
                                             :new_query "SELECT 2"})]
                (is (= {:class :unrecoverable
                        :code ::sql.common/no-native-permission
                        :user-message "You do not have permission to write SQL queries against this database. Native query permissions are required."}
                       (:error result)))
                (is (str/includes? (:output result) "Don't retry"))))))))))

(deftest missing-sql-editor-test
  (doseq [memory [nil {} {:context {:user_is_viewing [{:type "code_editor" :buffers []}]}}]]
    (let [result (invoke-sql-tool :sql memory "create_sql_query" {:database_id Integer/MAX_VALUE})]
      (is (= {:class :unrecoverable
              :code ::sql/missing-editor
              :user-message "No active SQL editor was found. Open a SQL editor and try again."}
             (:error result)))
      (is (str/includes? (:output result) "Don't retry")))))

(def ^:private editor-memory
  {:context {:user_is_viewing [{:type "code_editor"
                                :buffers [{:id "sql-buffer"
                                           :source {:language "sql" :database_id nil}
                                           :cursor {:line 0 :column 0}}]}]}})

(deftest unknown-database-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [editor? [false true]]
      (let [result (invoke-sql-tool (if editor? :sql :internal) editor-memory "create_sql_query" {:database_id Integer/MAX_VALUE})]
        (is (= {:class :recoverable :code ::recoverable/unknown-database} (:error result)))
        (is (str/includes? (:output result) (str "Database " Integer/MAX_VALUE " was not found")))
        (is (str/includes? (:output result) "Read `metabase://databases` with `read_resource`"))))))

(deftest database-disappeared-during-access-check-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
    (mt/with-dynamic-fn-redefs [api/read-check (fn [& _] (throw (ex-info "Foreign access error" {:status-code 404})))]
      (doseq [editor? [false true]]
        (let [result (invoke-sql-tool (if editor? :sql :internal) editor-memory "create_sql_query" {:database_id db-id})]
          (is (= {:class :recoverable :code ::recoverable/unknown-database} (:error result)))
          (is (str/includes? (:output result) (str "Database " db-id " was not found")))
          (is (not (str/includes? (:output result) "Foreign access error"))))))))

(deftest creation-permission-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
      (doseq [[permission expected-error]
              [[:query-builder-and-native nil]
               [:query-builder {:class :unrecoverable
                                :code ::sql.common/no-native-permission
                                :user-message "You do not have permission to write SQL queries against this database. Native query permissions are required."}]
               [:no {:class :unrecoverable
                     :code ::sql.create/database-access-denied
                     :user-message "You do not have access to this database."}]]]
        (perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries permission)
        (mt/with-current-user (mt/user->id :rasta)
          (doseq [editor? [false true]]
            (let [result (invoke-sql-tool (if editor? :sql :internal) editor-memory "create_sql_query" {:database_id db-id})]
              (is (= expected-error (:error result)))
              (if expected-error
                (is (str/includes? (:output result) "Don't retry"))
                (is (some? (:structured-output result)))))))))))

(deftest creation-syntax-error-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:engine :postgres}]
      (doseq [editor? [false true]]
        (let [result (invoke-sql-tool (if editor? :sql :internal) editor-memory "create_sql_query" {:database_id db-id :sql_query "SELECT ="})]
          (is (= {:class :recoverable :code ::sql.common/sql-syntax-error} (:error result)))
          (is (str/includes? (:output result) "syntax error"))
          (is (str/includes? (:output result) "Fix the SQL syntax and retry")))))))

(deftest creation-quotes-parser-details-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:engine :postgres}]
      (mt/with-dynamic-fn-redefs [sql-tools/transpile-sql
                                  (constantly {:status :error
                                               :error-message "Invalid expression\nSELECT \u001b[4m=\u001b[0m"})]
        (doseq [editor? [false true]]
          (let [result (invoke-sql-tool (if editor? :sql :internal) editor-memory "create_sql_query" {:database_id db-id :sql_query "SELECT ="})]
            (is (= :recoverable (get-in result [:error :class])))
            (is (str/includes? (:output result)
                               "Parser details: \"Invalid expression\\nSELECT \\u001b[4m=\\u001b[0m\""))))))))

(deftest creation-delivers-query-to-the-profile-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
      (doseq [editor? [false true]]
        (let [result (invoke-sql-tool (if editor? :sql :internal) editor-memory "create_sql_query" {:database_id db-id})
              query-id (get-in result [:structured-output :query-id])
              part (first (:data-parts result))]
          (is (nil? (:error result)))
          (is (= :query (get-in result [:structured-output :result-type])))
          (is (some? query-id))
          (is (str/includes? (:output result) (str "New query ID: " query-id)))
          (is (= 1 (count (:data-parts result))))
          (if editor?
            (do
              (is (= "code_edit" (:data-type part)))
              (is (= "sql-buffer" (get-in part [:data :buffer_id])))
              (is (= "SELECT 1" (get-in part [:data :value]))))
            (do
              (is (= "generated_entity" (:data-type part)))
              (is (= "Birds" (get-in part [:data :title]))))))))))

(deftest unexpected-creation-error-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
    (mt/with-dynamic-fn-redefs [api/read-check (fn [& _] (throw (ex-info "Foreign internal error" {:status-code 500})))]
      (doseq [editor? [false true]]
        (let [result (invoke-sql-tool (if editor? :sql :internal) editor-memory "create_sql_query" {:database_id db-id})]
          (is (= {:class :unrecoverable :code :internal} (:error result)))
          (is (str/includes? (:output result) "Don't retry"))
          (is (not (str/includes? (:output result) "Foreign internal error"))))))))
