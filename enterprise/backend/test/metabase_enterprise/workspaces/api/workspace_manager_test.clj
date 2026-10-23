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

(deftest create-workspace-defaults-to-enabled-databases-test
  (testing "POST / without database_ids attaches every database with workspaces enabled"
    (mt/with-temp [:model/Database {enabled-1-id :id} {:engine   :postgres
                                                       :details  {}
                                                       :settings {:database-enable-workspaces true}}
                   :model/Database {enabled-2-id :id} {:engine   :postgres
                                                       :details  {}
                                                       :settings {:database-enable-workspaces true}}
                   :model/Database _ {:engine :postgres :details {}}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (is (=? {:databases [{:database_id enabled-1-id :status "provisioned"}
                               {:database_id enabled-2-id :status "provisioned"}]}
                  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                        {:name "All enabled"})))))))
  (testing "POST / without database_ids is rejected when no database has workspaces enabled"
    (mt/with-temp [:model/Database _ {:engine :postgres :details {}}]
      (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/"
                            {:name "Nope"}))))

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

(deftest download-config-unreadable-ssl-root-cert-test
  (testing "GET /:id/config answers 409 naming the database when its SSL root certificate can't be read"
    (mt/with-temp [:model/Database {db-id :id} {:name    "Cert DW" :engine :postgres
                                                :details {:ssl                   true
                                                          :ssl-root-cert-options "local"
                                                          :ssl-root-cert-path    "/nonexistent/fe103/root.crt"}}
                   :model/Workspace {ws-id :id} {:name "Cert WS"}
                   :model/WorkspaceDatabase _ {:workspace_id     ws-id
                                               :database_id      db-id
                                               :database_details {}
                                               :output_namespace ""
                                               :input_schemas    ["public"]
                                               :status           :provisioned}]
      (is (= "The SSL root certificate of database \"Cert DW\" can't be read on this instance"
             (mt/user-http-request :crowberto :get 409 (str "ee/workspace-manager/" ws-id "/config")))))))

(deftest download-metadata-endpoint-test
  (testing "GET /:id/metadata returns table_metadata.json for the workspace's input schemas"
    (mt/with-temp [:model/Database {db-id :id} {:name "Meta DW" :engine :postgres :details {}}
                   :model/Database {other-db-id :id} {:engine :postgres :details {}}
                   :model/Table {orders-id :id} {:db_id db-id :schema "shop" :name "orders" :description "One row per order"}
                   :model/Table {people-id :id} {:db_id db-id :schema "shop" :name "people"}
                   :model/Table _ {:db_id db-id :schema "shop" :name "retired" :active false}
                   :model/Table _ {:db_id db-id :schema "shop" :name "hidden" :visibility_type :hidden}
                   :model/Table _ {:db_id db-id :schema "staging" :name "orders_raw"}
                   :model/Table _ {:db_id other-db-id :schema "shop" :name "elsewhere"}
                   :model/Field {people-pk :id} {:table_id people-id :name "id" :base_type :type/BigInteger
                                                 :database_type "int8" :semantic_type :type/PK}
                   :model/Field {fk-id :id} {:table_id orders-id :name "person_id" :base_type :type/BigInteger
                                             :database_type "int8" :semantic_type :type/FK
                                             :fk_target_field_id people-pk}
                   :model/Field {created-id :id} {:table_id orders-id :name "created_at" :base_type :type/Text
                                                  :database_type "text" :effective_type :type/DateTime
                                                  :coercion_strategy :Coercion/ISO8601->DateTime}
                   :model/Field _ {:table_id orders-id :name "card_number" :base_type :type/Text
                                   :visibility_type :sensitive}
                   :model/Field _ {:table_id orders-id :name "dropped" :base_type :type/Text :active false}
                   :model/Field _ {:table_id orders-id :name "internal_note" :base_type :type/Text
                                   :visibility_type :hidden}
                   :model/Field _ {:table_id orders-id :name "legacy_code" :base_type :type/Text
                                   :visibility_type :retired}
                   :model/Workspace {ws-id :id} {:name "Meta WS"}
                   :model/WorkspaceDatabase _ {:workspace_id     ws-id
                                               :database_id      db-id
                                               :database_details {}
                                               :output_namespace ""
                                               :input_schemas    ["shop"]
                                               :status           :provisioned}]
      (t2/update! :model/Field fk-id {:description "Who placed the order"})
      (is (= {:databases [{:id db-id :name "Meta DW" :engine "postgres"}]
              :tables    [{:id orders-id :db_id db-id :schema "shop" :name "orders" :description "One row per order"}
                          {:id people-id :db_id db-id :schema "shop" :name "people"}]
              :fields    [{:id people-pk :table_id people-id :name "id" :base_type "type/BigInteger"
                           :database_type "int8" :semantic_type "type/PK"}
                          {:id fk-id :table_id orders-id :name "person_id" :base_type "type/BigInteger"
                           :database_type "int8" :semantic_type "type/FK" :fk_target_field_id people-pk
                           :description "Who placed the order"}
                          {:id created-id :table_id orders-id :name "created_at" :base_type "type/Text" :database_type "text"
                           :effective_type "type/DateTime" :coercion_strategy "Coercion/ISO8601->DateTime"}]}
             (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id "/metadata"))))
      (testing "a database with no input schemas contributes no tables"
        (mt/with-temp [:model/Workspace {empty-ws-id :id} {:name "Empty WS"}
                       :model/WorkspaceDatabase _ {:workspace_id     empty-ws-id
                                                   :database_id      db-id
                                                   :database_details {}
                                                   :output_namespace ""
                                                   :input_schemas    []
                                                   :status           :provisioned}]
          (is (= {:databases [{:id db-id :name "Meta DW" :engine "postgres"}]
                  :tables    []
                  :fields    []}
                 (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" empty-ws-id "/metadata"))))))
      (testing "404 for a missing workspace"
        (mt/user-http-request :crowberto :get 404 "ee/workspace-manager/13371337/metadata")))))

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
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id "/metadata"))
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/" ws-id))))))
