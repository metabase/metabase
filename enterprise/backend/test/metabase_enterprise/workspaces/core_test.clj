(ns metabase-enterprise.workspaces.core-test
  "Tests for the workspace programmatic API and lifecycle rules."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

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

;;; ----------------------------------------- Add/Remove Database ----------------------------------------------

(deftest add-database-test
  (testing "add database provisions immediately"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (ws/create-workspace! {:name "Add DB" :creator_id (mt/user->id :crowberto)})
            ws' (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                  (ws/add-database! (:id ws) (mt/id) ["PUBLIC" "ANALYTICS"]))]
        (is (= 1 (count (:databases ws'))))
        (is (= ["PUBLIC" "ANALYTICS"]
               (:input_schemas (first (:databases ws')))))
        (is (= :provisioned (:status (first (:databases ws'))))))))

  (testing "input required on add"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "No Schema Add" :creator_id (mt/user->id :crowberto)})]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"input_schemas is required"
             (ws/add-database! (:id ws) (mt/id) []))))))

  (testing "input not required when database does not support :schemas (e.g. MySQL)"
    (when (workspaces.tu/driver-loadable? :mysql)
      (mt/with-temp [:model/Database {db-id :id} {:engine :mysql}]
        (mt/with-model-cleanup [:model/Workspace]
          (let [ws  (ws/create-workspace! {:name "MySQL Add" :creator_id (mt/user->id :crowberto)})
                ws' (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                      (ws/add-database! (:id ws) db-id []))]
            (is (= 1 (count (:databases ws'))))
            (is (= [] (:input_schemas (first (:databases ws'))))))))))

  (testing "duplicate database throws 409"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Dup DB" :creator_id (mt/user->id :crowberto)})]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (ws/add-database! (:id ws) (mt/id) ["PUBLIC"]))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Database already in workspace"
             (ws/add-database! (:id ws) (mt/id) ["PUBLIC"]))))))

  (testing "provisioning failure rolls the row back so the caller can retry cleanly"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Roll Back" :creator_id (mt/user->id :crowberto)})
            failing-provisioner (reify provisioning/Provisioner
                                  (init!    [_ _ _ _]   (throw (ex-info "boom" {})))
                                  (grant!   [_ _ _ _ _] nil)
                                  (destroy! [_ _ _ _]   nil))]
        (with-redefs [provisioning/dispatching-provisioner failing-provisioner]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                                (ws/add-database! (:id ws) (mt/id) ["PUBLIC"]))))
        (is (empty? (:databases (ws/get-workspace (:id ws))))
            "the failed add must not leave a workspace_database row behind")))))

(deftest remove-database-test
  (testing "remove deprovisions and deletes"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Remove DB" :creator_id (mt/user->id :crowberto)})]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (ws/add-database! (:id ws) (mt/id) ["PUBLIC"])
          (let [ws' (ws/remove-database! (:id ws) (mt/id))]
            (is (empty? (:databases ws'))))))))

  (testing "remove from non-existent workspace throws 404"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Workspace not found"
         (ws/remove-database! 999999 (mt/id))))))

;;; ----------------------------------------- Update Database --------------------------------------------------

(deftest update-database-test
  (testing "update deprovisions old config and reprovisions with new input"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Update DB" :creator_id (mt/user->id :crowberto)})]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (ws/add-database! (:id ws) (mt/id) ["PUBLIC"])
          (let [ws' (ws/update-database! (:id ws) (mt/id) ["PUBLIC" "ANALYTICS"])]
            (is (= ["PUBLIC" "ANALYTICS"]
                   (:input_schemas (first (:databases ws')))))
            (is (= :provisioned (:status (first (:databases ws')))))))))))

;;; ----------------------------------------- Delete Workspace ------------------------------------------------

(deftest delete-workspace-test
  (testing "delete deprovisions all databases first"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Delete WS" :creator_id (mt/user->id :crowberto)})]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (ws/add-database! (:id ws) (mt/id) ["PUBLIC"]))
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (ws/delete-workspace! (:id ws)))
        (is (nil? (ws/get-workspace (:id ws)))))))

  (testing "delete workspace with no databases"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "Empty WS" :creator_id (mt/user->id :crowberto)})]
        (ws/delete-workspace! (:id ws))
        (is (nil? (ws/get-workspace (:id ws))))))))

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
