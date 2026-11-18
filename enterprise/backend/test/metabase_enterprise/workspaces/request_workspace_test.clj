(ns metabase-enterprise.workspaces.request-workspace-test
  "A request that names a workspace with its `X-Metabase-Workspace-Id` header: what its queries and transforms use."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.driver.sync :as driver.sync]
   [metabase.query-processor.middleware.cache :as qp.cache]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn do-with-request-workspace
  "Calls `f` with `{:workspace-id :db-id}`: a Postgres Database that a provisioned workspace isolates in
  `mb__isolation_test`, logging in as `ws_user`. `db-details` go over the Database's details."
  ([f] (do-with-request-workspace {} f))
  ([db-details f]
   (mt/with-premium-features #{:workspaces}
     (mt/with-temp [:model/Database          {db-id :id}        {:engine  :postgres
                                                                 :details (merge {:host              "localhost"
                                                                                  :user              "parent"
                                                                                  :password          "parent-pass"
                                                                                  :use-auth-provider true}
                                                                                 db-details)}
                    :model/Workspace         {workspace-id :id} {:name "ws"}
                    :model/WorkspaceDatabase _                  {:workspace_id     workspace-id
                                                                 :database_id      db-id
                                                                 :database_details {:user "ws_user" :password "ws-pass"}
                                                                 :output_namespace "mb__isolation_test"
                                                                 :input_schemas    ["public"]
                                                                 :status           :provisioned}]
       (f {:workspace-id workspace-id :db-id db-id})))))

(deftest current-workspace-of-a-request-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id db-id]}]
     (testing "a request that names no workspace works in none"
       (is (nil? (ws/current-workspace)))
       (is (false? (ws/workspace-mode?)))
       (is (false? (workspaces/workspace-bound?)))
       (is (nil? (ws/db-workspace-namespace db-id)))
       (is (nil? (ws/workspace-connection-details db-id))))
     (workspaces/with-workspace-id workspace-id
       (testing "a request works in the workspace it names"
         (is (=? {:mode :bound :workspace-id workspace-id} (ws/current-workspace)))
         (is (true? (ws/workspace-mode?)))
         (is (true? (workspaces/workspace-bound?))))
       (testing "a Database of the workspace has the workspace's output schema"
         (is (= {:schema "mb__isolation_test"} (ws/db-workspace-namespace db-id))))
       (testing "a Database of the workspace connects with the workspace's login, and none of the parent's"
         (let [details (ws/workspace-connection-details db-id)]
           (is (=? {:user "ws_user" :password "ws-pass"} details))
           (is (contains? details :use-auth-provider))
           (is (nil? (:use-auth-provider details)))))
       (testing "a Database outside the workspace has neither"
         (is (nil? (ws/db-workspace-namespace (mt/id))))
         (is (nil? (ws/workspace-connection-details (mt/id)))))))))

(deftest request-workspace-problem-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id db-id]}]
     (testing "a request can work in a workspace whose every database is provisioned"
       (is (nil? (workspaces/request-workspace-problem workspace-id))))
     (testing "an unknown workspace"
       (is (= (str "There is no workspace " Integer/MAX_VALUE ".")
              (workspaces/request-workspace-problem Integer/MAX_VALUE))))
     (testing "a workspace with a database that is not provisioned"
       (t2/update! :model/WorkspaceDatabase {:database_id db-id} {:status :provisioning})
       (is (re-find #"not provisioned" (workspaces/request-workspace-problem workspace-id)))
       (workspaces/with-workspace-id workspace-id
         (testing "such a database is not in the workspace"
           (is (nil? (ws/db-workspace-namespace db-id)))
           (is (nil? (ws/workspace-connection-details db-id)))))
       (t2/update! :model/WorkspaceDatabase {:database_id db-id} {:status :provisioned}))
     (testing "a workspace with no databases"
       (mt/with-temp [:model/Workspace {empty-id :id} {:name "empty"}]
         (is (re-find #"has no databases" (workspaces/request-workspace-problem empty-id)))))
     (testing "an instance that is itself a workspace"
       (mt/with-dynamic-fn-redefs [ws.settings/workspaces-enabled (constantly true)]
         (is (re-find #"is a workspace" (workspaces/request-workspace-problem workspace-id)))))
     (testing "without the workspaces feature"
       (mt/with-premium-features #{}
         (is (some? (workspaces/request-workspace-problem workspace-id))))))))

(deftest request-workspace-refuses-the-parent-login-test
  (testing "a Database whose connection would log in as the parent"
    (doseq [[db-details expected] [[{:additional-options "user=parent&password=parent-pass"} #"additional JDBC"]
                                   [{:ssl true :ssl-use-client-auth true} #"client-certificate"]]]
      (do-with-request-workspace
       db-details
       (fn [{:keys [workspace-id db-id]}]
         (testing "is refused when a request names its workspace"
           (is (re-find expected (workspaces/request-workspace-problem workspace-id))))
         (testing "and never connects with the workspace's login"
           (workspaces/with-workspace-id workspace-id
             (is (thrown-with-msg? clojure.lang.ExceptionInfo expected
                                   (ws/workspace-connection-details db-id))))))))))

(deftest request-workspace-follows-workspace-database-changes-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id db-id]}]
     (workspaces/with-workspace-id workspace-id
       (is (some? (ws/workspace-connection-details db-id)))
       (testing "a deprovisioned database leaves the cached workspace at once"
         (t2/update! :model/WorkspaceDatabase {:database_id db-id} {:status :deprovisioning})
         (is (nil? (ws/workspace-connection-details db-id))))))))

(deftest request-workspace-refuses-what-a-workspace-refuses-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id]}]
     (workspaces/with-workspace-id workspace-id
       (testing "features that a workspace refuses are refused in a request that names one"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not supported on a workspace"
                               (workspaces/check-not-in-workspace-mode! "Actions"))))))))

(deftest request-workspace-queries-are-not-cached-test
  (let [query {:cache-strategy {:type :ttl :multiplier 10 :min_duration_ms 0}}]
    (is (true? (#'qp.cache/is-cacheable? query)))
    (mt/with-dynamic-fn-redefs [workspaces/workspace-bound? (constantly true)]
      (testing "a query in a workspace that a request names is not cached: requests in other workspaces share the key"
        (is (false? (#'qp.cache/is-cacheable? query)))))))

(deftest request-workspace-sync-skips-isolation-schemas-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id]}]
     (workspaces/with-workspace-id workspace-id
       (testing "a sync writes the metadata that every workspace shares, so it lists no workspace's isolation schemas"
         (is (false? (driver.sync/include-schema? nil nil "mb__isolation_abc_1")))
         (is (true? (driver.sync/include-schema? nil nil "public"))))))))
