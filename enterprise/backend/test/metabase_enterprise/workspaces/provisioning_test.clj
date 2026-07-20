(ns ^:synchronous metabase-enterprise.workspaces.provisioning-test
  "Tests for the workspace provisioning lifecycle: [[provisioning/provision-workspace!]]
   and [[provisioning/deprovision-workspace!]] driving the workspace and
   workspace_database statuses. `use-fixtures`-installed stubs replace the real
   DatabaseProvisioner and InstanceProvisioner for every test (hence
   `^:synchronous`); individual tests override them with their own reify via an
   inner `with-redefs`."
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

(def ^:private database-calls
  "init!/destroy! calls recorded by the default stub DatabaseProvisioner. Reset per test."
  (atom []))

(defn- stub-database-provisioner
  "DatabaseProvisioner that records init!/destroy! calls in [[database-calls]] and never
   touches a warehouse."
  []
  (reify provisioning.database/DatabaseProvisioner
    (details [_ _ _ workspace]
      {:schema (str "mb_iso_" (:id workspace)) :database_details {:user "stub_user"}})
    (init! [_ _ db _] (swap! database-calls conj [:init! (:id db)]) nil)
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ db _] (swap! database-calls conj [:destroy! (:id db)]) nil)))

(defn- stub-instance-provisioner
  "InstanceProvisioner that never talks to a real service and starts instantly."
  []
  (reify provisioning.instance/InstanceProvisioner
    (create! [_ _workspace _config]
      {:id (str (random-uuid)) :url "https://example.com" :status :running})
    (fetch [_ instance-id]
      {:id instance-id :url "https://example.com" :status :running})
    (delete! [_ _instance-id] nil)))

(use-fixtures :once
  (fixtures/initialize :db)
  (fn [thunk]
    (with-redefs [provisioning.database/database-provisioner (stub-database-provisioner)
                  provisioning.instance/instance-provisioner (stub-instance-provisioner)]
      (thunk))))

(use-fixtures :each
  (fn [thunk]
    (reset! database-calls [])
    (thunk)))

(defn- failing-on
  "Like [[stub-database-provisioner]] but `op` (:init! or :destroy!) throws for database
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
      (is (=? {:status :provisioned :status_details nil}
              (provisioning/provision-workspace! (workspace-row ws-id)))
          "the updated workspace copy is returned")
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
      (reset! database-calls [])
      (provisioning/provision-workspace! (workspace-row ws-id))
      (is (= [[:init! db2-id]] @database-calls)
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
                      (fetch [_ id] {:id id :url "https://example.com" :status :running})
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
        (reset! database-calls [])
        (provisioning/provision-workspace! (workspace-row ws-id))
        (is (= [] @database-calls))
        (is (=? {:status :provisioned :status_details nil :instance_id string?}
                (workspace-row ws-id)))))))

(deftest deprovision-workspace-instance-failure-test
  (testing "an instance-deprovisioning failure lands in :instance-deprovisioning-failure and stops"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id} (wsd-attrs ws-id (mt/id))]
      (provisioning/provision-workspace! (workspace-row ws-id))
      (with-redefs [provisioning.instance/instance-provisioner
                    (reify provisioning.instance/InstanceProvisioner
                      (create! [_ _ _] {:id "x" :url "https://example.com" :status :running})
                      (fetch [_ id] {:id id :url "https://example.com" :status :running})
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
  (testing "the instance provisioner receives the workspace's config-file map"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name       "WS"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _ (assoc (wsd-attrs ws-id (mt/id))
                                                     :status           :provisioned
                                                     :output_namespace "mb_iso_x")]
      (let [received (atom nil)]
        (with-redefs [provisioning.instance/instance-provisioner
                      (reify provisioning.instance/InstanceProvisioner
                        (create! [_ _ config] (reset! received config) {:id "i" :url "https://example.com" :status :running})
                        (fetch [_ id] {:id id :url "https://example.com" :status :running})
                        (delete! [_ _] nil))]
          (provisioning/provision-workspace! (workspace-row ws-id)))
        (is (=? {:version 1
                 :config  {:workspace {:name "WS"}}}
                @received)
            "create! received the workspace's config map")))))

(deftest set-initial-workspace-status-guard-test
  (testing "set-initial-workspace-*-status! atomically refuse to start a run while one is in flight"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Busy" :status :database-provisioning}]
      (doseq [start! [provisioning/set-initial-workspace-provisioning-status!
                      provisioning/set-initial-workspace-deprovisioning-status!]]
        (is (= 400 (try (start! (workspace-row ws-id))
                        (catch Exception e (:status-code (ex-data e))))))
        (is (= :database-provisioning (:status (workspace-row ws-id)))
            "the in-flight status is untouched"))))
  (testing "and start the run from any other settled status"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Settled" :status :database-provisioning-failure}]
      (is (=? {:status :database-provisioning}
              (provisioning/set-initial-workspace-provisioning-status! (workspace-row ws-id))))
      (is (= :database-provisioning (:status (workspace-row ws-id))))))
  (testing "a provision cannot start when the workspace is already :provisioned"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Done" :status :provisioned}]
      (is (= 400 (try (provisioning/set-initial-workspace-provisioning-status! (workspace-row ws-id))
                      (catch Exception e (:status-code (ex-data e))))))
      (is (= :provisioned (:status (workspace-row ws-id))))))
  (testing "a deprovision cannot start when the workspace is already :unprovisioned"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Empty" :status :unprovisioned}]
      (is (= 400 (try (provisioning/set-initial-workspace-deprovisioning-status! (workspace-row ws-id))
                      (catch Exception e (:status-code (ex-data e))))))
      (is (= :unprovisioned (:status (workspace-row ws-id)))))))

(deftest provision-instance-polls-until-running-test
  (testing "provision-instance! records the ids up front, then polls until the instance is :running"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}]
      (let [statuses (atom [:starting :starting :running])
            polls    (atom 0)]
        (with-redefs [provisioning.instance/instance-poll-interval-ms 1
                      provisioning.instance/instance-provisioner
                      (reify provisioning.instance/InstanceProvisioner
                        (create! [_ _ _] {:id "async-1" :url "https://example.com" :status :creating})
                        (fetch [_ id]
                          (swap! polls inc)
                          {:id id :url "https://example.com" :status (ffirst (swap-vals! statuses rest))})
                        (delete! [_ _] nil))]
          (provisioning/provision-workspace! (workspace-row ws-id)))
        (is (= 3 @polls) "polling continues through :starting until the terminal status")
        (is (=? {:status :provisioned :instance_id "async-1" :instance_url "https://example.com"}
                (workspace-row ws-id)))))))

(deftest provision-instance-error-status-test
  (testing "an instance that lands in :error fails the run but keeps the recorded ids"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}]
      (with-redefs [provisioning.instance/instance-provisioner
                    (reify provisioning.instance/InstanceProvisioner
                      (create! [_ _ _] {:id "doomed-1" :url "https://example.com" :status :creating})
                      (fetch [_ id] {:id id :url "https://example.com" :status :error})
                      (delete! [_ _] nil))]
        (is (thrown-with-msg? ExceptionInfo #"failed to start"
                              (provisioning/provision-workspace! (workspace-row ws-id)))))
      (is (=? {:status         :instance-provisioning-failure
               :status_details "Workspace instance failed to start"
               :instance_id    "doomed-1"}
              (workspace-row ws-id))
          "the instance identifiers stay recorded for the retry's cleanup"))))

(deftest provision-workspace-noop-when-provisioned-test
  (testing "provisioning a fully-provisioned workspace is a no-op"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase _ (assoc (wsd-attrs ws-id (mt/id))
                                                     :status           :provisioned
                                                     :output_namespace "mb_iso_x")]
      (provisioning/provision-workspace! (workspace-row ws-id))
      (is (= [] @database-calls) "no provisioner database-calls are made")
      (is (=? {:status :provisioned} (workspace-row ws-id))))))

(deftest deprovision-workspace-success-test
  (testing "deprovision-workspace! tears down every database and lands the workspace :unprovisioned"
    (mt/with-temp [:model/Database  {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd1-id :id} (wsd-attrs ws-id (mt/id))
                   :model/WorkspaceDatabase {wsd2-id :id} (wsd-attrs ws-id db2-id)]
      (provisioning/provision-workspace! (workspace-row ws-id))
      (reset! database-calls [])
      (is (=? {:status :unprovisioned :status_details nil :instance_id nil}
              (provisioning/deprovision-workspace! (workspace-row ws-id)))
          "the updated workspace copy is returned")
      (is (= [[:destroy! (mt/id)] [:destroy! db2-id]] @database-calls)
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
      (is (= [] @database-calls) "no provisioner database-calls are made")
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
