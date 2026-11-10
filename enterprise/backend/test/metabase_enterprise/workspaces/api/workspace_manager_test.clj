(ns metabase-enterprise.workspaces.api.workspace-manager-test
  "HTTP smoke tests for the workspace-manager API. Permission rules are exercised at the
   model level — see workspace_test.clj and workspace_database_test.clj. These tests just
   verify routing, request/response shape, and that the model-level permission predicates
   are wired into the endpoints (one 403 spot-check is enough)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
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
    (details [_ _ _ _]
      {:schema "mb_iso_stub" :database_details {:user "stub_user" :password "stub_pass"}})
    (init! [_ _ _ _] nil)
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ _ _] nil)))

(deftest crud-smoke-test
  (testing "create, get, list, delete round-trip"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (let [{ws-id :id :as ws} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                         {:name "Smoke Test" :database_ids [db-id]})]
            (is (=? {:id        pos-int?
                     :name      "Smoke Test"
                     :databases [{:database_id db-id}]
                     :creator   some?}
                    ws))
            (testing "get"
              (is (=? {:id ws-id :name "Smoke Test"}
                      (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id)))))
            (testing "list"
              (is (=? [{:id ws-id}]
                      (mt/user-http-request :crowberto :get 200 "ee/workspace-manager/"))))
            (testing "delete"
              (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id))
              (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id)))))))))

(deftest delete-workspace-pending-databases-test
  (testing "DELETE tears down a pending database like any other state"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                  {:name "Pending" :database_ids [db-id]})
                wsd-id      (t2/select-one-pk :model/WorkspaceDatabase :workspace_id ws-id)]
            (t2/update! :model/WorkspaceDatabase {:id wsd-id} {:status :provisioning})
            (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id))
            (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id))))))))

(deftest delete-workspace-teardown-failure-test
  (testing "DELETE returns a 500 with the database's error and keeps the workspace when a teardown fails"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [{ws-id :id} (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                            (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                  {:name "Unreachable" :database_ids [db-id]}))
              boom        (reify provisioning/Provisioner
                            (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                            (init!    [_ _ _ _]   nil)
                            (grant!   [_ _ _ _ _] nil)
                            (destroy! [_ _ _ _]   (throw (ex-info "Connection refused" {}))))]
          (with-redefs [provisioning/dispatching-provisioner boom]
            (is (=? {:message "Connection refused"}
                    (mt/user-http-request :crowberto :delete 500 (str "ee/workspace-manager/" ws-id)))))
          (testing "the workspace survives and a retry deletes it"
            (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id))
            (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
              (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id)))
            (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id))))))))

(deftest create-workspace-with-database-ids-test
  (testing "POST / attaches and provisions the given databases (each must be eligible) with their schemas"
    (mt/with-temp [:model/Database {eligible-id :id} {:engine   :postgres
                                                      :details  {}
                                                      :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id eligible-id :schema "public" :active true}
                   :model/Table _ {:db_id eligible-id :schema "analytics" :active true}
                   :model/Database {ineligible-id :id} {:engine :postgres :details {}}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (is (=? {:databases [{:database_id   eligible-id
                                :input_schemas ["analytics" "public"]
                                :status        "provisioned"}]}
                  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                        {:name "With dbs" :database_ids [eligible-id]})))
          (testing "an ineligible database is rejected"
            (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/"
                                  {:name "Nope" :database_ids [ineligible-id]}))
          (testing "at least one database is required"
            (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/"
                                  {:name "Nope" :database_ids []})))))))

(deftest rename-workspace-test
  (testing "PUT /:id renames a workspace and returns the updated WorkspaceResponse"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Before"}]
      (is (=? {:id ws-id :name "After"}
              (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/" ws-id) {:name "After"})))
      (is (= "After" (t2/select-one-fn :name :model/Workspace :id ws-id)))
      (testing "404 for a missing id"
        (mt/user-http-request :crowberto :put 404 "ee/workspace-manager/13371337" {:name "X"})))))

(deftest download-config-endpoint-test
  (testing "GET /:id/config"
    (mt/with-temp [:model/Database {db-id :id} {:engine :postgres :details {}}
                   :model/Workspace {ws-id :id} {:name "Cfg WS"}
                   :model/WorkspaceDatabase _ {:workspace_id     ws-id
                                               :database_id      db-id
                                               :database_details {}
                                               :output_namespace ""
                                               :input_schemas    ["public"]
                                               :status           :provisioned}]
      (testing "returns application/x-yaml with an attachment Content-Disposition"
        (is (=? {:status  200
                 :headers {"Content-Type"        "application/x-yaml"
                           "Content-Disposition" "attachment; filename=\"config.yml\""}}
                (mt/user-http-request-full-response
                 :crowberto :get 200 (str "ee/workspace-manager/" ws-id "/config")))))
      (testing "409 when a database is not :provisioned"
        (t2/update! :model/WorkspaceDatabase :workspace_id ws-id {:status :unprovisioned})
        (mt/user-http-request :crowberto :get 409 (str "ee/workspace-manager/" ws-id "/config")))
      (testing "404 for a missing workspace"
        (mt/user-http-request :crowberto :get 404 "ee/workspace-manager/13371337/config")))))

(defmacro ^:private with-data-analyst [& body]
  `(perms.test-util/with-data-analyst-role! (mt/user->id :rasta) ~@body))

(deftest endpoints-are-superuser-only-test
  (testing "All workspace-manager endpoints reject non-superusers, even Data Analysts"
    (mt/with-temp [:model/Workspace {ws-id :id} {}]
      (with-data-analyst
        (mt/user-http-request :rasta :get 403 "ee/workspace-manager/")
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id))
        (mt/user-http-request :rasta :post 403 "ee/workspace-manager/"
                              {:name "Nope" :database_ids [(mt/id)]})
        (mt/user-http-request :rasta :put 403 (str "ee/workspace-manager/" ws-id) {:name "Nope"})
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id "/config"))
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/" ws-id))))))
