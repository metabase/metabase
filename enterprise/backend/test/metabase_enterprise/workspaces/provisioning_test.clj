(ns ^:synchronous metabase-enterprise.workspaces.provisioning-test
  "Tests for the workspace provisioning lifecycle: [[provisioning/provision-workspace!]]
   and [[provisioning/deprovision-workspace!]] driving the workspace and
   workspace_database statuses. A `use-fixtures`-installed stub
   DatabaseProvisioner replaces the real driver-dispatching one for every test
   (hence `^:synchronous`); individual tests override it with their own reify
   via an inner `with-redefs`."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.provisioning.database :as provisioning.database]
   [metabase-enterprise.workspaces.provisioning.instance :as provisioning.instance]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private calls
  "init!/destroy! calls recorded by the default stub provisioner. Reset per test."
  (atom []))

(defn- stub-provisioner
  "DatabaseProvisioner that records init!/destroy! calls in [[calls]] and never
   touches a warehouse."
  []
  (reify provisioning.database/DatabaseProvisioner
    (details [_ _ _ workspace]
      {:schema (str "mb_iso_" (:id workspace)) :database_details {:user "stub_user"}})
    (init! [_ _ db _] (swap! calls conj [:init! (:id db)]) nil)
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ db _] (swap! calls conj [:destroy! (:id db)]) nil)))

(use-fixtures :each
  (fn [thunk]
    (reset! calls [])
    (with-redefs [provisioning.database/database-provisioner (stub-provisioner)]
      (thunk))))

(defn- failing-on
  "Like [[stub-provisioner]] but `op` (:init! or :destroy!) throws for database
   `db-id`."
  [op db-id]
  (reify provisioning.database/DatabaseProvisioner
    (details [_ _ _ workspace]
      {:schema (str "mb_iso_" (:id workspace)) :database_details {:user "stub_user"}})
    (init! [_ _ db _]
      (when (and (= op :init!) (= (:id db) db-id))
        (throw (ex-info "boom" {}))))
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ db _]
      (when (and (= op :destroy!) (= (:id db) db-id))
        (throw (ex-info "warehouse down" {}))))))

(defn- wsd-attrs [ws-id db-id]
  {:workspace_id     ws-id
   :database_id      db-id
   :database_details {}
   :output_namespace ""
   :input_schemas    ["public"]})

(defn- workspace-row [ws-id]
  (t2/select-one :model/Workspace :id ws-id))

(deftest provision-workspace-success-test
  (testing "provision-workspace! provisions every database and lands the workspace :provisioned"
    (mt/with-temp [:model/Database  {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd1-id :id} (wsd-attrs ws-id (mt/id))
                   :model/WorkspaceDatabase {wsd2-id :id} (wsd-attrs ws-id db2-id)]
      (is (nil? (provisioning/provision-workspace! (workspace-row ws-id))))
      (is (=? {:status         :provisioned
               :status_details nil
               :instance_id    string?
               :instance_url   "https://example.com"}
              (workspace-row ws-id))
          "the stub instance provisioner persisted the instance identifiers")
      (is (=? {:status           :provisioned
               :status_details   nil
               :output_namespace (str "mb_iso_" wsd1-id)
               :database_details {:user "stub_user"}}
              (t2/select-one :model/WorkspaceDatabase :id wsd1-id)))
      (is (=? {:status           :provisioned
               :output_namespace (str "mb_iso_" wsd2-id)}
              (t2/select-one :model/WorkspaceDatabase :id wsd2-id))))))

(deftest provision-workspace-failure-test
  (testing "the first database failure stops the run and records the error on the row and the workspace"
    (mt/with-temp [:model/Database  {db2-id :id} {:engine :h2 :details {}}
                   :model/Database  {db3-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd1-id :id} (wsd-attrs ws-id (mt/id))
                   :model/WorkspaceDatabase {wsd2-id :id} (wsd-attrs ws-id db2-id)
                   :model/WorkspaceDatabase {wsd3-id :id} (wsd-attrs ws-id db3-id)]
      (with-redefs [provisioning.database/database-provisioner (failing-on :init! db2-id)]
        (is (thrown-with-msg? ExceptionInfo #"boom"
                              (provisioning/provision-workspace! (workspace-row ws-id)))
            "the failure is rethrown"))
      (is (=? {:status      :database-provisioning-failure
               :status_details "boom"
               :instance_id nil}
              (workspace-row ws-id))
          "the instance phase is never reached after a database failure")
      (is (=? {:status :provisioned}
              (t2/select-one :model/WorkspaceDatabase :id wsd1-id))
          "the database provisioned before the failure stays :provisioned")
      (is (=? {:status :provisioning-failure :status_details "boom"}
              (t2/select-one :model/WorkspaceDatabase :id wsd2-id))
          "the failed database records the failure — no rollback")
      (is (=? {:status :unprovisioned}
              (t2/select-one :model/WorkspaceDatabase :id wsd3-id))
          "databases after the failure are not attempted"))))

(deftest provision-workspace-retry-test
  (testing "a retry after a failure skips already-:provisioned databases and finishes the job"
    (mt/with-temp [:model/Database  {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd1-id :id} (wsd-attrs ws-id (mt/id))
                   :model/WorkspaceDatabase {wsd2-id :id} (wsd-attrs ws-id db2-id)]
      (with-redefs [provisioning.database/database-provisioner (failing-on :init! db2-id)]
        (is (thrown-with-msg? ExceptionInfo #"boom"
                              (provisioning/provision-workspace! (workspace-row ws-id)))))
      (reset! calls [])
      (provisioning/provision-workspace! (workspace-row ws-id))
      (is (= [[:init! db2-id]] @calls)
          "only the previously-failed database is re-provisioned")
      (is (=? {:status :provisioned :status_details nil} (workspace-row ws-id)))
      (is (=? {:status :provisioned :status_details nil}
              (t2/select-one :model/WorkspaceDatabase :id wsd2-id))
          "the retried row ends :provisioned with its failure details cleared")
      (is (=? {:status :provisioned}
              (t2/select-one :model/WorkspaceDatabase :id wsd1-id))))))

(deftest provision-workspace-instance-failure-and-retry-test
  (testing "an instance-provisioning failure lands in :instance-provisioning-failure and a retry finishes"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id} (wsd-attrs ws-id (mt/id))]
      (with-redefs [provisioning.instance/instance-provisioner
                    (reify provisioning.instance/InstanceProvisioner
                      (create! [_ _ _] (throw (ex-info "no capacity" {})))
                      (delete! [_ _] nil))]
        (is (thrown-with-msg? ExceptionInfo #"no capacity"
                              (provisioning/provision-workspace! (workspace-row ws-id)))))
      (is (=? {:status         :instance-provisioning-failure
               :status_details "no capacity"
               :instance_id    nil}
              (workspace-row ws-id)))
      (is (=? {:status :provisioned}
              (t2/select-one :model/WorkspaceDatabase :id wsd-id))
          "the databases were provisioned before the instance phase failed")
      (testing "retry skips the already-provisioned databases and finishes the instance"
        (reset! calls [])
        (provisioning/provision-workspace! (workspace-row ws-id))
        (is (= [] @calls))
        (is (=? {:status :provisioned :status_details nil :instance_id string?}
                (workspace-row ws-id)))))))

(deftest deprovision-workspace-instance-failure-test
  (testing "an instance-deprovisioning failure lands in :instance-deprovisioning-failure and stops"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id} (wsd-attrs ws-id (mt/id))]
      (provisioning/provision-workspace! (workspace-row ws-id))
      (with-redefs [provisioning.instance/instance-provisioner
                    (reify provisioning.instance/InstanceProvisioner
                      (create! [_ _ _] {:id "x" :url "https://example.com"})
                      (delete! [_ _] (throw (ex-info "instance stuck" {}))))]
        (is (thrown-with-msg? ExceptionInfo #"instance stuck"
                              (provisioning/deprovision-workspace! (workspace-row ws-id)))))
      (is (=? {:status         :instance-deprovisioning-failure
               :status_details "instance stuck"
               :instance_id    string?}
              (workspace-row ws-id))
          "the instance identifiers are kept for the retry")
      (is (=? {:status :provisioned}
              (t2/select-one :model/WorkspaceDatabase :id wsd-id))
          "the database phase is never reached after an instance failure")
      (testing "retry once the instance is deletable"
        (provisioning/deprovision-workspace! (workspace-row ws-id))
        (is (=? {:status :unprovisioned :instance_id nil}
                (workspace-row ws-id)))))))

(deftest provision-instance-receives-workspace-config-test
  (testing "the instance provisioner receives the workspace's config-file map, incl. the :api-keys section"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name       "WS"
                                                 :api_key    "mb_test_key"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _ (assoc (wsd-attrs ws-id (mt/id))
                                                     :status           :provisioned
                                                     :output_namespace "mb_iso_x")]
      (let [received (atom nil)]
        (with-redefs [provisioning.instance/instance-provisioner
                      (reify provisioning.instance/InstanceProvisioner
                        (create! [_ _ config] (reset! received config) {:id "i" :url "https://example.com"})
                        (delete! [_ _] nil))]
          (provisioning/provision-workspace! (workspace-row ws-id)))
        (is (=? {:version 1
                 :config  {:api-keys  [{:name    string?
                                        :key     "mb_test_key"
                                        :creator (:email (mt/fetch-user :crowberto))
                                        :group   "admin"}]
                           :workspace {:name "WS"}}}
                @received)
            "create! received the config map with the workspace's API key registered")))))

(deftest workspace-provisioning?-and-deprovisioning?-test
  (testing "only the active phases count as in flight; the settled statuses do not"
    (letfn [(ws-with [status] {:id 1 :name "WS" :status status})]
      (doseq [provisioning-status [:database-provisioning :instance-provisioning]]
        (is (true? (provisioning/workspace-provisioning? (ws-with provisioning-status))) (str provisioning-status))
        (is (false? (provisioning/workspace-deprovisioning? (ws-with provisioning-status))) (str provisioning-status)))
      (doseq [deprovisioning-status [:instance-deprovisioning :database-deprovisioning]]
        (is (true? (provisioning/workspace-deprovisioning? (ws-with deprovisioning-status))) (str deprovisioning-status))
        (is (false? (provisioning/workspace-provisioning? (ws-with deprovisioning-status))) (str deprovisioning-status)))
      (doseq [settled-status [:unprovisioned :provisioned
                              :database-provisioning-failure :instance-provisioning-failure
                              :instance-deprovisioning-failure :database-deprovisioning-failure]]
        (is (false? (provisioning/workspace-provisioning? (ws-with settled-status))) (str settled-status))
        (is (false? (provisioning/workspace-deprovisioning? (ws-with settled-status))) (str settled-status))))))

(deftest provision-workspace-noop-when-provisioned-test
  (testing "provisioning a fully-provisioned workspace is a no-op"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase _ (assoc (wsd-attrs ws-id (mt/id))
                                                     :status           :provisioned
                                                     :output_namespace "mb_iso_x")]
      (provisioning/provision-workspace! (workspace-row ws-id))
      (is (= [] @calls) "no provisioner calls are made")
      (is (=? {:status :provisioned} (workspace-row ws-id))))))

(deftest deprovision-workspace-success-test
  (testing "deprovision-workspace! tears down every database and lands the workspace :unprovisioned"
    (mt/with-temp [:model/Database  {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd1-id :id} (wsd-attrs ws-id (mt/id))
                   :model/WorkspaceDatabase {wsd2-id :id} (wsd-attrs ws-id db2-id)]
      (provisioning/provision-workspace! (workspace-row ws-id))
      (reset! calls [])
      (is (nil? (provisioning/deprovision-workspace! (workspace-row ws-id))))
      (is (= [[:destroy! (mt/id)] [:destroy! db2-id]] @calls)
          "every database gets a warehouse teardown, in row order")
      (is (=? {:status         :unprovisioned
               :status_details nil
               :instance_id    nil
               :instance_url   nil}
              (workspace-row ws-id))
          "the instance identifiers are cleared")
      (doseq [wsd-id [wsd1-id wsd2-id]]
        (is (=? {:status           :unprovisioned
                 :status_details   nil
                 :output_namespace ""
                 :database_details {}}
                (t2/select-one :model/WorkspaceDatabase :id wsd-id))
            "the persisted warehouse identifiers are cleared")))))

(deftest deprovision-workspace-failure-and-retry-test
  (testing "a teardown failure records the error and a later retry finishes the job"
    (mt/with-temp [:model/Database  {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd1-id :id} (wsd-attrs ws-id (mt/id))
                   :model/WorkspaceDatabase {wsd2-id :id} (wsd-attrs ws-id db2-id)]
      (provisioning/provision-workspace! (workspace-row ws-id))
      (with-redefs [provisioning.database/database-provisioner (failing-on :destroy! (mt/id))]
        (is (thrown-with-msg? ExceptionInfo #"warehouse down"
                              (provisioning/deprovision-workspace! (workspace-row ws-id)))))
      (is (=? {:status :database-deprovisioning-failure :status_details "warehouse down"}
              (workspace-row ws-id)))
      (is (=? {:status :deprovisioning-failure :status_details "warehouse down"}
              (t2/select-one :model/WorkspaceDatabase :id wsd1-id)))
      (is (=? {:status :provisioned}
              (t2/select-one :model/WorkspaceDatabase :id wsd2-id))
          "databases after the failure are not attempted")
      (testing "retry once the warehouse is reachable"
        (provisioning/deprovision-workspace! (workspace-row ws-id))
        (is (=? {:status :unprovisioned :status_details nil} (workspace-row ws-id)))
        (doseq [wsd-id [wsd1-id wsd2-id]]
          (is (=? {:status :unprovisioned :status_details nil}
                  (t2/select-one :model/WorkspaceDatabase :id wsd-id))))))))

(deftest deprovision-workspace-noop-when-unprovisioned-test
  (testing "deprovisioning an :unprovisioned workspace is a no-op"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase _ (wsd-attrs ws-id (mt/id))]
      (provisioning/deprovision-workspace! (workspace-row ws-id))
      (is (= [] @calls) "no provisioner calls are made")
      (is (=? {:status :unprovisioned} (workspace-row ws-id))))))

(deftest deprovision-recomputes-identifiers-for-crashed-provisioning-row-test
  (testing "a crashed :provisioning row that never persisted its identifiers is torn down
            with identifiers recomputed via the provisioner's `details`"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id} (assoc (wsd-attrs ws-id (mt/id))
                                                                :status :provisioning)]
      (let [destroyed (atom nil)
            recording (reify provisioning.database/DatabaseProvisioner
                        (details [_ _ _ workspace]
                          {:schema (str "mb_iso_" (:id workspace)) :database_details {:user "recomputed"}})
                        (init! [_ _ _ _] nil)
                        (grant! [_ _ _ _ _] nil)
                        (destroy! [_ _ _ workspace] (reset! destroyed workspace) nil))]
        (with-redefs [provisioning.database/database-provisioner recording]
          (provisioning/deprovision-workspace! (workspace-row ws-id)))
        (is (=? {:status :unprovisioned} (workspace-row ws-id)))
        (is (=? {:schema           (str "mb_iso_" wsd-id)
                 :database_details {:user "recomputed"}}
                @destroyed)
            "destroy! received the deterministically recomputed identifiers")))))
