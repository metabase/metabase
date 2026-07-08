(ns metabase-enterprise.workspaces.instances-test
  "Tests for the connected child-instance registry: the
   `/api/ee/workspace-manager/instance` CRUD + test-connection endpoints,
   workspace↔instance assignment, and pushing a workspace config to a child."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.client :as ws.client]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
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

(deftest instance-crud-test
  (mt/with-model-cleanup [:model/WorkspaceInstance]
    (testing "POST /instance registers a child instance; the API key is never sent back"
      (let [{instance-id :id :as instance}
            (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance"
                                  {:name "Dev child" :url "https://child.example.com" :api_key "mb_secret"})]
        (is (=? {:id           pos-int?
                 :name         "Dev child"
                 :url          "https://child.example.com"
                 :workspace_id nil
                 :initialized_at nil}
                instance))
        (is (not (contains? instance :details)))
        (is (not (contains? instance :api_key)))
        (testing "the key is stored (encrypted-json details)"
          (is (= {:api-key "mb_secret"}
                 (t2/select-one-fn :details :model/WorkspaceInstance :id instance-id))))
        (testing "GET /instance lists it, again without credentials"
          (let [instances (mt/user-http-request :crowberto :get 200 "ee/workspace-manager/instance")]
            (is (=? [{:id instance-id :name "Dev child"}] instances))
            (is (not-any? #(contains? % :details) instances))))
        (testing "PUT /instance/:id updates name/url; omitting api_key keeps the stored one"
          (is (=? {:id instance-id :name "Renamed" :url "https://child2.example.com"}
                  (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/instance/" instance-id)
                                        {:name "Renamed" :url "https://child2.example.com"})))
          (is (= {:api-key "mb_secret"}
                 (t2/select-one-fn :details :model/WorkspaceInstance :id instance-id))))
        (testing "PUT /instance/:id with api_key replaces the stored key"
          (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/instance/" instance-id)
                                {:api_key "mb_rotated"})
          (is (= {:api-key "mb_rotated"}
                 (t2/select-one-fn :details :model/WorkspaceInstance :id instance-id))))
        (testing "DELETE /instance/:id disconnects it"
          (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/instance/" instance-id))
          (is (not (t2/exists? :model/WorkspaceInstance :id instance-id))))))))

(deftest instance-endpoints-require-superuser-test
  (mt/with-temp [:model/WorkspaceInstance {instance-id :id} {:name    "Locked"
                                                             :url     "https://child.example.com"
                                                             :details {:api-key "mb_secret"}}]
    (doseq [[method url body] [[:get "ee/workspace-manager/instance" nil]
                               [:post "ee/workspace-manager/instance" {:name "X" :url "https://x" :api_key "k"}]
                               [:put (str "ee/workspace-manager/instance/" instance-id) {:name "X"}]
                               [:delete (str "ee/workspace-manager/instance/" instance-id) nil]
                               [:post "ee/workspace-manager/instance/test" {:url "https://x" :api_key "k"}]]]
      (testing (str method " " url)
        (is (= "You don't have permissions to do that."
               (if body
                 (mt/user-http-request :rasta method 403 url body)
                 (mt/user-http-request :rasta method 403 url))))))))

(deftest workspace-instance-assignment-test
  (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                              :details  {}
                                              :settings {:database-enable-workspaces true}}]
    (mt/with-model-cleanup [:model/Workspace :model/WorkspaceInstance]
      (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
        (let [{i1 :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance"
                                             {:name "One" :url "https://one.example.com" :api_key "k1"})
              {i2 :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance"
                                             {:name "Two" :url "https://two.example.com" :api_key "k2"})]
          (testing "POST / with instance_id assigns the instance and hydrates it in the response"
            (let [{ws-id :id :as ws} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                           {:name         "Assigned"
                                                            :database_ids [db-id]
                                                            :instance_id  i1})]
              (is (=? {:instance {:id i1 :name "One" :url "https://one.example.com"}} ws))
              (is (= ws-id (t2/select-one-fn :workspace_id :model/WorkspaceInstance :id i1)))
              (testing "a taken instance is refused with a 409 before any workspace is created"
                (let [before (t2/count :model/Workspace)]
                  (mt/user-http-request :crowberto :post 409 "ee/workspace-manager/"
                                        {:name "Clash" :database_ids [db-id] :instance_id i1})
                  (is (= before (t2/count :model/Workspace)))))
              (testing "a missing instance 404s"
                (mt/user-http-request :crowberto :post 404 "ee/workspace-manager/"
                                      {:name "Ghost" :database_ids [db-id] :instance_id Integer/MAX_VALUE}))
              (testing "PUT /:id reassigns to a free instance"
                (is (=? {:instance {:id i2}}
                        (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/" ws-id)
                                              {:instance_id i2})))
                (is (nil? (t2/select-one-fn :workspace_id :model/WorkspaceInstance :id i1)))
                (is (= ws-id (t2/select-one-fn :workspace_id :model/WorkspaceInstance :id i2))))
              (testing "PUT /:id with a nil instance_id releases the instance"
                (is (=? {:instance nil}
                        (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/" ws-id)
                                              {:instance_id nil})))
                (is (nil? (t2/select-one-fn :workspace_id :model/WorkspaceInstance :id i2))))
              (testing "deleting a workspace frees its instance"
                (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/" ws-id)
                                      {:instance_id i1})
                (mt/user-http-request :crowberto :delete 200 (str "ee/workspace-manager/" ws-id))
                (is (nil? (t2/select-one-fn :workspace_id :model/WorkspaceInstance :id i1)))
                (is (t2/exists? :model/WorkspaceInstance :id i1))))))))))

(deftest test-connection-endpoint-test
  (mt/with-temp [:model/WorkspaceInstance {instance-id :id} {:name    "Stored"
                                                             :url     "https://stored.example.com"
                                                             :details {:api-key "mb_stored"}}]
    (let [calls (atom [])]
      (with-redefs [ws.client/test-connection (fn [params]
                                                (swap! calls conj params)
                                                {:ok true})]
        (testing "url + api_key are passed through for unsaved form values"
          (is (= {:ok true}
                 (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance/test"
                                       {:url "https://new.example.com" :api_key "mb_new"})))
          (is (= {:url "https://new.example.com" :api-key "mb_new"} (last @calls))))
        (testing "id fills in stored credentials for whatever is omitted"
          (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance/test"
                                {:id instance-id})
          (is (= {:url "https://stored.example.com" :api-key "mb_stored"} (last @calls)))
          (testing "an edited url is checked against the stored key"
            (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance/test"
                                  {:id instance-id :url "https://edited.example.com"})
            (is (= {:url "https://edited.example.com" :api-key "mb_stored"} (last @calls))))))
      (with-redefs [ws.client/test-connection (fn [_] {:ok false :message "nope"})]
        (testing "failures are reported in the body, not as an HTTP error"
          (is (= {:ok false :message "nope"}
                 (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance/test"
                                       {:url "https://down.example.com" :api_key "k"}))))))))

(deftest push-config-test
  (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                              :details  {}
                                              :settings {:database-enable-workspaces true}}]
    (mt/with-model-cleanup [:model/Workspace :model/WorkspaceInstance]
      (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
        (let [{instance-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/instance"
                                                      {:name    "Target"
                                                       :url     "https://target.example.com"
                                                       :api_key "mb_target"})
              {ws-id :id}       (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                      {:name         "Pushed"
                                                       :database_ids [db-id]
                                                       :instance_id  instance-id})
              pushed            (atom nil)]
          (testing "POST /:id/push-config uploads the config to the assigned instance"
            (with-redefs [ws.client/push-config! (fn [target yaml]
                                                   (reset! pushed {:target target :yaml yaml})
                                                   {:ok true})]
              (is (=? {:id instance-id :initialized_at some?}
                      (mt/user-http-request :crowberto :post 200
                                            (str "ee/workspace-manager/" ws-id "/push-config"))))
              (is (= {:url "https://target.example.com" :api-key "mb_target"} (:target @pushed)))
              (is (re-find #"workspace:" (:yaml @pushed)))
              (is (some? (t2/select-one-fn :initialized_at :model/WorkspaceInstance :id instance-id)))))
          (testing "a child failure surfaces as a 502 and does not stamp initialized_at"
            (t2/update! :model/WorkspaceInstance :id instance-id {:initialized_at nil})
            (with-redefs [ws.client/push-config! (fn [_ _] {:ok false :message "child said no"})]
              (mt/user-http-request :crowberto :post 502 (str "ee/workspace-manager/" ws-id "/push-config"))
              (is (nil? (t2/select-one-fn :initialized_at :model/WorkspaceInstance :id instance-id)))))
          (testing "a workspace without an assigned instance 400s"
            (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/" ws-id)
                                  {:instance_id nil})
            (mt/user-http-request :crowberto :post 400 (str "ee/workspace-manager/" ws-id "/push-config"))))))))
