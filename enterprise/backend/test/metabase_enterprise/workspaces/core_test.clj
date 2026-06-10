(ns metabase-enterprise.workspaces.core-test
  "Tests for the workspace programmatic API and lifecycle rules."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.workspace-database :as workspace-database]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
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
  (testing "create with no eligible databases attaches nothing"
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

;;; ----------------------------------------- Database auto-discovery ------------------------------------------

(deftest eligible-databases-test
  (testing "eligible iff the driver supports :workspace AND database-enable-workspaces is on"
    (letfn [(eligible? [] (boolean (some #(= (mt/id) (:id %)) (workspace-database/eligible-databases))))]
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-workspaces true}}
        (testing "setting on, driver unsupported (H2) — not eligible"
          (is (false? (eligible?))))
        (testing "setting on, driver supported — eligible"
          (with-redefs [driver/database-supports? (constantly true)]
            (is (true? (eligible?))))))
      (testing "driver supported, setting off — not eligible"
        (with-redefs [driver/database-supports? (constantly true)]
          (is (false? (eligible?))))))))

(deftest create-workspace-discovers-and-provisions-test
  (testing "create-workspace! attaches every eligible database, derives its input schemas
            from the synced tables, and provisions it"
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-workspaces true}}
      (with-redefs [driver/database-supports?            (constantly true)
                    provisioning/dispatching-provisioner (stub-provisioner)]
        (mt/with-model-cleanup [:model/Workspace]
          (let [ws (ws/create-workspace! {:name "Auto" :creator_id (mt/user->id :crowberto)})]
            (is (= [(mt/id)] (map :database_id (:databases ws))))
            (is (= ["PUBLIC"] (:input_schemas (first (:databases ws)))))
            (is (= :provisioned (:status (first (:databases ws)))))))))))

(deftest create-workspace-schemaless-driver-test
  (testing "a database without :schemas support gets an empty input_schemas"
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-workspaces true}}
      (with-redefs [driver.u/supports?                   (fn [_driver feature _db] (= feature :workspace))
                    provisioning/dispatching-provisioner (stub-provisioner)]
        (mt/with-model-cleanup [:model/Workspace]
          (let [ws (ws/create-workspace! {:name "Schemaless" :creator_id (mt/user->id :crowberto)})]
            (is (= [(mt/id)] (map :database_id (:databases ws))))
            (is (= [] (:input_schemas (first (:databases ws)))))))))))

(deftest create-workspace-provisioning-failure-test
  (testing "a provisioning failure leaves that row :unprovisioned but the workspace is still created"
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-workspaces true}}
      (let [failing-provisioner (reify provisioning/Provisioner
                                  (init!    [_ _ _ _]   (throw (ex-info "boom" {})))
                                  (grant!   [_ _ _ _ _] nil)
                                  (destroy! [_ _ _ _]   nil))]
        (with-redefs [driver/database-supports?            (constantly true)
                      provisioning/dispatching-provisioner failing-provisioner]
          (mt/with-model-cleanup [:model/Workspace]
            (let [ws (ws/create-workspace! {:name "Boom" :creator_id (mt/user->id :crowberto)})]
              (is (= [(mt/id)] (map :database_id (:databases ws))))
              (is (= :unprovisioned (:status (first (:databases ws))))))))))))

;;; ----------------------------------------- Delete Workspace ------------------------------------------------

(deftest delete-workspace-test
  (testing "delete deprovisions all databases first"
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-workspaces true}}
      (with-redefs [driver/database-supports?            (constantly true)
                    provisioning/dispatching-provisioner (stub-provisioner)]
        (mt/with-model-cleanup [:model/Workspace]
          (let [ws (ws/create-workspace! {:name "Delete WS" :creator_id (mt/user->id :crowberto)})]
            (is (= :provisioned (:status (first (:databases ws)))))
            (ws/delete-workspace! (:id ws))
            (is (nil? (ws/get-workspace (:id ws)))))))))
  (testing "delete workspace with no databases"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Empty WS" :creator_id (mt/user->id :crowberto)})]
        (ws/delete-workspace! (:id ws))
        (is (nil? (ws/get-workspace (:id ws)))))))
  (testing "delete non-existent workspace throws 404"
    (is (thrown-with-msg?
         ExceptionInfo #"Workspace not found"
         (ws/delete-workspace! 999999)))))

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
