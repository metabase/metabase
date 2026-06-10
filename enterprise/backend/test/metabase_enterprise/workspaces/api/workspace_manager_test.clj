(ns metabase-enterprise.workspaces.api.workspace-manager-test
  "HTTP smoke tests for the workspace-manager API. Permission rules are exercised at the
   model level — see workspace_test.clj and workspace_database_test.clj. These tests just
   verify routing, request/response shape, and that the model-level permission predicates
   are wired into the endpoints (one 403 spot-check is enough)."
  (:require
   [clj-http.client :as http]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.driver :as driver]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

(defn- stub-provisioner []
  (reify provisioning/Provisioner
    (init! [_ _ _ _]
      {:schema "mb_iso_stub" :database_details {:user "stub_user" :password "stub_pass"}})
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ _ _] nil)))

(defmacro ^:private with-free-instance
  "Provide a free pool instance and stub child HTTP calls so `POST /` can auto-deploy."
  [& body]
  `(mt/with-temp [:model/WorkspaceInstance ~'_ {:url "https://child.example.com" :api_key "k"}]
     (with-redefs [http/request (fn [~'_] {:status 200 :body ""})]
       ~@body)))

(deftest crud-smoke-test
  (testing "create, get, list, delete round-trip"
    (mt/with-model-cleanup [:model/Workspace]
      (with-free-instance
        (let [{ws-id :id :as ws} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                       {:name "Smoke Test"})]
          (is (=? {:id pos-int? :name "Smoke Test" :databases [] :creator some?}
                  ws))
          (testing "the workspace was deployed onto the free pool instance"
            (is (= ws-id (t2/select-one-fn :workspace_id :model/WorkspaceInstance
                                           :url "https://child.example.com"))))
          (testing "get"
            (is (=? {:id ws-id :name "Smoke Test"}
                    (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id)))))
          (testing "list"
            (is (=? [{:id ws-id}]
                    (mt/user-http-request :crowberto :get 200 "ee/workspace-manager/"))))
          (testing "delete"
            (is (=? {:id ws-id :deleted true}
                    (mt/user-http-request :crowberto :delete 200 (str "ee/workspace-manager/" ws-id))))
            (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id))
            (testing "deleting the workspace returns the instance to the pool (FK SET NULL)"
              (is (nil? (t2/select-one-fn :workspace_id :model/WorkspaceInstance
                                          :url "https://child.example.com"))))))))))

(deftest create-workspace-auto-discovery-test
  (testing "POST / attaches every eligible database (workspace-capable driver + database-enable-workspaces on) and provisions it, with the hydrated :database in the response"
    (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)
                  driver/database-supports?            (constantly true)]
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-workspaces true}}
        (mt/with-model-cleanup [:model/Workspace]
          (with-free-instance
            (is (=? {:databases [{:database_id   (mt/id)
                                  :input_schemas ["PUBLIC"]
                                  :status        "provisioned"
                                  :database      {:id (mt/id) :name (:name (mt/db)) :engine "h2"}}]}
                    (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                          {:name "DB Test"})))))))))

(deftest create-workspace-requires-free-instance-test
  (testing "POST / 400s straight away — before creating anything — when the pool has no free instance"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/" {:name "No Pool"})
      (testing "no workspace row was created"
        (is (not (t2/exists? :model/Workspace :name "No Pool")))))))

(defmacro ^:private with-data-analyst [& body]
  `(perms.test-util/with-data-analyst-role! (mt/user->id :rasta) ~@body))

(defmacro ^:private with-workspaces-perm [db-id & body]
  `(perms.test-util/with-db-perm-for-group! (perms/all-users-group) ~db-id
     :perms/workspaces :yes
     ~@body))

(deftest get-endpoints-use-workspace-can-read?-test
  (testing "GET / and GET /:id dispatch through `Workspace.can-read?` — Data Analyst alone passes"
    (mt/with-temp [:model/Workspace {ws-id :id} {}]
      (with-data-analyst
        (mt/user-http-request :rasta :get 200 "ee/workspace-manager/")
        (mt/user-http-request :rasta :get 200 (str "ee/workspace-manager/" ws-id))))))

(deftest post-workspace-uses-workspace-can-create?-test
  (testing "POST / dispatches through `Workspace.can-create?` — Data Analyst alone is rejected; granting `:perms/workspaces` on any DB lets the call through"
    (mt/with-model-cleanup [:model/Workspace]
      (with-free-instance
        (with-data-analyst
          (mt/user-http-request :rasta :post 403 "ee/workspace-manager/" {:name "Nope"})
          (with-workspaces-perm (mt/id)
            (is (=? {:name "OK"}
                    (mt/user-http-request :rasta :post 200 "ee/workspace-manager/" {:name "OK"})))))))))

(deftest workspace-write-endpoints-use-workspace-can-write?-test
  (testing "PUT /:id and DELETE /:id dispatch through `Workspace.can-write?` — Data Analyst alone is rejected (rules out `can-read?`); granting `:perms/workspaces` on any DB lets the call through"
    (mt/with-temp [:model/Workspace {ws-id :id} {}]
      (with-data-analyst
        (mt/user-http-request :rasta :put 403 (str "ee/workspace-manager/" ws-id) {:name "Nope"})
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/" ws-id))
        (with-workspaces-perm (mt/id)
          (mt/user-http-request :rasta :put 200 (str "ee/workspace-manager/" ws-id) {:name "OK"})
          (mt/user-http-request :rasta :delete 200 (str "ee/workspace-manager/" ws-id)))))))

;;; ------------------------------------------- Instance pool CRUD ---------------------------------------------

(deftest instance-pool-crud-test
  (testing "register, get, list, edit, remove a pool instance"
    (mt/with-model-cleanup [:model/WorkspaceInstance]
      (with-redefs [http/request (fn [_] {:status 200 :body ""})]
        (let [{id :id :as created} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance"
                                                         {:url "https://child-1.example.com"
                                                          :api_key "mb_key_1"
                                                          :name "child-1"})]
          (testing "POST returns a free (unbound) instance and no api_key"
            (is (=? {:id pos-int? :url "https://child-1.example.com" :name "child-1"
                     :workspace_id nil}
                    created))
            (is (not (contains? created :api_key))))
          (testing "GET /:id"
            (is (=? {:id id :workspace_id nil}
                    (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/instance/" id)))))
          (testing "GET list"
            (is (=? [{:id id :url "https://child-1.example.com"}]
                    (mt/user-http-request :crowberto :get 200 "ee/workspace-manager/instance"))))
          (testing "PUT edits the name only; url is immutable"
            (is (=? {:id id :url "https://child-1.example.com" :name "renamed"}
                    (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/instance/" id)
                                          {:name "renamed"}))))
          (testing "PUT ignores url and api_key (immutable — only name is applied)"
            (is (=? {:id id :url "https://child-1.example.com" :name "again"}
                    (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/instance/" id)
                                          {:url "https://ignored.example.com"
                                           :api_key "ignored"
                                           :name "again"}))))
          (testing "DELETE removes"
            (is (=? {:id id :deleted true}
                    (mt/user-http-request :crowberto :delete 200 (str "ee/workspace-manager/instance/" id))))
            (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/instance/" id))))))))

(deftest instance-pool-create-verifies-reachability-test
  (testing "POST /instance verifies the instance is reachable with the supplied api key"
    (mt/with-model-cleanup [:model/WorkspaceInstance]
      (testing "calls the instance's GET /api/user/current with the x-api-key header"
        (let [calls (atom [])]
          (with-redefs [http/request (fn [req] (swap! calls conj req) {:status 200 :body ""})]
            (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance"
                                  {:url "https://reachable.example.com" :api_key "secret-key"}))
          (is (= 1 (count @calls)))
          (let [req (first @calls)]
            (is (= :get (:method req)))
            (is (= "https://reachable.example.com/api/user/current" (:url req)))
            (is (= "secret-key" (get-in req [:headers "x-api-key"]))))))
      (testing "returns 400 and persists nothing when the instance is unreachable / rejects the key"
        (with-redefs [http/request (fn [_] (throw (ex-info "boom" {:status 401})))]
          (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/instance"
                                {:url "https://unreachable.example.com" :api_key "bad-key"}))
        (is (empty? (t2/select :model/WorkspaceInstance :url "https://unreachable.example.com")))))))

(deftest instance-pool-rejects-workspace-id-in-body-test
  (testing "the FE cannot bind an instance by setting workspace_id via POST or PUT"
    (mt/with-model-cleanup [:model/WorkspaceInstance]
      (with-redefs [http/request (fn [_] {:status 200 :body ""})]
        (testing "POST with workspace_id — 400"
          (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/instance"
                                {:url "https://x.example.com" :api_key "k" :workspace_id 1}))
        (let [{id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance"
                                             {:url "https://y.example.com" :api_key "k"})]
          (testing "PUT with workspace_id — 400"
            (mt/user-http-request :crowberto :put 400 (str "ee/workspace-manager/instance/" id)
                                  {:workspace_id 1})))))))

(deftest instance-pool-delete-busy-400-test
  (testing "DELETE refuses a provisioned instance"
    (mt/with-model-cleanup [:model/WorkspaceInstance]
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "Bound"}
                     :model/WorkspaceInstance {id :id} {:url "https://busy.example.com"
                                                        :api_key "k"
                                                        :workspace_id ws-id}]
        (is (=? {:workspace_id ws-id}
                (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/instance/" id))))
        (mt/user-http-request :crowberto :delete 400 (str "ee/workspace-manager/instance/" id))))))

(deftest instance-pool-permissions-test
  (testing "instance endpoints dispatch through the `WorkspaceInstance` permission predicates"
    (mt/with-model-cleanup [:model/WorkspaceInstance]
      (mt/with-temp [:model/WorkspaceInstance {id :id} {:url "https://gate.example.com" :api_key "k"}]
        (testing "a regular user (not a Data Analyst) is rejected everywhere"
          (mt/user-http-request :rasta :get 403 "ee/workspace-manager/instance")
          (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/instance/" id))
          (mt/user-http-request :rasta :post 403 "ee/workspace-manager/instance"
                                {:url "https://nope.example.com" :api_key "k"})
          (mt/user-http-request :rasta :put 403 (str "ee/workspace-manager/instance/" id) {:name "nope"})
          (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/instance/" id)))
        (testing "a Data Analyst alone can read but not write"
          (with-data-analyst
            (mt/user-http-request :rasta :get 200 "ee/workspace-manager/instance")
            (is (=? {:id id}
                    (mt/user-http-request :rasta :get 200 (str "ee/workspace-manager/instance/" id))))
            (mt/user-http-request :rasta :post 403 "ee/workspace-manager/instance"
                                  {:url "https://nope.example.com" :api_key "k"})
            (mt/user-http-request :rasta :put 403 (str "ee/workspace-manager/instance/" id) {:name "nope"})
            (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/instance/" id))))
        (testing "a Data Analyst with `:perms/workspaces` on any DB can create, edit, and delete"
          (with-data-analyst
            (with-workspaces-perm (mt/id)
              (with-redefs [http/request (fn [_] {:status 200 :body ""})]
                (is (=? {:id id :name "renamed"}
                        (mt/user-http-request :rasta :put 200 (str "ee/workspace-manager/instance/" id)
                                              {:name "renamed"})))
                (let [{new-id :id} (mt/user-http-request :rasta :post 200 "ee/workspace-manager/instance"
                                                         {:url "https://da.example.com" :api_key "k"})]
                  (mt/user-http-request :rasta :delete 200
                                        (str "ee/workspace-manager/instance/" new-id)))))))))))
