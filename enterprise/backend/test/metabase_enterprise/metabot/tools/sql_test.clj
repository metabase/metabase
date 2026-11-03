(ns metabase-enterprise.metabot.tools.sql-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.audit-app.audit-test :as audit-test]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit]
   [metabase.lib.core :as lib]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as tools]
   [metabase.metabot.tools.run-query :as run-query]
   [metabase.metabot.tools.sql.common :as sql.common]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :plugins))

(deftest sandboxed-user-has-no-native-query-access-test
  (sandbox.tu/with-gtaps! {:gtaps {:checkins {}}}
    ;; The permissions API refuses SQL access to a sandboxed group now, but instances can still hold it from before.
    (perms/set-database-permission! &group (mt/id) :perms/create-queries :query-builder-and-native)
    (is (= :query-builder-and-native
           (perms/full-database-permission-for-user (mt/user->id :rasta) :perms/create-queries (mt/id))))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You do not have permissions to run this query"
                          (qp/process-query (lib/native-query (mt/metadata-provider) "SELECT 1"))))
    (is (false? (sql.common/native-query-access? (mt/id))))))

(defn- call-tool!
  "Call the tool `tool-name` of `tool-vars` with `args` as the current user, in a conversation of their own that
   holds `queries`, with all Metabot permissions. Return the tool's result, or
   `{:output <the text the model reads> :error {:class :code}}` on failure."
  [tool-vars queries tool-name args]
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id api/*current-user-id*}]
    (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions
              scope/*current-user-scope*               (scope/user-metabot-perms->scopes scope/all-yes-permissions)]
      (let [entries (tools/->entries tool-vars
                                     (atom {:conversation-id conversation-id, :state {:queries queries}})
                                     nil :internal)]
        ((:fn (get entries tool-name)) args)))))

(defn- run-query!
  "Call Chat's `run_query` on `query`. See [[call-tool!]]."
  [query]
  (call-tool! [#'tools/run-query-tool #'tools/construct-notebook-query-tool #'tools/create-sql-query-tool]
              {"q1" query}
              "run_query"
              {:query_id "q1"}))

(deftest audit-db-sql-test
  (audit-test/with-audit-db-restoration!
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [metabot-query-execution-enabled? true
                                         metabot-sql-execution-enabled?   true]
        (mt/with-current-user (mt/user->id :crowberto)
          (testing "`run_query` refuses SQL on the audit database with a step the model can take"
            (let [result (run-query! {:database audit/audit-db-id
                                      :type     :native
                                      :native   {:query "SELECT * FROM v_audit_log"}})]
              (is (= {:class :recoverable, :code ::run-query/audit-db-sql}
                     (:error result)))
              (testing "and does not call it a permission gap"
                (is (re-find #"is the audit database" (:output result)))
                (is (not (re-find #"(?i)you do not have permission" (:output result)))))))
          (testing "a SQL tool with no notebook fallback gets the QP's refusal, and the turn does not end"
            (let [result (call-tool! [#'tools/document-construct-sql-chart-tool]
                                     {}
                                     "document_construct_sql_chart"
                                     {:database_id  audit/audit-db-id
                                      :name         "Audit log"
                                      :description  "Audit log rows"
                                      :analysis     "Show the audit log"
                                      :approach     "SQL"
                                      :sql          "SELECT * FROM v_audit_log"
                                      :viz_settings {:chart_type "table"}})]
              (is (= {:class :recoverable, :code ::sql.common/query-failed}
                     (:error result)))
              (is (re-find #"Native queries are not allowed on the audit database" (:output result)))))
          (testing "the QP's refusal of a table that is not an audit view reaches the model"
            (mt/with-temp [:model/Table table {:db_id audit/audit-db-id}
                           :model/Field _     {:table_id (:id table)}]
              (let [result (run-query! {:database audit/audit-db-id
                                        :type     :query
                                        :query    {:source-table (:id table)}})]
                (is (= {:class :recoverable, :code ::sql.common/query-failed}
                       (:error result)))
                (is (re-find #"Audit queries are only allowed on audit views" (:output result)))))))))))
