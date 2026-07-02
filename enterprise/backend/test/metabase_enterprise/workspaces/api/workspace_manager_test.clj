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
    (init! [_ _ _ _]
      {:schema "mb_iso_stub" :database_details {:user "stub_user" :password "stub_pass"}})
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
              (is (=? {:id ws-id :deleted true}
                      (mt/user-http-request :crowberto :delete 200 (str "ee/workspace-manager/" ws-id))))
              (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id)))))))))

(deftest delete-workspace-pending-databases-test
  (testing "DELETE refuses a workspace with a pending database unless ignore_pending=true"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                  {:name "Pending" :database_ids [db-id]})
                wsd-id      (t2/select-one-pk :model/WorkspaceDatabase :workspace_id ws-id)]
            (t2/update! :model/WorkspaceDatabase {:id wsd-id} {:status :provisioning})
            (testing "refused by default with a 409 listing the pending databases"
              (is (=? {:pending_databases [{:database_id db-id :status "provisioning"}]}
                      (mt/user-http-request :crowberto :delete 409 (str "ee/workspace-manager/" ws-id))))
              (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id)))
            (testing "ignore-pending=true deletes anyway"
              (is (=? {:id ws-id :deleted true}
                      (mt/user-http-request :crowberto :delete 200
                                            (str "ee/workspace-manager/" ws-id "?ignore-pending=true"))))
              (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id)))))))))

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
                                                        :output_namespace ""
                                                        ;; schema-2 is deliberately excluded
                                                        :input_schemas    ["schema-1"]
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

(deftest endpoints-are-superuser-only-test
  (testing "All workspace-manager endpoints reject non-superusers, even Data Analysts"
    (mt/with-temp [:model/Workspace {ws-id :id} {}]
      (with-data-analyst
        (mt/user-http-request :rasta :get 403 "ee/workspace-manager/")
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id))
        (mt/user-http-request :rasta :get 403
                              (str "ee/workspace-manager/" ws-id "/metadata/export"))
        (mt/user-http-request :rasta :post 403 "ee/workspace-manager/"
                              {:name "Nope" :database_ids [(mt/id)]})
        (mt/user-http-request :rasta :put 403 (str "ee/workspace-manager/" ws-id) {:name "Nope"})
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id "/config"))
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/" ws-id))))))
