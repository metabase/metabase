(ns metabase-enterprise.workspaces.core-test
  "Tests for the workspace programmatic API and lifecycle rules."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

;;; Stub provisioner: records calls but doesn't hit real drivers.
(defn- stub-provisioner []
  (reify provisioning/Provisioner
    (init! [_ _ _ _]
      {:schema "mb_iso_stub" :database_details {:user "stub_user" :password "stub_pass"}})
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
        (testing "provisioning failure rolls back the workspace and its database rows"
          (let [failing-provisioner (reify provisioning/Provisioner
                                      (init!    [_ _ _ _]   (throw (ex-info "boom" {})))
                                      (grant!   [_ _ _ _ _] nil)
                                      (destroy! [_ _ _ _]   nil))]
            (with-redefs [provisioning/dispatching-provisioner failing-provisioner]
              (is (thrown-with-msg? ExceptionInfo #"boom"
                                    (ws/create-workspace! {:name         "Boom"
                                                           :creator_id   (mt/user->id :crowberto)
                                                           :database_ids [db-id]}))))
            (is (not (t2/exists? :model/Workspace :name "Boom"))
                "the failed create must not leave a Workspace row behind")
            (is (not (t2/exists? :model/WorkspaceDatabase :database_id db-id))
                "the failed create must not leave WorkspaceDatabase rows behind")))
        (testing "success: the attached database comes back :provisioned"
          (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
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
      (provisioning/provision-single! wsd-id))))

;;; ----------------------------------------- Delete Workspace ------------------------------------------------

(deftest delete-workspace-test
  (testing "delete deprovisions all databases first"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Delete WS" :creator_id (mt/user->id :crowberto)})]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (add-database! (:id ws) (mt/id) ["PUBLIC"]))
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (ws/delete-workspace! (:id ws)))
        (is (nil? (ws/get-workspace (:id ws)))))))
  (testing "delete workspace with no databases"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Empty WS" :creator_id (mt/user->id :crowberto)})]
        (is (= {:deleted true} (ws/delete-workspace! (:id ws))))
        (is (nil? (ws/get-workspace (:id ws))))))))

(deftest delete-workspace-with-pending-status-test
  (testing "GHY-3954: a workspace with a database still :provisioning/:deprovisioning"
    (doseq [pending-status [:provisioning :deprovisioning]]
      (testing (str "status " pending-status)
        (mt/with-model-cleanup [:model/Workspace]
          (let [ws     (ws/create-workspace! {:name       (str "Pending " (name pending-status))
                                              :creator_id (mt/user->id :crowberto)})
                _      (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                         (add-database! (:id ws) (mt/id) ["PUBLIC"]))
                wsd-id (t2/select-one-pk :model/WorkspaceDatabase :workspace_id (:id ws))]
            ;; force the row into the pending state. :provisioning rows that crashed
            ;; never stored their iso details, so clear them too.
            (t2/update! :model/WorkspaceDatabase {:id wsd-id}
                        (cond-> {:status pending-status}
                          (= pending-status :provisioning)
                          (assoc :output_namespace "" :database_details {})))
            (testing "is refused by default, listing the pending databases"
              (is (thrown-with-msg?
                   ExceptionInfo #"still provisioning or deprovisioning"
                   (ws/delete-workspace! (:id ws))))
              (is (=? {:status-code       409
                       :pending_databases [{:database_id (mt/id) :status pending-status}]}
                      (try (ws/delete-workspace! (:id ws))
                           (catch ExceptionInfo e (ex-data e)))))
              (is (some? (ws/get-workspace (:id ws)))
                  "the workspace is left intact when the delete is refused"))
            (testing "is deleted when ignore-pending? is true; the warehouse is left untouched"
              ;; destroy! must NOT be called for a pending row — fail loudly if it is.
              (let [exploding (reify provisioning/Provisioner
                                (init!    [_ _ _ _]   nil)
                                (grant!   [_ _ _ _ _] nil)
                                (destroy! [_ _ _ _]   (throw (ex-info "destroy! must not run for a pending row" {}))))]
                (with-redefs [provisioning/dispatching-provisioner exploding]
                  (is (= {:deleted true} (ws/delete-workspace! (:id ws) true)))))
              (is (nil? (ws/get-workspace (:id ws))))
              (is (not (t2/exists? :model/WorkspaceDatabase :id wsd-id))))))))))

(deftest delete-workspace-warehouse-unreachable-test
  (testing "GHY-3954: delete still succeeds when warehouse teardown fails; the result"
    (testing "names the orphaned schema/user and why they were left behind"
      (mt/with-model-cleanup [:model/Workspace]
        (let [ws     (ws/create-workspace! {:name "Unreachable WS" :creator_id (mt/user->id :crowberto)})
              _      (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                       (add-database! (:id ws) (mt/id) ["PUBLIC"]))
              wsd-id (t2/select-one-pk :model/WorkspaceDatabase :workspace_id (:id ws))
              boom   (reify provisioning/Provisioner
                       (init!    [_ _ _ _]   nil)
                       (grant!   [_ _ _ _ _] nil)
                       (destroy! [_ _ _ _]   (throw (ex-info "Connection refused" {}))))
              result (with-redefs [provisioning/dispatching-provisioner boom]
                       (ws/delete-workspace! (:id ws)))]
          (is (true? (:deleted result)))
          (is (nil? (ws/get-workspace (:id ws)))
              "the workspace is deleted even though warehouse cleanup failed")
          (is (=? [{:status                :failure
                    :workspace_database_id wsd-id
                    :database_id           (mt/id)
                    :schema                "mb_iso_stub"
                    :user                  "stub_user"
                    :reason                "Connection refused"}]
                  (:orphaned_resources result)))
          (is (re-find #"was deleted, but warehouse cleanup failed" (:message result)))
          (is (re-find #"Connection refused" (:message result))))))))

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
  @#'ws/locked-by-config?*)

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
