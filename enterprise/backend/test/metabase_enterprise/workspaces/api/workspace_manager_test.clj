(ns ^:synchronous metabase-enterprise.workspaces.api.workspace-manager-test
  "HTTP smoke tests for the workspace-manager API. Permission rules are exercised at the
   model level — see workspace_test.clj and workspace_database_test.clj. These tests just
   verify routing, request/response shape, and that the model-level permission predicates
   are wired into the endpoints (one 403 spot-check is enough).

   A `use-fixtures`-installed `with-redefs` (hence `^:synchronous`) replaces the
   real DatabaseProvisioner and InstanceProvisioner with stubs and makes the
   `/provision`/`/deprovision` background execution synchronous, so responses
   already reflect the final status; individual tests override the provisioners
   with their own reify via an inner `with-redefs`."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.provisioning.database :as provisioning.database]
   [metabase-enterprise.workspaces.provisioning.instance :as provisioning.instance]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.jvm :as u.jvm]
   [toucan2.core :as t2]))

(defn- stub-database-provisioner []
  (reify provisioning.database/DatabaseProvisioner
    (details [_ _ _ _]
      {:schema "mb_iso_stub" :database_details {:user "stub_user" :password "stub_pass"}})
    (init! [_ _ _ _] nil)
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ _ _] nil)))

(defn- stub-instance-provisioner []
  (reify provisioning.instance/InstanceProvisioner
    (create! [_ _workspace _config]
      {:id (str (random-uuid)) :url "https://example.com" :status :running})
    (fetch [_ instance-id]
      {:id instance-id :url "https://example.com" :status :running})
    (delete! [_ _instance-id] nil)))

(use-fixtures :once
  (fixtures/initialize :db)
  (fn [thunk]
    (mt/with-premium-features #{:workspaces}
      (with-redefs [provisioning.database/database-provisioner (stub-database-provisioner)
                    provisioning.instance/instance-provisioner (stub-instance-provisioner)
                    u.jvm/run-in-virtual-thread                (fn [work]
                                                                 (try (work) (catch Throwable _))
                                                                 nil)]
        (thunk)))))

(deftest crud-smoke-test
  (testing "create, get, list, delete round-trip — no provisioning involved"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [{ws-id :id :as ws} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                       {:name "Smoke Test" :database_ids [db-id]})]
          (is (=? {:id             pos-int?
                   :name           "Smoke Test"
                   :status         "unprovisioned"
                   :status_details nil
                   :databases      [{:database_id db-id
                                     :status      "unprovisioned"}]
                   :creator        some?}
                  ws)
              "POST only creates rows; everything starts :unprovisioned")
          (testing "get"
            (is (=? {:id ws-id :name "Smoke Test" :status "unprovisioned"}
                    (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id)))))
          (testing "list"
            (is (=? [{:id ws-id}]
                    (mt/user-http-request :crowberto :get 200 "ee/workspace-manager/"))))
          (testing "delete"
            (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id))
            (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id))))))))

(deftest create-workspace-validation-test
  (testing "POST / validates the attached databases without creating anything"
    (mt/with-temp [:model/Database {eligible-id :id} {:engine   :postgres
                                                      :details  {}
                                                      :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id eligible-id :schema "public" :active true}
                   :model/Table _ {:db_id eligible-id :schema "analytics" :active true}
                   :model/Database {ineligible-id :id} {:engine :postgres :details {}}]
      (mt/with-model-cleanup [:model/Workspace]
        (is (=? {:status    "unprovisioned"
                 :databases [{:database_id   eligible-id
                              :input_schemas ["analytics" "public"]
                              :status        "unprovisioned"}]}
                (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                      {:name "With dbs" :database_ids [eligible-id]}))
            "input_schemas are filled from the database's known schemas")
        (testing "an ineligible database is rejected"
          (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/"
                                {:name "Nope" :database_ids [ineligible-id]}))
        (testing "a missing database is rejected"
          (mt/user-http-request :crowberto :post 404 "ee/workspace-manager/"
                                {:name "Nope" :database_ids [Integer/MAX_VALUE]}))
        (testing "at least one database is required"
          (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/"
                                {:name "Nope" :database_ids []}))))))

(deftest provision-endpoint-test
  (testing "POST /:id/provision provisions the databases and drives the workspace status"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                {:name "To provision" :database_ids [db-id]})]
          (is (=? {:status "database-provisioning"}
                  (mt/user-http-request :crowberto :post 200
                                        (str "ee/workspace-manager/" ws-id "/provision")))
              "the response reflects the just-started run")
          (is (=? {:status         "provisioned"
                   :status_details nil
                   :instance_url   "https://example.com"
                   :databases      [{:status           "provisioned"
                                     :output_namespace "mb_iso_stub"}]}
                  (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id)))
              "the stub instance provisioner's url is exposed once the run finishes")
          (testing "404 for a missing workspace"
            (mt/user-http-request :crowberto :post 404 "ee/workspace-manager/13371337/provision")))))))

(deftest provision-endpoint-failure-and-retry-test
  (testing "a provisioning failure lands in the statuses and a retry finishes the job"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                {:name "Flaky" :database_ids [db-id]})
              boom        (reify provisioning.database/DatabaseProvisioner
                            (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {}})
                            (init!    [_ _ _ _]   (throw (ex-info "boom" {})))
                            (grant!   [_ _ _ _ _] nil)
                            (destroy! [_ _ _ _]   nil))]
          (with-redefs [provisioning.database/database-provisioner boom]
            (mt/user-http-request :crowberto :post 200 (str "ee/workspace-manager/" ws-id "/provision"))
            (is (=? {:status         "database-provisioning-failure"
                     :status_details "boom"
                     :databases      [{:status         "provisioning-failure"
                                       :status_details "boom"}]}
                    (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id)))))
          (testing "retrying with a healthy warehouse succeeds"
            (mt/user-http-request :crowberto :post 200 (str "ee/workspace-manager/" ws-id "/provision"))
            (is (=? {:status         "provisioned"
                     :status_details nil}
                    (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id))))))))))

(deftest deprovision-endpoint-test
  (testing "POST /:id/deprovision tears the databases down and unblocks DELETE"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                {:name "Round trip" :database_ids [db-id]})]
          (mt/user-http-request :crowberto :post 200 (str "ee/workspace-manager/" ws-id "/provision"))
          (testing "DELETE refuses while a database is :provisioned"
            (mt/user-http-request :crowberto :delete 400 (str "ee/workspace-manager/" ws-id))
            (is (t2/exists? :model/Workspace :id ws-id)))
          (is (=? {:status "instance-deprovisioning"}
                  (mt/user-http-request :crowberto :post 200
                                        (str "ee/workspace-manager/" ws-id "/deprovision")))
              "the response reflects the just-started run")
          (is (=? {:status         "unprovisioned"
                   :status_details nil
                   :instance_url   nil
                   :databases      [{:status           "unprovisioned"
                                     :output_namespace ""}]}
                  (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id))))
          (testing "DELETE works once everything is :unprovisioned"
            (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id))
            (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id))))))))

(deftest provision-refused-while-in-flight-test
  (testing "POST /:id/provision and /:id/deprovision 400 while a run is already in flight"
    (doseq [in-flight-status [:database-provisioning :instance-provisioning
                              :instance-deprovisioning :database-deprovisioning]]
      (testing (str "workspace status " in-flight-status)
        (mt/with-temp [:model/Workspace {ws-id :id} {:name "Busy" :status in-flight-status}]
          (mt/user-http-request :crowberto :post 400 (str "ee/workspace-manager/" ws-id "/provision"))
          (mt/user-http-request :crowberto :post 400 (str "ee/workspace-manager/" ws-id "/deprovision"))
          (mt/user-http-request :crowberto :delete 400 (str "ee/workspace-manager/" ws-id))
          (is (= in-flight-status (t2/select-one-fn :status :model/Workspace :id ws-id))
              "the in-flight status is untouched"))))
    (testing "provision 400s when already :provisioned, deprovision when already :unprovisioned"
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "Done" :status :provisioned}]
        (mt/user-http-request :crowberto :post 400 (str "ee/workspace-manager/" ws-id "/provision"))
        (is (= :provisioned (t2/select-one-fn :status :model/Workspace :id ws-id))))
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "Empty" :status :unprovisioned}]
        (mt/user-http-request :crowberto :post 400 (str "ee/workspace-manager/" ws-id "/deprovision"))
        (is (= :unprovisioned (t2/select-one-fn :status :model/Workspace :id ws-id)))))
    (testing "the settled failure statuses stay retryable"
      (doseq [settled-status [:database-provisioning-failure :instance-provisioning-failure
                              :instance-deprovisioning-failure :database-deprovisioning-failure]]
        (mt/with-temp [:model/Workspace {ws-id :id} {:name "Settled" :status settled-status}]
          (mt/user-http-request :crowberto :post 200 (str "ee/workspace-manager/" ws-id "/provision"))
          (is (= :provisioned (t2/select-one-fn :status :model/Workspace :id ws-id)))
          (mt/user-http-request :crowberto :post 200 (str "ee/workspace-manager/" ws-id "/deprovision"))
          (is (= :unprovisioned (t2/select-one-fn :status :model/Workspace :id ws-id))))))))

(deftest rename-workspace-test
  (testing "PUT /:id renames a workspace and returns the updated WorkspaceResponse"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Before"}]
      (is (=? {:id ws-id :name "After"}
              (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/" ws-id) {:name "After"})))
      (is (= "After" (t2/select-one-fn :name :model/Workspace :id ws-id)))
      (testing "404 for a missing id"
        (mt/user-http-request :crowberto :put 404 "ee/workspace-manager/13371337" {:name "X"})))))

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
        (mt/user-http-request :rasta :post 403 (str "ee/workspace-manager/" ws-id "/provision"))
        (mt/user-http-request :rasta :post 403 (str "ee/workspace-manager/" ws-id "/deprovision"))
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/" ws-id))))))
