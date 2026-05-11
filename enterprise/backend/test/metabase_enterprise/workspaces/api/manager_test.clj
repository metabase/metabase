(ns metabase-enterprise.workspaces.api.manager-test
  "HTTP smoke tests for the workspace-manager API. Permission rules are exercised at the
   model level — see workspace_test.clj and workspace_database_test.clj. These tests just
   verify routing, request/response shape, and that the model-level permission predicates
   are wired into the endpoints (one 403 spot-check is enough)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

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
          (is (some #(= ws-id (:id %))
                    (mt/user-http-request :crowberto :get 200 "ee/workspace-manager/"))))

        (testing "delete"
          (is (=? {:id ws-id :deleted true}
                  (mt/user-http-request :crowberto :delete 200 (str "ee/workspace-manager/" ws-id))))
          (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id)))))))

(deftest create-with-databases-smoke-test
  (testing "POST / with :databases creates and provisions in one call"
    (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
      (mt/with-model-cleanup [:model/Workspace]
        (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                       {:name      "With DBs"
                                        :databases [{:database_id (mt/id) :input [{:schema "PUBLIC"}]}]})]
          (is (=? {:name      "With DBs"
                   :databases [{:database_id (mt/id) :status "provisioned"}]}
                  ws))))))

  (testing "POST / without :databases still works"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                     {:name "No DBs"})]
        (is (=? {:name "No DBs" :databases []}
                ws))))))

(deftest reconcile-databases-smoke-test
  (testing "PUT /:id with :databases diffs and reconciles"
    (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
      (mt/with-model-cleanup [:model/Workspace]
        (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                {:name "DB Test"})]
          (testing "add a database via PUT"
            (is (=? {:databases [{:database_id (mt/id) :status "provisioned"}]}
                    (mt/user-http-request :crowberto :put 200
                                          (str "ee/workspace-manager/" ws-id)
                                          {:databases [{:database_id (mt/id) :input [{:schema "PUBLIC"}]}]}))))

          (testing "modify input via PUT (same db, different schemas)"
            (is (=? {:databases [{:database_id (mt/id)
                                  :input [{:schema "PUBLIC"} {:schema "ANALYTICS"}]}]}
                    (mt/user-http-request :crowberto :put 200
                                          (str "ee/workspace-manager/" ws-id)
                                          {:databases [{:database_id (mt/id)
                                                        :input [{:schema "PUBLIC"} {:schema "ANALYTICS"}]}]}))))

          (testing "remove database by omitting from PUT"
            (is (=? {:databases empty?}
                    (mt/user-http-request :crowberto :put 200
                                          (str "ee/workspace-manager/" ws-id)
                                          {:databases []})))))))))

(deftest metadata-export-test
  (testing "GET /:id/metadata/export streams metadata scoped to the workspace's databases + input"
    (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine :postgres :details {}}
                   :model/Table {t1-id :id} {:db_id db-id :schema "schema-1" :name "table-1" :active true}
                   :model/Table {t2-id :id} {:db_id db-id :schema "schema-2" :name "table-2" :active true}
                   :model/Field {f1-id :id} {:table_id t1-id :name "field-1" :active true
                                             :base_type :type/Integer :database_type "BIGINT"}
                   :model/Field _           {:table_id t2-id :name "field-2" :active true
                                             :base_type :type/Text :database_type "TEXT"}
                   :model/Workspace         {ws-id :id} {:name       "Export"
                                                         :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _          {:workspace_id     ws-id
                                                        :database_id      db-id
                                                        :database_details {}
                                                        :output_schema    ""
                                                        ;; schema-2 is deliberately excluded
                                                        :input            [{:schema "schema-1"}]
                                                        :status           :provisioned}]
      ;; Only schema-1's table + field are kept; schema-2's are excluded entirely.
      ;; Length mismatch in any section would fail `=?` — that's how we assert the
      ;; schema filter is doing its job.
      (is (=? {:databases [{:id db-id :name db-name :engine "postgres"}]
               :tables    [{:id t1-id :db_id db-id :name "table-1" :schema "schema-1"}]
               :fields    [{:id f1-id :table_id t1-id :name "field-1" :base_type "type/Integer"}]}
              (mt/user-http-request :crowberto :get 202
                                    (str "ee/workspace-manager/" ws-id "/metadata/export")
                                    :with-databases true
                                    :with-tables    true
                                    :with-fields    true))))))

(defmacro ^:private with-data-analyst [& body]
  `(perms.test-util/with-data-analyst-role! (mt/user->id :rasta) ~@body))

(defmacro ^:private with-workspaces-perm [db-id & body]
  `(perms.test-util/with-db-perm-for-group! (perms/all-users-group) ~db-id
     :perms/workspaces :yes
     ~@body))

(deftest get-endpoints-use-workspace-can-read?-test
  (testing "GET /, GET /:id, and GET /:id/metadata/export dispatch through `Workspace.can-read?` — Data Analyst alone passes"
    (mt/with-temp [:model/Workspace {ws-id :id} {}]
      (with-data-analyst
        (mt/user-http-request :rasta :get 200 "ee/workspace-manager/")
        (mt/user-http-request :rasta :get 200 (str "ee/workspace-manager/" ws-id))
        (mt/user-http-request :rasta :get 202
                              (str "ee/workspace-manager/" ws-id "/metadata/export"))))))

(deftest post-workspace-uses-workspace-can-create?-test
  (testing "POST / dispatches through `Workspace.can-create?` — Data Analyst alone is rejected; granting `:perms/workspaces` on any DB lets the call through"
    (mt/with-model-cleanup [:model/Workspace]
      (with-data-analyst
        (mt/user-http-request :rasta :post 403 "ee/workspace-manager/" {:name "Nope"})
        (with-workspaces-perm (mt/id)
          (is (=? {:name "OK"}
                  (mt/user-http-request :rasta :post 200 "ee/workspace-manager/" {:name "OK"}))))))))

(deftest workspace-write-endpoints-use-workspace-can-write?-test
  (testing "PUT /:id, DELETE /:id, and GET /:id/config dispatch through `Workspace.can-write?` — Data Analyst alone is rejected (rules out `can-read?`); granting `:perms/workspaces` on any DB lets the call through"
    (mt/with-temp [:model/Workspace {ws-id :id} {}]
      (with-data-analyst
        (mt/user-http-request :rasta :put 403 (str "ee/workspace-manager/" ws-id) {:name "Nope"})
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id "/config"))
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/" ws-id))
        (with-workspaces-perm (mt/id)
          (mt/user-http-request :rasta :put 200 (str "ee/workspace-manager/" ws-id) {:name "OK"})
          (mt/user-http-request :rasta :get 200 (str "ee/workspace-manager/" ws-id "/config"))
          (mt/user-http-request :rasta :delete 200 (str "ee/workspace-manager/" ws-id)))))))

(deftest put-databases-uses-workspace-can-write?-test
  (testing "PUT /:id with :databases dispatches through `Workspace.can-write?`"
    (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
      (mt/with-temp [:model/Database  {db-id :id} {}
                     :model/Workspace {ws-id :id} {}]
        (with-data-analyst
          (testing "Data Analyst without :perms/workspaces is rejected"
            (mt/user-http-request :rasta :put 403
                                  (str "ee/workspace-manager/" ws-id)
                                  {:databases [{:database_id db-id :input [{:schema "PUBLIC"}]}]}))
          (with-workspaces-perm db-id
            (testing "Data Analyst with :perms/workspaces can sync databases"
              (is (=? {:databases [{:database_id db-id :status "provisioned"}]}
                      (mt/user-http-request :rasta :put 200
                                            (str "ee/workspace-manager/" ws-id)
                                            {:databases [{:database_id db-id
                                                          :input [{:schema "PUBLIC"}]}]}))))))))))
