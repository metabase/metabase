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
   [metabase.test :as mt]
   [metabase.util.malli :as mu]))

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
                "create_sql_query" (merge {:sql_query "SELECT 1"} (select-keys args [:sql_query :database_id :title]))
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

(deftest sql-edit-mismatch-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [[code edits sql-before-edit]
            [[::sql.edit/edit-not-found [{:old_string "missing" :new_string "2"}] nil]
             [::sql.edit/edit-ambiguous [{:old_string "id" :new_string "bird_id"}] nil]
             [::sql.edit/edit-not-found [{:old_string "birds" :new_string "owls"}
                                         {:old_string "missing" :new_string "2"}]
              "SELECT id, id FROM owls"]]]
      (let [sql "SELECT id, id FROM birds"
            query (lib/native-query (mt/metadata-provider) sql)
            result (invoke-sql-tool :sql {:state {:queries {"q1" query}}} "edit_sql_query" {:edits edits})]
        (is (= {:class :recoverable :code code} (:error result)))
        (is (str/includes? (:output result) (str "Edit " (count edits))))
        (is (str/includes? (:output result) (str "SQL for this edit: \"" (or sql-before-edit sql) "\"")))
        (is (str/includes? (:output result) "No edits were saved"))))))

(deftest sql-edit-context-is-quoted-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [sql "SELECT 'owl'\n-- \u001b[4mnotes"
          query (lib/native-query (mt/metadata-provider) sql)
          result (invoke-sql-tool :sql {:state {:queries {"q1" query}}} "edit_sql_query"
                                  {:edits [{:old_string "missing\n\u001b[4m" :new_string "2"}]})]
      (is (= ::sql.edit/edit-not-found (get-in result [:error :code])))
      (is (str/includes? (:output result) "SQL for this edit: \"SELECT 'owl'\\n-- \\u001b[4mnotes\"")))))

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

(deftest invalid-sql-edits-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [profile [:internal :sql]
            query [(lib/native-query (mt/metadata-provider) "SELECT 1")
                   (lib/->legacy-MBQL (lib/native-query (mt/metadata-provider) "SELECT 1"))]
            [tool-name args code excerpt]
            [["replace_sql_query" {:new_query ""} ::sql.common/blank-sql "would contain no SQL"]
             ["replace_sql_query" {:new_query " \n\t"} ::sql.common/blank-sql "nonblank SQL"]
             ["edit_sql_query" {:edits [{:old_string "SELECT 1" :new_string ""}]}
              ::sql.common/blank-sql "No changes were saved"]
             ["edit_sql_query" {:edits [{:old_string "SELECT 1" :new_string " \n"}]}
              ::sql.common/blank-sql "nonblank SQL"]
             ["edit_sql_query" {:edits []} ::sql.edit/empty-edits "at least one edit"]
             ["edit_sql_query" {:edits [{:old_string "" :new_string "X"}]}
              ::sql.edit/empty-old-string "old_string must not be empty"]
             ["edit_sql_query" {:edits [{:old_string "" :new_string "X" :replace_all true}]}
              ::sql.edit/empty-old-string "old_string must not be empty"]]]
      (testing (str profile " / " args)
        (let [result (invoke-sql-tool profile {:state {:queries {"q1" query}}} tool-name args)]
          (is (= {:class :recoverable :code code} (:error result)))
          (is (str/includes? (:output result) excerpt))
          (is (nil? (:structured-output result)))
          (is (empty? (:data-parts result))))))))

(deftest sql-query-recovery-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp (mt/metadata-provider)
          notebook (lib/query mp (lib.metadata/table mp (mt/id :venues)))
          sql-query (lib/native-query mp "SELECT 1")]
      (doseq [profile [:internal :sql]
              tool-name ["edit_sql_query" "replace_sql_query"]
              queries [{"notebook" notebook} {"notebook" notebook "sql" sql-query}]
              id ["missing" "notebook"]]
        (let [result (invoke-sql-tool profile {:state {:queries queries}} tool-name
                                      {:query_id id :edits [] :new_query "SELECT 2"})
              output (:output result)]
          (is (= {:class :recoverable
                  :code (if (= id "missing") ::recoverable/unknown-query-id ::sql.common/not-sql)}
                 (:error result)))
          (is (str/includes? output (if (= id "missing") "not found" "is not a SQL query")))
          (if (contains? queries "sql")
            (do
              (is (str/includes? output "Available query IDs: \"sql\""))
              (is (not (str/includes? output "create_sql_query"))))
            (do
              (is (str/includes? output "Available query IDs: none"))
              (is (str/includes? output "create_sql_query")))))))))

(deftest sql-syntax-error-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id :as db} {:engine :postgres}]
      (mt/with-db db
        (doseq [profile [:internal :sql]
                tool-name ["create_sql_query" "edit_sql_query" "replace_sql_query"]
                parser [(mt/original-fn #'sql-tools/transpile-sql)
                        (constantly {:status :error :error-message "Invalid expression\nSELECT \u001b[4m=\u001b[0m"})]]
          (mt/with-dynamic-fn-redefs [sql-tools/transpile-sql parser]
            (let [memory (assoc editor-memory :state {:queries {"q1" (lib/native-query (mt/metadata-provider) "SELECT 1")}})
                  result (invoke-sql-tool profile memory tool-name
                                          {:database_id db-id :sql_query "SELECT ="
                                           :edits [{:old_string "1" :new_string "="}] :new_query "SELECT ="})
                  output (:output result)]
              (is (= {:class :recoverable :code ::sql.common/sql-syntax-error} (:error result)))
              (is (str/includes? output "syntax error"))
              (is (str/includes? output "Fix the SQL syntax and retry"))
              (is (str/includes? output "Parser details: \""))
              (is (not (str/includes? output "\u001b")))
              (when (str/includes? output "Invalid expression")
                (is (str/includes? output "Parser details: \"Invalid expression\\nSELECT \\u001b[4m=\\u001b[0m\"")))
              (doseq [text ["Common issues to check:" "DATE_TRUNC vs TRUNC" "Quote style for identifiers"
                            "String concatenation operators" "Date/time literal syntax"
                            "NULL handling differences" "Case sensitivity of identifiers"]]
                (is (str/includes? output text))))))))))

(deftest closest-sql-match-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [ticket-sql "SELECT\n  id,\n  name\nFROM venues\nWHERE\n  price > 2 AND category_id IN (1, 2)"
          columns (str/join ",\n" (for [i (range 300)] (str "    column_" i)))
          cte-sql (str "WITH recent AS (\n  SELECT\n" columns
                       "\n  FROM orders\n  WHERE\n    status IN ('paid', 'shipped')\n)\nSELECT\n"
                       columns "\nFROM recent\nWHERE\n  price > 2")]
      (doseq [profile [:internal :sql]
              [sql old-string stored-text line]
              [["SELECT 1 -- 🐦" "🐦 " "🐦" 1]
               ["SELECT '🐦' AS bird" "select '🐦' as bird" "SELECT '🐦' AS bird" 1]
               ["-- 🐦\nSELECT '𐐀' AS bird" "select '𐐨' as bird" "SELECT '𐐀' AS bird" 2]
               [ticket-sql "where price > 2" "WHERE\n  price > 2" 5]
               [ticket-sql "where price > 2 and category_id in (1,2)" "WHERE\n  price > 2 AND category_id IN (1, 2)" 5]
               [ticket-sql "select id, name from venues where price > 2 and category_id in (1,2)" ticket-sql 1]
               [cte-sql "status in ('paid','shipped')" "status IN ('paid', 'shipped')" 305]
               [(str "SELECT 1\n-- " (apply str (repeat 1500 "\u200b")) "\nWHERE\n  price > 2")
                "where price > 2" "WHERE\n  price > 2" 3]
               [(str (apply str (repeat 222 "-- comment\n")) ticket-sql)
                "where price > 2" "WHERE\n  price > 2" 227]]]
        (let [memory {:state {:queries {"q1" (lib/native-query (mt/metadata-provider) sql)}}}
              result (invoke-sql-tool profile memory "edit_sql_query"
                                      {:edits [{:old_string old-string :new_string "x"}]})
              output (:output result)]
          (is (= ::sql.edit/edit-not-found (get-in result [:error :code])))
          (is (str/includes? output (str "Closest match ignoring case and whitespace at line " line ": "
                                         (pr-str stored-text))))
          (is (str/includes? output "not applied"))
          (is (str/ends-with? output "Or use `replace_sql_query` with the complete corrected SQL."))
          (is (<= (count output) 4000))
          (is (nil? (:structured-output result)))
          (is (empty? (:data-parts result))))))))

(deftest absent-sql-match-uses-available-budget-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [columns [300 1000 5000]]
      (let [sql (str "SELECT\n" (str/join ",\n" (for [i (range columns)] (str "  column_" i))) "\nFROM venues")
            result (invoke-sql-tool :sql {:state {:queries {"q1" (lib/native-query (mt/metadata-provider) sql)}}}
                                    "edit_sql_query" {:edits [{:old_string "nope" :new_string "x"}]})
            output (:output result)]
        (is (= ::sql.edit/edit-not-found (get-in result [:error :code])))
        (is (< 3900 (count output) 4001))
        (is (str/includes? output "SQL characters omitted"))
        (is (str/includes? output "SELECT\\n"))
        (is (str/includes? output "FROM venues"))
        (is (str/ends-with? output "Or use `replace_sql_query` with the complete corrected SQL."))))))

(deftest long-closest-sql-match-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [sql (str "SELECT\n" (str/join ",\n" (for [i (range 1200)] (str "  column_" i))) "\nFROM venues")
          old-string (str/replace (subs sql 0 12000) #"\n  " " ")
          result (invoke-sql-tool :sql {:state {:queries {"q1" (lib/native-query (mt/metadata-provider) sql)}}}
                                  "edit_sql_query" {:edits [{:old_string old-string :new_string "x"}]})
          output (:output result)]
      (is (= ::sql.edit/edit-not-found (get-in result [:error :code])))
      (is (str/includes? output "Closest match ignoring case and whitespace at line 1: \"SELECT\\n  column_0"))
      (is (str/includes? output "...\" (not applied)"))
      (is (str/ends-with? output "Or use `replace_sql_query` with the complete corrected SQL."))
      (is (<= (count output) 4000)))))

(deftest tiny-sql-context-budget-test
  (is (<= (count (#'sql.edit/quoted-sql-context (apply str (repeat 100 "SELECT id\n")) [] 10)) 10)))

(deftest ambiguous-sql-match-lines-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [sql "SELECT id, id\nFROM birds\nWHERE id > 2"
          result (invoke-sql-tool :sql {:state {:queries {"q1" (lib/native-query (mt/metadata-provider) sql)}}}
                                  "edit_sql_query" {:edits [{:old_string "id" :new_string "bird_id"}]})]
      (is (= ::sql.edit/edit-ambiguous (get-in result [:error :code])))
      (is (str/includes? (:output result) "Match lines: 1, 1, 3"))
      (is (str/includes? (:output result) "replace_all"))
      (is (str/includes? (:output result) "replace_sql_query")))))

(deftest long-sql-error-keeps-context-and-recovery-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [[columns expected-length] [[300 4125] [150 2025]]
            old-string ["nope" "where price > 2" "column_"]]
      (let [sql (str "SELECT\n" (str/join ",\n" (for [i (range columns)] (str "  column_" i)))
                     "\nFROM venues\nWHERE\n  price > 2")
            edits (cond-> []
                    (= columns 150) (conj {:old_string "venues" :new_string "places"})
                    true (conj {:old_string old-string :new_string "x"}))
            result (invoke-sql-tool :sql {:state {:queries {"q1" (lib/native-query (mt/metadata-provider) sql)}}}
                                    "edit_sql_query" {:edits edits})
            output (:output result)]
        (is (= expected-length (count sql)))
        (is (= :recoverable (get-in result [:error :class])))
        (is (<= (count output) 4000))
        (is (str/includes? output "No edits were saved"))
        (is (str/includes? output "replace_sql_query"))
        (when (not= old-string "column_")
          (is (str/includes? output "price > 2")))
        (when (= columns 300)
          (is (str/includes? output "omitted")))
        (when (= columns 150)
          (is (str/includes? output "includes earlier unsaved edits"))
          (is (not (str/includes? output "FROM venues"))))))))

(deftest escaped-sql-context-keeps-recovery-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [old-string ["nope" "where price > 2" "\u001b"]]
      (let [sql (str "SELECT 1\n-- " (apply str (repeat 1000 "\u001b\n")) "\nWHERE\n  price > 2")
            result (invoke-sql-tool :internal {:state {:queries {"q1" (lib/native-query (mt/metadata-provider) sql)}}}
                                    "edit_sql_query" {:edits [{:old_string old-string :new_string "x"}]})]
        (is (= :recoverable (get-in result [:error :class])))
        (is (<= (count (:output result)) 4000))
        (is (str/includes? (:output result) "replace_sql_query"))
        (is (str/includes? (:output result) "SQL characters omitted"))
        (is (not (str/includes? (:output result) "\u001b")))))))

(deftest many-sql-match-lines-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [[sql expected-lines]
            [[(str "SELECT\n" (str/join ",\n" (repeat 1000 "id")) "\nFROM birds")
              "Match lines: 2-1001 (1 match per line)."]
             [(str "SELECT " (str/join ", " (repeat 1000 "id")) " FROM birds")
              "Match lines: 1 (1000 matches)."]
             [(str "SELECT\n" (str/join "\n" (repeat 5 "id, id,")) "\n-- gap\n"
                   (str/join ",\n" (repeat 1000 "id")) "\nFROM birds")
              "Match lines: 2-6 (2 matches per line), 8-1007 (1 match per line)."]]]
      (let [result (invoke-sql-tool :sql {:state {:queries {"q1" (lib/native-query (mt/metadata-provider) sql)}}}
                                    "edit_sql_query" {:edits [{:old_string "id" :new_string "bird_id"}]})
            output (:output result)]
        (is (= ::sql.edit/edit-ambiguous (get-in result [:error :code])))
        (is (str/includes? output expected-lines))
        (is (not (str/includes? output "further match locations omitted")))
        (is (str/includes? output "replace_sql_query"))
        (is (<= (count output) 4000))))))

(deftest ^:parallel closest-span-long-text-test
  (let [sql (str "SELECT '" (apply str (repeat 20000 "a")) "' AS bird")
        old-string (str/replace sql "SELECT" "select")]
    (is (= [0 (count sql)] (#'sql.edit/closest-span sql old-string)))
    (is (nil? (#'sql.edit/closest-span sql (str old-string " missing"))))))

(deftest blank-sql-creation-test
  (mt/with-current-user (mt/user->id :crowberto)
    (doseq [engine [:h2 :postgres]]
      (mt/with-temp [:model/Database {db-id :id} {:engine engine}]
        (doseq [profile [:internal :sql]
                sql ["" " \n\t"]
                enforce-schema? [true false]]
          (testing (str engine " / " profile " / schema checks: " enforce-schema? " / " (pr-str sql))
            (let [invoke #(invoke-sql-tool profile editor-memory "create_sql_query" {:database_id db-id :sql_query sql})
                  result (if enforce-schema? (invoke) (mu/disable-enforcement (invoke)))]
              (is (= {:class :recoverable :code ::sql.common/blank-sql} (:error result)))
              (is (str/includes? (:output result) "No changes were saved"))
              (is (str/includes? (:output result) "Provide nonblank SQL"))
              (is (nil? (:structured-output result)))
              (is (empty? (:data-parts result))))))))))

(deftest long-parser-error-keeps-recovery-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id :as db} {:engine :postgres}]
      (mt/with-db db
        (mt/with-dynamic-fn-redefs [sql-tools/transpile-sql
                                    (constantly {:status :error
                                                 :error-message (str "Invalid expression\n" (apply str (repeat 1500 "\u001b")))})]
          (doseq [profile [:internal :sql]
                  tool-name ["create_sql_query" "edit_sql_query" "replace_sql_query"]]
            (let [memory (assoc editor-memory :state {:queries {"q1" (lib/native-query (mt/metadata-provider) "SELECT 1")}})
                  result (invoke-sql-tool profile memory tool-name
                                          {:database_id db-id :sql_query "SELECT ="
                                           :edits [{:old_string "1" :new_string "="}] :new_query "SELECT ="})
                  output (:output result)]
              (is (= {:class :recoverable :code ::sql.common/sql-syntax-error} (:error result)))
              (is (<= (count output) 4000))
              (is (str/includes? output "Parser details: \"Invalid expression\\n"))
              (is (str/includes? output "...\""))
              (is (not (str/includes? output "\u001b")))
              (is (str/includes? output "Fix the SQL syntax and retry"))
              (is (str/includes? output "Common issues to check:"))
              (is (str/ends-with? output "Case sensitivity of identifiers\n")))))))))

(deftest omitted-sql-match-lines-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [sql (str "SELECT\n" (str/join "\n" (repeat 1000 "id\n-- gap")) "\nFROM birds")
          result (invoke-sql-tool :sql {:state {:queries {"q1" (lib/native-query (mt/metadata-provider) sql)}}}
                                  "edit_sql_query" {:edits [{:old_string "id" :new_string "bird_id"}]})
          output (:output result)
          [_ listed omitted] (re-find #"Match lines: ([0-9, ]+); ([0-9]+) further match locations omitted" output)]
      (is (= ::sql.edit/edit-ambiguous (get-in result [:error :code])))
      (is (some? omitted))
      (when omitted
        (let [lines (map parse-long (str/split listed #", "))]
          (is (= (take (count lines) (range 2 2001 2)) lines))
          (is (= 1000 (+ (count lines) (parse-long omitted))))))
      (is (<= (count output) 4000))
      (is (str/ends-with? output "Or use `replace_sql_query` with the complete corrected SQL.")))))
