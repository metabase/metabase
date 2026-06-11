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
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

(deftest crud-smoke-test
  (testing "create, get, list, delete round-trip"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{ws-id :id :as ws} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                     {:name "Smoke Test"})]
        (is (=? {:id pos-int? :name "Smoke Test" :databases [] :creator some?}
                ws))
        (testing "get"
          (is (=? {:id ws-id :name "Smoke Test"}
                  (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id)))))
        (testing "list"
          (is (=? [{:id ws-id}]
                  (mt/user-http-request :crowberto :get 200 "ee/workspace-manager/"))))
        (testing "delete"
          (is (=? {:id ws-id :deleted true}
                  (mt/user-http-request :crowberto :delete 200 (str "ee/workspace-manager/" ws-id))))
          (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id)))))))

(defn- stub-provisioner []
  (reify provisioning/Provisioner
    (init! [_ _ _ _]
      {:schema "mb_iso_stub" :database_details {:user "stub_user" :password "stub_pass"}})
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ _ _] nil)))

(deftest create-workspace-attaches-eligible-databases-test
  (testing "POST / attaches and provisions every eligible database (driver `:workspace` feature + `database-enable-workspaces`) with its schemas"
    (mt/with-temp [:model/Database {eligible-id :id} {:engine   :postgres
                                                      :details  {}
                                                      :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id eligible-id :schema "public" :active true}
                   :model/Table _ {:db_id eligible-id :schema "analytics" :active true}
                   ;; supported driver, but the setting is not enabled — must not be attached
                   :model/Database _ {:engine :postgres :details {}}]
      (mt/with-model-cleanup [:model/Workspace]
        ;; the sample H2 database is also present but H2 has no `:workspace` feature
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (is (=? {:databases [{:database_id   eligible-id
                                :input_schemas ["analytics" "public"]
                                :status        "provisioned"}]}
                  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                        {:name "Auto-attach"}))))))))

(defmacro ^:private with-data-analyst [& body]
  `(perms.test-util/with-data-analyst-role! (mt/user->id :rasta) ~@body))

(deftest endpoints-are-superuser-only-test
  (testing "All workspace-manager endpoints reject non-superusers, even Data Analysts"
    (mt/with-temp [:model/Workspace {ws-id :id} {}]
      (with-data-analyst
        (mt/user-http-request :rasta :get 403 "ee/workspace-manager/")
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id))
        (mt/user-http-request :rasta :post 403 "ee/workspace-manager/" {:name "Nope"})
        (mt/user-http-request :rasta :put 403 (str "ee/workspace-manager/" ws-id) {:name "Nope"})
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id "/config"))
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/" ws-id))))))
