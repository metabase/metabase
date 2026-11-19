(ns metabase-enterprise.workspaces.request-workspace-test
  "A request that names a workspace with its `X-Metabase-Workspace-Id` header: what its queries and transforms use."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.models.table-remapping :as table-remapping]
   [metabase-enterprise.workspaces.remapping-cleanup :as ws.remapping-cleanup]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase-enterprise.workspaces.request-workspace :as ws.request-workspace]
   [metabase-enterprise.workspaces.row-security-test :as row-security-test]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase-enterprise.workspaces.transform-hooks :as ws.transform-hooks]
   [metabase.app-db.core :as app-db]
   [metabase.driver.sync :as driver.sync]
   [metabase.events.core :as events]
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
     (testing "a request can work in a workspace whose every database is provisioned, on an app DB whose row-level
               security keeps the rows of workspaces apart"
       (row-security-test/with-request-workspaces-enabled!
         (is (nil? (workspaces/request-workspace-problem workspace-id)))))
     (testing "not when the app DB does not keep the rows of workspaces apart"
       (is (re-find #"request-workspaces-enabled|PostgreSQL|row-level security"
                    (workspaces/request-workspace-problem workspace-id)))
       (row-security-test/with-request-workspaces-enabled!
         (mt/with-dynamic-fn-redefs [ws.db/row-security-forced? (constantly false)]
           (is (re-find #"row-level security is off" (workspaces/request-workspace-problem workspace-id))))
         (mt/with-dynamic-fn-redefs [ws.db/row-security-bypassed? (constantly true)]
           (is (re-find #"superuser" (workspaces/request-workspace-problem workspace-id))))))
     (testing "an unknown workspace"
       (is (= (str "There is no workspace " Integer/MAX_VALUE ".")
              (workspaces/request-workspace-problem Integer/MAX_VALUE))))
     (testing "a workspace with a database that is not provisioned"
       (t2/update! :model/WorkspaceDatabase {:database_id db-id} {:status :provisioning})
       (is (re-find #"not provisioned" (workspaces/request-workspace-problem workspace-id)))
       (workspaces/with-workspace-id workspace-id
         (testing "such a database is refused, and does not fall back to the Database's own login and schemas"
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not provisioned" (ws/db-workspace-namespace db-id)))
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not provisioned"
                                 (ws/workspace-connection-details db-id)))))
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
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not provisioned"
                               (ws/workspace-connection-details db-id))))))))

(deftest a-workspace-that-is-gone-fails-closed-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id db-id]}]
     (testing "a thread bound to a workspace that does not exist does not fall back to the instance's own"
       (workspaces/with-workspace-id Integer/MAX_VALUE
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"There is no workspace" (workspaces/workspace-bound?)))
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"There is no workspace" (workspaces/workspace-mode?)))
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"There is no workspace"
                               (ws.transform-hooks/workspace-transform-target db-id {:type :table :schema "public" :name "orders"})))))
     (testing "a workspace deleted while a thread is bound to it"
       (workspaces/with-workspace-id workspace-id
         (is (true? (workspaces/workspace-bound?)))
         (t2/delete! :model/WorkspaceDatabase :workspace_id workspace-id)
         (t2/delete! :model/Workspace :id workspace-id)
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"There is no workspace" (workspaces/workspace-bound?)))
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"There is no workspace"
                               (ws.transform-hooks/workspace-transform-target db-id {:type :table :schema "public" :name "orders"}))))))))

(deftest request-workspace-refuses-what-a-workspace-refuses-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id]}]
     (workspaces/with-workspace-id workspace-id
       (testing "features that a workspace refuses are refused in a request that names one"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Actions is not supported in a request that names a workspace\.$"
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

(def ^:private orders {:db "" :schema "public" :table "orders"})

(defn- remap-orders!
  "Remap `orders` of the Database with `db-id` into `schema`, in the current workspace."
  [db-id schema]
  (ws.remapping/insert-mapping! db-id orders {:db "" :schema schema :table "public__orders"}))

(defn- orders-target
  "The schema `orders` of the Database with `db-id` is remapped to in the current workspace, or nil."
  [db-id]
  (:schema (ws.remapping/get-mapping db-id orders)))

(deftest table-remappings-of-a-request-workspace-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id db-id]}]
     (mt/with-temp [:model/Workspace {other-id :id} {:name "other"}]
       (try
         (workspaces/with-workspace-id workspace-id
           (remap-orders! db-id "mb__isolation_test"))
         (testing "a remapping made in a workspace that a request names belongs to that workspace"
           (workspaces/with-workspace-id workspace-id
             (is (= "mb__isolation_test" (orders-target db-id)))
             (is (true? (ws.remapping/enabled-for-db? db-id)))
             (is (= {orders {:db "" :schema "mb__isolation_test" :table "public__orders"}}
                    (ws.remapping/remappings-for-db db-id)))
             (is (= [db-id] (map :database_id (ws/list-remappings))))))
         (testing "another workspace and the instance's own do not see it"
           (workspaces/with-workspace-id other-id
             (is (nil? (orders-target db-id)))
             (is (= {} (ws.remapping/remappings-for-db db-id)))
             (is (empty? (ws/list-remappings))))
           (is (nil? (orders-target db-id)))
           (is (empty? (ws/list-remappings))))
         (testing "the instance's cache of the Databases with remappings has only the instance's own"
           (table-remapping/invalidate-database-ids!)
           (is (not (contains? (table-remapping/database-ids-with-remappings) db-id))))
         (testing "another workspace can remap the same table to its own schema"
           (workspaces/with-workspace-id other-id
             (remap-orders! db-id "mb__isolation_other")
             (is (= "mb__isolation_other" (orders-target db-id))))
           (workspaces/with-workspace-id workspace-id
             (is (= "mb__isolation_test" (orders-target db-id)))))
         (testing "removing a workspace's remappings leaves the others' alone"
           (workspaces/with-workspace-id other-id
             (ws.remapping/clear-for-db! db-id))
           (workspaces/with-workspace-id workspace-id
             (is (= "mb__isolation_test" (orders-target db-id)))))
         (testing "the cleanup of a workspace's isolation schema deletes its remappings"
           (ws.remapping-cleanup/clear-mappings-for-iso! {:engine :postgres} db-id "mb__isolation_test")
           (workspaces/with-workspace-id workspace-id
             (is (nil? (orders-target db-id)))))
         (finally
           (t2/delete! :model/TableRemapping :database_id db-id)))))))

(deftest deleting-a-workspace-deletes-its-table-remappings-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id db-id]}]
     (try
       (workspaces/with-workspace-id workspace-id
         (remap-orders! db-id "elsewhere"))
       (ws.db/delete-workspace-table-remappings! workspace-id)
       (is (not (t2/exists? :model/TableRemapping :database_id db-id)))
       (finally
         (t2/delete! :model/TableRemapping :database_id db-id))))))

(deftest clearing-the-instance-workspace-keeps-request-workspace-remappings-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id db-id]}]
     (try
       (remap-orders! db-id "instance_schema")
       (workspaces/with-workspace-id workspace-id
         (remap-orders! db-id "mb__isolation_test"))
       (ws/clear-instance-workspace!)
       (testing "the instance's own remappings go"
         (is (nil? (orders-target db-id))))
       (testing "a workspace's remappings stay"
         (workspaces/with-workspace-id workspace-id
           (is (= "mb__isolation_test" (orders-target db-id)))))
       (finally
         (t2/delete! :model/TableRemapping :database_id db-id))))))

(defn- cached-ids []
  (set (keys @@#'ws.request-workspace/cache)))

(deftest request-workspace-cache-test
  (do-with-request-workspace
   (fn [{:keys [workspace-id db-id]}]
     ;; the test's writes are in a transaction, which the cache leaves alone
     (mt/with-dynamic-fn-redefs [app-db/in-transaction? (constantly false)]
       (ws.request-workspace/invalidate!)
       (testing "a workspace that does not exist is not cached, so a request that names it later reads it"
         (is (nil? (ws.request-workspace/request-workspace Integer/MAX_VALUE)))
         (is (not (contains? (cached-ids) Integer/MAX_VALUE))))
       (testing "a workspace is cached"
         (is (some? (ws.request-workspace/request-workspace workspace-id)))
         (is (contains? (cached-ids) workspace-id)))
       (testing "an entry older than the maximum age goes when another workspace is cached"
         (swap! @#'ws.request-workspace/cache assoc -1 {:value {} :read-at (- (System/nanoTime) (* 60 1000 1000 1000))})
         (ws.request-workspace/invalidate!)
         (swap! @#'ws.request-workspace/cache assoc -1 {:value {} :read-at (- (System/nanoTime) (* 60 1000 1000 1000))})
         (ws.request-workspace/request-workspace workspace-id)
         (is (not (contains? (cached-ids) -1))))
       (testing "an update of a Database drops the cache: its details decide whether the workspace's login can be used"
         (is (contains? (cached-ids) workspace-id))
         (let [db (t2/select-one :model/Database :id db-id)]
           (events/publish-event! :event/database-update {:object db :previous-object db :user-id (mt/user->id :crowberto)}))
         (is (empty? (cached-ids))))))))
