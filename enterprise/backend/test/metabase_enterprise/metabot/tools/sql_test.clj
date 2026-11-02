(ns metabase-enterprise.metabot.tools.sql-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.audit-app.audit-test :as audit-test]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase.audit-app.core :as audit]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.sql-test :as sql-test]
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
                  profile   [:internal :sql]
                  tool-name ["create_sql_query" "edit_sql_query" "replace_sql_query"]]
            (testing (str user " " profile " " tool-name)
              (mt/with-current-user (mt/user->id user)
                (let [{:keys [error output]} (#'sql-test/invoke-sql-tool profile memory tool-name args)]
                  (is (= {:class :recoverable :code ::sql.common/sql-on-audit-database} error))
                  (is (str/includes? output "Metabase does not run SQL on the Internal Metabase Database"))
                  (is (= (= :internal profile)
                         (str/includes? output "Build the question with `construct_notebook_query`"))))))))))))
