(ns metabase-enterprise.workspaces.api.workspace-manager-test
  "HTTP smoke tests for the workspace-manager API. Permission rules are exercised at the
   model level — see workspace_test.clj and workspace_database_test.clj. These tests just
   verify routing, request/response shape, and that the model-level permission predicates
   are wired into the endpoints (one 403 spot-check is enough)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.secret :as u.secret]
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

(deftest create-workspace-user-named-target-branch-test
  (testing "POST / with target_branch uses it verbatim; a second workspace targeting the same branch 409s"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (is (=? {:target_branch "my-feature-branch"}
                  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                        {:name          "Named Branch"
                                         :database_ids  [db-id]
                                         :target_branch "my-feature-branch"})))
          (testing "same branch again -> 409"
            (mt/user-http-request :crowberto :post 409 "ee/workspace-manager/"
                                  {:name          "Named Branch Two"
                                   :database_ids  [db-id]
                                   :target_branch "my-feature-branch"}))
          (testing "collision with an auto-named branch also 409s"
            (let [{:keys [target_branch]} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                                {:name "Auto Named" :database_ids [db-id]})]
              (mt/user-http-request :crowberto :post 409 "ee/workspace-manager/"
                                    {:name          "Squatter"
                                     :database_ids  [db-id]
                                     :target_branch target_branch}))))))))

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
        (mt/user-http-request :rasta :get 403
                              (str "ee/workspace-manager/" ws-id "/metadata/export"))
        (mt/user-http-request :rasta :post 403 "ee/workspace-manager/"
                              {:name "Nope" :database_ids [(mt/id)]})
        (mt/user-http-request :rasta :put 403 (str "ee/workspace-manager/" ws-id) {:name "Nope"})
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id "/config"))
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/" ws-id))))))

;;; ------------------------------------------- HM spawn orchestration -------------------------------------------

(defn- fake-hm
  "Stub hm.client/make-request. Records every call in `calls` (an atom of vectors)
   and answers create/delete against an in-memory HM."
  [calls & {:keys [create-response]}]
  (fn [method url & [body]]
    (swap! calls conj [method url body])
    (cond
      (and (= method :post) (= url "/api/v2/mb/workspaces/instances"))
      (or create-response
          [:ok {:status 200 :body {:id "hm-ws-1" :url "https://tutty-fruity.metabaseapp.com" :status "active"}}])

      (= method :delete)
      [:ok {:status 204 :body nil}]

      :else
      [:error {:status 404 :body nil}])))

(deftest create-with-spawn-instance-test
  (testing "POST with spawn_instance=true mints the key, ships config.yml to HM, records the instance"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [calls (atom [])]
          (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)
                        hm.client/make-request               (fake-hm calls)]
            (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                           {:name "Spawned" :database_ids [db-id] :spawn_instance true})]
              (testing "response carries the child url + the api key (only time it is returned)"
                (is (= "https://tutty-fruity.metabaseapp.com" (:url ws)))
                (is (re-matches #"mb_[A-Za-z0-9+/=]+" (:api_key ws))))
              (testing "workspace row records hm instance id, url, and key prefix"
                (is (=? {:hm_instance_id "hm-ws-1"
                         :instance_url   "https://tutty-fruity.metabaseapp.com"
                         :api_key_prefix (subs (:api_key ws) 0 7)}
                        (t2/select-one :model/Workspace :id (:id ws)))))
              (testing "HM create request shape"
                (let [[method url body] (first @calls)]
                  (is (= :post method))
                  (is (= "/api/v2/mb/workspaces/instances" url))
                  (is (true? (:blocking body)))
                  (is (= (:id ws) (get-in body [:metadata :workspace-id])))
                  (testing "config.yml rides the POST as a Secret (redacts in logs) and includes the api-keys section with the minted key"
                    (is (u.secret/secret? (:config-yml body)))
                    (let [yaml (u.secret/expose (:config-yml body))]
                      (is (str/includes? yaml "api-keys"))
                      (is (str/includes? yaml (:api_key ws)))))))
              (testing "GET returns the child url but never the key"
                (let [fetched (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" (:id ws)))]
                  (is (= "https://tutty-fruity.metabaseapp.com" (:url fetched)))
                  (is (not (contains? fetched :api_key)))))
              (testing "DELETE tears down warehouse then calls HM delete"
                (is (=? {:deleted true}
                        (mt/user-http-request :crowberto :delete 200 (str "ee/workspace-manager/" (:id ws)))))
                (let [[method url] (last @calls)]
                  (is (= :delete method))
                  (is (= "/api/v2/mb/workspaces/instances/hm-ws-1" url)))))))))))

(deftest create-spawn-instance-hm-failure-test
  (testing "HM refusal -> 502; the provisioned workspace survives for retry/delete"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [calls (atom [])]
          (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)
                        hm.client/make-request               (fake-hm calls :create-response
                                                                      [:error {:status 500 :body {:error "boom"}}])]
            (mt/user-http-request :crowberto :post 502 "ee/workspace-manager/"
                                  {:name "Doomed" :database_ids [db-id] :spawn_instance true})
            (testing "workspace row still exists, no instance recorded"
              (is (=? {:hm_instance_id nil :instance_url nil}
                      (t2/select-one :model/Workspace :name "Doomed"))))))))))

(deftest create-without-spawn-unchanged-test
  (testing "spawn_instance omitted -> no HM call, no key minted"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [calls (atom [])]
          (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)
                        hm.client/make-request               (fake-hm calls)]
            (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                           {:name "Plain" :database_ids [db-id]})]
              (is (not (contains? ws :api_key)))
              (is (not (contains? ws :url)))
              (is (empty? @calls))
              (is (nil? (t2/select-one-fn :api_key_prefix :model/Workspace :id (:id ws)))))))))))
