(ns metabase-enterprise.metabot.tools.sql-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.audit-app.audit-test :as audit-test]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase.audit-app.core :as audit]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.core-test :as agent-test]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools.resources :as read-resource]
   [metabase.metabot.tools.sql-test :as sql-test]
   [metabase.metabot.tools.sql.common :as sql.common]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :plugins))

(def ^:private audit-sql-unavailable-message
  "Metabase does not run SQL on the Internal Metabase Database, for any user.")

(deftest sandboxed-user-has-no-native-query-access-test
  (sandbox.tu/with-gtaps! {:gtaps {:checkins {}}}
    ;; The permissions API refuses SQL access to a sandboxed group now, but instances can still hold it from before.
    (perms/set-database-permission! &group (mt/id) :perms/create-queries :query-builder-and-native)
    (is (= :query-builder-and-native
           (perms/full-database-permission-for-user (mt/user->id :rasta) :perms/create-queries (mt/id))))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You do not have permissions to run this query"
                          (qp/process-query (lib/native-query (mt/metadata-provider) "SELECT 1"))))
    (is (false? (sql.common/native-query-access? (mt/id))))))

(deftest sql-tools-refuse-the-audit-database-test
  (mt/with-premium-features #{:audit-app}
    (audit-test/with-audit-db-restoration!
      (mt/with-db-perm-for-group! (perms/all-users-group) audit/audit-db-id :perms/create-queries :query-builder
        (let [query  (lib/native-query (lib-be/application-database-metadata-provider audit/audit-db-id) "SELECT 1")
              memory (assoc @#'sql-test/editor-memory :state {:queries {"q1" query}})
              args   {:database_id audit/audit-db-id
                      :edits       [{:old_string "1" :new_string "2"}]
                      :new_query   "SELECT 2"}]
          (doseq [user      [:crowberto :rasta]
                  profile   [:internal :sql :internal-sql]
                  tool-name ["create_sql_query" "edit_sql_query" "replace_sql_query"]]
            (testing (str user " " profile " " tool-name)
              (mt/with-current-user (mt/user->id user)
                (let [{:keys [error output]} (#'sql-test/invoke-sql-tool profile memory tool-name args)]
                  (is (= (cond-> {:class (if (= :internal profile) :recoverable :unrecoverable)
                                  :code  ::sql.common/sql-on-audit-database}
                           (not= :internal profile)
                           (assoc :user-message audit-sql-unavailable-message))
                         error))
                  (is (str/includes? (or (:user-message error) output)
                                     "Metabase does not run SQL on the Internal Metabase Database"))
                  (is (= (= :internal profile)
                         (str/includes? output "Build the question with `construct_notebook_query`"))))))))))))

(deftest audit-sql-refusal-ends-a-turn-without-the-notebook-builder-test
  (mt/with-premium-features #{:audit-app}
    (audit-test/with-audit-db-restoration!
      (mt/with-db-perm-for-group! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder-and-native
        (mt/with-db-perm-for-group! (perms/all-users-group) audit/audit-db-id :perms/create-queries :query-builder
          (mt/with-temp-env-var-value! [mb-metabot-eval-profiles-enabled true]
            (doseq [user [:crowberto :rasta]
                    profile [:sql :internal-sql :document-generate-content]]
              (testing (str user " " profile)
                (mt/with-current-user (mt/user->id user)
                  (let [{:keys [llm-calls parts]}
                        (if (= :document-generate-content profile)
                          (#'agent-test/run-turn!
                           profile "Query Usage analytics"
                           (mapv (fn [n]
                                   [{:type :tool-input :id (str "retry-" n)
                                     :function "document_construct_sql_chart"
                                     :arguments {:database_id audit/audit-db-id
                                                 :name "Birds" :description "Birds" :analysis "Birds" :approach "SQL"
                                                 :sql "SELECT 1" :viz_settings {:chart_type "table"}}}])
                                 (range 21))
                           :context {:capabilities ["permission:write_sql_queries"]})
                          (#'agent-test/run-sql-turn!
                           profile audit/audit-db-id
                           :calls (mapv #(vector (str "retry-" %)) (range 21))))]
                    (is (= 1 llm-calls))
                    (is (= :terminal-error (:finish-reason (last parts))))
                    (is (some #(and (= :text (:type %))
                                    (= audit-sql-unavailable-message (:text %)))
                              parts))))))))))))

(deftest chat-recovers-from-audit-sql-refusal-in-the-same-turn-test
  (mt/with-premium-features #{:audit-app}
    (audit-test/with-audit-db-restoration!
      (mt/with-db-perm-for-group! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder-and-native
        (mt/with-db-perm-for-group! (perms/all-users-group) audit/audit-db-id :perms/create-queries :query-builder
          (doseq [user [:crowberto :rasta]]
            (testing user
              (mt/with-current-user (mt/user->id user)
                (let [{:keys [llm-calls parts]} (#'agent-test/run-sql-turn! :internal audit/audit-db-id)]
                  (is (= 2 llm-calls))
                  (is (= :stop (:finish-reason (last parts))))
                  (is (=? {:type :tool-output
                           :result {:error {:class :recoverable :code ::sql.common/sql-on-audit-database}
                                    :output #"(?s).*Build the question with `construct_notebook_query`.*"}}
                          (some #(when (= :tool-output (:type %)) %) parts))))))))))))

(deftest read-resource-says-sql-is-unavailable-on-the-audit-database-test
  (mt/with-premium-features #{:audit-app}
    (audit-test/with-audit-db-restoration!
      (mt/with-current-user (mt/user->id :crowberto)
        (let [model-id (t2/select-one-pk :model/Card :database_id audit/audit-db-id :type :model)]
          (doseq [uri [(str "metabase://database/" audit/audit-db-id) (str "metabase://model/" model-id)]]
            (testing uri
              (is (str/includes? (:output (test-util/call-tool read-resource/read-resource-tool {:uris [uri]}))
                                 "sql_unavailable=\"true\"")))))))))
