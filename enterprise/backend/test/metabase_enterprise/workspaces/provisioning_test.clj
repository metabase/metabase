(ns metabase-enterprise.workspaces.provisioning-test
  "Tests for the workspace programmatic API and lifecycle rules. Exercises the
   module surface through the [[metabase-enterprise.workspaces.core]] re-exports."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.provisioning.database :as provisioning.database]
   [metabase-enterprise.workspaces.provisioning.instance :as provisioning.instance]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

;;; Stub provisioner: records calls but doesn't hit real drivers.
(defn- stub-provisioner []
  (reify provisioning.database/DatabaseProvisioner
    (details [_ _ _ _]
      {:schema "mb_iso_stub" :database_details {:user "stub_user" :password "stub_pass"}})
    (init! [_ _ _ _] nil)
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ _ _] nil)))

;;; ----------------------------------------------- CRUD -------------------------------------------------------

(deftest create-workspace-test
  (testing "create with name only (no databases)"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name       "Test WS"
                                      :creator_id (mt/user->id :crowberto)})]
        (is (= "Test WS" (:name ws)))
        (is (empty? (:databases ws)))))))

(deftest get-and-list-test
  (testing "get returns nil for non-existent"
    (is (nil? (ws/get-workspace 999999))))
  (testing "get returns hydrated workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws      (ws/create-workspace! {:name       "Get Test"
                                           :creator_id (mt/user->id :crowberto)})
            fetched (ws/get-workspace (:id ws))]
        (is (some? (:creator fetched)))
        (is (= [] (:databases fetched))))))
  (testing "list returns all"
    (mt/with-model-cleanup [:model/Workspace]
      (ws/create-workspace! {:name "A" :creator_id (mt/user->id :crowberto)})
      (ws/create-workspace! {:name "B" :creator_id (mt/user->id :crowberto)})
      (is (>= (count (ws/list-workspaces)) 2)))))

(deftest create-workspace-provisions-databases-test
  (testing "create-workspace! attaches and provisions the given databases"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db-id :schema "public" :active true}
                   :model/Database {ineligible-id :id} {:engine :postgres :details {}}]
      (mt/with-model-cleanup [:model/Workspace]
        (testing "an ineligible database is rejected"
          (is (thrown-with-msg? ExceptionInfo #"Workspaces are not enabled for this database"
                                (ws/create-workspace! {:name         "Nope"
                                                       :creator_id   (mt/user->id :crowberto)
                                                       :database_ids [ineligible-id]}))))
        (testing "a missing database is rejected"
          (is (thrown-with-msg? ExceptionInfo #"Database not found"
                                (ws/create-workspace! {:name         "Nope"
                                                       :creator_id   (mt/user->id :crowberto)
                                                       :database_ids [Integer/MAX_VALUE]}))))
        (testing "provisioning failure cleans up: databases torn down, workspace and rows deleted"
          (let [failing-provisioner (reify provisioning.database/DatabaseProvisioner
                                      (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                                      (init!    [_ _ _ _]   (throw (ex-info "boom" {})))
                                      (grant!   [_ _ _ _ _] nil)
                                      (destroy! [_ _ _ _]   nil))]
            (with-redefs [provisioning.database/dispatching-database-provisioner failing-provisioner]
              (is (thrown-with-msg? ExceptionInfo #"boom"
                                    (ws/create-workspace! {:name         "Boom"
                                                           :creator_id   (mt/user->id :crowberto)
                                                           :database_ids [db-id]}))))
            (is (not (t2/exists? :model/Workspace :name "Boom"))
                "the failed create must not leave a Workspace row behind")
            (is (not (t2/exists? :model/WorkspaceDatabase :database_id db-id))
                "the failed create must not leave WorkspaceDatabase rows behind")))
        (testing "provisioning failure whose cleanup also fails keeps the workspace and returns it for retry"
          (let [wedged (reify provisioning.database/DatabaseProvisioner
                         (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                         (init!    [_ _ _ _]   (throw (ex-info "boom" {})))
                         (grant!   [_ _ _ _ _] nil)
                         (destroy! [_ _ _ _]   (throw (ex-info "warehouse down" {}))))]
            (with-redefs [provisioning.database/dispatching-database-provisioner wedged]
              (is (=? {:name      "Wedged"
                       :databases [{:status :unprovisioned}]}
                      (ws/create-workspace! {:name         "Wedged"
                                             :creator_id   (mt/user->id :crowberto)
                                             :database_ids [db-id]}))
                  "the created workspace is returned even though provisioning failed and cleanup could not finish"))
            (let [ws (t2/select-one :model/Workspace :name "Wedged")]
              (is (some? ws)
                  "the workspace must be kept while any database row remains")
              (is (=? [{:status :unprovisioned}]
                      (t2/select :model/WorkspaceDatabase :workspace_id (:id ws)))
                  "the row whose teardown failed is kept, forced :unprovisioned")
              ;; retry the teardown via delete once the warehouse is back
              (with-redefs [provisioning.database/dispatching-database-provisioner (stub-provisioner)]
                (is (nil? (ws/delete-workspace! ws))))
              (is (nil? (ws/get-workspace (:id ws)))))))
        (testing "success: the attached database comes back :provisioned"
          (with-redefs [provisioning.database/dispatching-database-provisioner (stub-provisioner)]
            (let [ws (ws/create-workspace! {:name         "Provisioned"
                                            :creator_id   (mt/user->id :crowberto)
                                            :database_ids [db-id]})]
              (is (=? [{:database_id   db-id
                        :input_schemas ["public"]
                        :status        :provisioned}]
                      (:databases ws))))))))))

(defn- add-database!
  "Test helper: insert a WorkspaceDatabase row for `workspace-id` and provision it
   (blocking). Replaces the removed production add-database! for test setup."
  [workspace-id database-id input-schemas]
  (t2/with-transaction [_conn]
    (let [wsd-id (t2/insert-returning-pk! :model/WorkspaceDatabase
                                          {:workspace_id     workspace-id
                                           :database_id      database-id
                                           :input_schemas    input-schemas
                                           :database_details {}
                                           :output_namespace ""})]
      (provisioning.database/provision-database! wsd-id))))

;;; ----------------------------------------- Delete Workspace ------------------------------------------------

(deftest delete-workspace-test
  (testing "delete deprovisions all databases first"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Delete WS" :creator_id (mt/user->id :crowberto)})]
        (with-redefs [provisioning.database/dispatching-database-provisioner (stub-provisioner)]
          (add-database! (:id ws) (mt/id) ["PUBLIC"]))
        (with-redefs [provisioning.database/dispatching-database-provisioner (stub-provisioner)]
          (ws/delete-workspace! ws))
        (is (nil? (ws/get-workspace (:id ws)))))))
  (testing "delete workspace with no databases"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Empty WS" :creator_id (mt/user->id :crowberto)})]
        (is (nil? (ws/delete-workspace! ws)))
        (is (nil? (ws/get-workspace (:id ws))))))))

(deftest delete-workspace-with-pending-status-test
  (testing "a workspace database still :provisioning/:deprovisioning is torn down like any other state"
    (doseq [pending-status [:provisioning :deprovisioning]]
      (testing (str "status " pending-status)
        (mt/with-model-cleanup [:model/Workspace]
          (let [ws     (ws/create-workspace! {:name       (str "Pending " (name pending-status))
                                              :creator_id (mt/user->id :crowberto)})
                _      (with-redefs [provisioning.database/dispatching-database-provisioner (stub-provisioner)]
                         (add-database! (:id ws) (mt/id) ["PUBLIC"]))
                wsd-id (t2/select-one-pk :model/WorkspaceDatabase :workspace_id (:id ws))]
            ;; force the row into the pending state. :provisioning rows that crashed
            ;; never stored their iso details, so clear them too.
            (t2/update! :model/WorkspaceDatabase {:id wsd-id}
                        (cond-> {:status pending-status}
                          (= pending-status :provisioning)
                          (assoc :output_namespace "" :database_details {})))
            (let [destroyed? (atom false)
                  recording  (reify provisioning.database/DatabaseProvisioner
                               (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                               (init!    [_ _ _ _]   nil)
                               (grant!   [_ _ _ _ _] nil)
                               (destroy! [_ _ _ _]   (reset! destroyed? true) nil))]
              (with-redefs [provisioning.database/dispatching-database-provisioner recording]
                (is (nil? (ws/delete-workspace! ws))))
              (is (true? @destroyed?)
                  "pending rows get a real warehouse teardown, not an app-DB-only removal")
              (is (nil? (ws/get-workspace (:id ws))))
              (is (not (t2/exists? :model/WorkspaceDatabase :id wsd-id))))))))))

(deftest delete-workspace-teardown-failure-test
  (testing "when teardown fails, nothing is deleted: the row and the workspace are kept for retry"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws     (ws/create-workspace! {:name "Unreachable WS" :creator_id (mt/user->id :crowberto)})
            _      (with-redefs [provisioning.database/dispatching-database-provisioner (stub-provisioner)]
                     (add-database! (:id ws) (mt/id) ["PUBLIC"]))
            wsd-id (t2/select-one-pk :model/WorkspaceDatabase :workspace_id (:id ws))
            boom   (reify provisioning.database/DatabaseProvisioner
                     (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                     (init!    [_ _ _ _]   nil)
                     (grant!   [_ _ _ _ _] nil)
                     (destroy! [_ _ _ _]   (throw (ex-info "Connection refused" {}))))]
        (with-redefs [provisioning.database/dispatching-database-provisioner boom]
          (is (thrown-with-msg? ExceptionInfo #"Connection refused"
                                (ws/delete-workspace! ws))
              "the combined teardown failure is thrown, carrying what the database returned"))
        (is (some? (ws/get-workspace (:id ws)))
            "the workspace must be kept when any teardown fails")
        (is (=? {:status :unprovisioned}
                (t2/select-one :model/WorkspaceDatabase :id wsd-id))
            "the failed row is kept, forced :unprovisioned")
        (testing "retrying the delete once the warehouse is reachable finishes the job"
          (with-redefs [provisioning.database/dispatching-database-provisioner (stub-provisioner)]
            (is (nil? (ws/delete-workspace! ws))))
          (is (nil? (ws/get-workspace (:id ws))))
          (is (not (t2/exists? :model/WorkspaceDatabase :id wsd-id))))))))

(deftest delete-workspace-combines-teardown-failures-test
  (testing "every database gets its teardown attempt and all failures come back as one combined exception"
    (mt/with-temp [:model/Database {db2-id :id} {:engine   :postgres
                                                 :details  {}
                                                 :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [ws   (ws/create-workspace! {:name "Multi fail" :creator_id (mt/user->id :crowberto)})
              _    (with-redefs [provisioning.database/dispatching-database-provisioner (stub-provisioner)]
                     (add-database! (:id ws) (mt/id) ["PUBLIC"])
                     (add-database! (:id ws) db2-id ["public"]))
              boom (reify provisioning.database/DatabaseProvisioner
                     (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                     (init!    [_ _ _ _]   nil)
                     (grant!   [_ _ _ _ _] nil)
                     (destroy! [_ _ db _]  (throw (ex-info (str "down: " (:id db)) {}))))
              e    (with-redefs [provisioning.database/dispatching-database-provisioner boom]
                     (try
                       (ws/delete-workspace! ws)
                       nil
                       (catch Throwable t t)))]
          (is (some? e))
          (is (= #{(str "down: " (mt/id)) (str "down: " db2-id)}
                 (set (str/split (ex-message e) #"; ")))
              "the message joins what each database returned")
          (is (some? (ex-cause e))
              "the first failure is the cause")
          (is (= 1 (count (.getSuppressed ^Throwable e)))
              "the remaining failures are suppressed")
          (is (= 2 (t2/count :model/WorkspaceDatabase :workspace_id (:id ws)))
              "both rows are kept for retry")
          (with-redefs [provisioning.database/dispatching-database-provisioner (stub-provisioner)]
            (is (nil? (ws/delete-workspace! ws)))))))))

;;; -------------------------------------------- Remappings ----------------------------------------------------

(deftest list-remappings-test
  (mt/with-model-cleanup [:model/TableRemapping]
    (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                       :from_schema     "public"
                                       :from_table_name "orders"
                                       :to_schema       "mb_iso"
                                       :to_table_name   "orders"})
    (let [remappings (ws/list-remappings)]
      (is (some #(= "orders" (:from_table_name %)) remappings)))))

;;; ----------------------------------------- workspace-instance lock ------------------------------------------

(defn- lock-atom
  "Reach through the private var to the lock atom."
  []
  @#'provisioning/locked-by-config?*)

(deftest workspace-locked-by-config?-baseline-test
  (testing "default state (no atom flip, no env-var) is unlocked"
    (let [a     (lock-atom)
          prior @a]
      (try
        (reset! a false)
        (is (false? (ws/workspace-locked-by-config?)))
        (finally (reset! a prior))))))

(deftest workspace-locked-by-config?-atom-flipped-test
  (testing "after mark-locked-by-config!, the predicate returns true"
    (workspaces.tu/with-workspace-locked-by-config
      (fn [] (is (true? (ws/workspace-locked-by-config?)))))))

(deftest mark-locked-by-config!-flips-the-atom-test
  (testing "mark-locked-by-config! flips the atom to true"
    (let [a     (lock-atom)
          prior @a]
      (try
        (reset! a false)
        (is (false? (ws/workspace-locked-by-config?)))
        (ws/mark-locked-by-config!)
        (is (true? @a))
        (is (true? (ws/workspace-locked-by-config?)))
        (finally (reset! a prior))))))

(deftest env-var-presence-locks-test
  (testing "MB_INSTANCE_WORKSPACE set => predicate true regardless of atom"
    (let [a     (lock-atom)
          prior @a]
      (try
        (reset! a false)
        (mt/with-temp-env-var-value! [mb-instance-workspace "{\"name\":\"x\",\"databases\":{}}"]
          (is (true? (ws/workspace-locked-by-config?))))
        (testing "outside the binding, atom alone determines the lock"
          (is (false? (ws/workspace-locked-by-config?))))
        (finally (reset! a prior))))))

(deftest env-var-empty-string-does-not-lock-test
  (testing "MB_INSTANCE_WORKSPACE set to empty string does NOT lock (env-var-value treats blank as unset)"
    (let [a     (lock-atom)
          prior @a]
      (try
        (reset! a false)
        (mt/with-temp-env-var-value! [mb-instance-workspace ""]
          (is (false? (ws/workspace-locked-by-config?))))
        (finally (reset! a prior))))))

(deftest env-var-and-atom-both-lock-test
  (testing "both sources set => still true; OR semantics"
    (mt/with-temp-env-var-value! [mb-instance-workspace "{\"name\":\"x\",\"databases\":{}}"]
      (workspaces.tu/with-workspace-locked-by-config
        (fn [] (is (true? (ws/workspace-locked-by-config?))))))))

;;; -------------------------------------------- Deployment ----------------------------------------------------

(defn- stub-instance-provisioner
  "An [[provisioning.instance/InstanceProvisioner]] that records calls in the `calls` atom.
   create! returns a fixed id/url; delete! records the instance id it received."
  [calls]
  (reify provisioning.instance/InstanceProvisioner
    (create! [_this workspace _config]
      (swap! calls conj [:create! (:id workspace)])
      {:id "hm-stub-1" :url "https://child.example.com"})
    (delete! [_this workspace]
      (swap! calls conj [:delete! (:id workspace) (:instance_id workspace)])
      nil)))

(deftest create-workspace-deploys-instance-test
  (testing "when workspace-deployment-enabled is set, create deploys an instance and persists its id/url"
    (mt/with-model-cleanup [:model/Workspace]
      (let [calls (atom [])]
        (with-redefs [ws.settings/workspace-instance-provisioning-enabled (constantly true)
                      provisioning.instance/hm-provisioner                (stub-instance-provisioner calls)]
          (let [ws (ws/create-workspace! {:name "Deployed" :creator_id (mt/user->id :crowberto)})]
            (is (= [[:create! (:id ws)]] @calls))
            (is (= "hm-stub-1" (:instance_id ws)))
            (is (= "https://child.example.com" (:instance_url ws)))))))))

(deftest create-workspace-deployment-disabled-test
  (testing "with the setting off (the default), create never touches the instance provisioner"
    (mt/with-model-cleanup [:model/Workspace]
      (let [calls (atom [])]
        (with-redefs [provisioning.instance/hm-provisioner (stub-instance-provisioner calls)]
          (let [ws (ws/create-workspace! {:name "Undeployed" :creator_id (mt/user->id :crowberto)})]
            (is (= [] @calls))
            (is (nil? (:instance_id ws)))
            (is (nil? (:instance_url ws)))))))))

(deftest create-workspace-deployment-failure-is-best-effort-test
  (testing "a deployment failure never fails the create — the workspace comes back without an instance"
    (mt/with-model-cleanup [:model/Workspace]
      (with-redefs [ws.settings/workspace-instance-provisioning-enabled (constantly true)
                    provisioning.instance/hm-provisioner
                    (reify provisioning.instance/InstanceProvisioner
                      (create! [_this _workspace _config] (throw (ex-info "HM down" {})))
                      (delete! [_this _workspace] nil))]
        (let [ws (ws/create-workspace! {:name "HM down" :creator_id (mt/user->id :crowberto)})]
          (is (some? (:id ws)))
          (is (nil? (:instance_id ws)))
          (is (nil? (:instance_url ws))))))))

(deftest delete-workspace-deprovisions-instance-test
  (testing "delete removes the deployed instance first, gated on the row's instance_id"
    (mt/with-model-cleanup [:model/Workspace]
      (let [calls (atom [])
            ws    (ws/create-workspace! {:name "To undeploy" :creator_id (mt/user->id :crowberto)})]
        (t2/update! :model/Workspace (:id ws) {:instance_id  "hm-stub-9"
                                               :instance_url "https://child.example.com"})
        (with-redefs [provisioning.instance/hm-provisioner (stub-instance-provisioner calls)]
          (is (nil? (ws/delete-workspace! (t2/select-one :model/Workspace :id (:id ws))))))
        (is (= [[:delete! (:id ws) "hm-stub-9"]] @calls))
        (is (nil? (ws/get-workspace (:id ws))))))))

(deftest delete-workspace-instance-delete-failure-keeps-workspace-test
  (testing "when the instance delete fails, the workspace and its instance_id are kept so the delete can be retried"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Sticky" :creator_id (mt/user->id :crowberto)})]
        (t2/update! :model/Workspace (:id ws) {:instance_id  "hm-stub-9"
                                               :instance_url "https://child.example.com"})
        (with-redefs [provisioning.instance/hm-provisioner
                      (reify provisioning.instance/InstanceProvisioner
                        (create! [_this _workspace _config] nil)
                        (delete! [_this _workspace] (throw (ex-info "HM unreachable" {}))))]
          (is (thrown-with-msg? ExceptionInfo #"HM unreachable"
                                (ws/delete-workspace! (t2/select-one :model/Workspace :id (:id ws))))))
        (is (= "hm-stub-9" (t2/select-one-fn :instance_id :model/Workspace :id (:id ws))))))))
