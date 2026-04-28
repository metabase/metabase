(ns metabase-enterprise.workspaces.core-test
  "Tests for the workspace programmatic API and lifecycle rules."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

;;; Stub provisioning: flips status synchronously without hitting real drivers.
(defmacro ^:private with-stubbed-provisioning [& body]
  `(with-redefs [provisioning/run-async! (fn [f#] (f#))
                 provisioning/provision-workspace-database!
                 (fn [wsd-id# _provisioner#]
                   (t2/update! :model/WorkspaceDatabase {:id wsd-id#}
                               {:status :provisioned :output_schema (str "mb_iso_test_" wsd-id#)})
                   (t2/select-one :model/WorkspaceDatabase :id wsd-id#))
                 provisioning/deprovision-workspace-database!
                 (fn [wsd-id# _provisioner#]
                   (t2/update! :model/WorkspaceDatabase {:id wsd-id#}
                               {:status :unprovisioned :output_schema "" :database_details {}})
                   (t2/select-one :model/WorkspaceDatabase :id wsd-id#))]
     ~@body))

;;; ----------------------------------------------- CRUD -------------------------------------------------------

(deftest create-workspace-test
  (testing "create with databases (schemas required)"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name       "Test WS"
                                      :creator_id (mt/user->id :crowberto)
                                      :databases  [{:database_id   (mt/id)
                                                    :input_schemas ["PUBLIC"]}]})]
        (is (= "Test WS" (:name ws)))
        (is (= ["PUBLIC"] (:input_schemas (first (:databases ws))))))))

  (testing "create with multiple input schemas"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name       "Multi Schema"
                                      :creator_id (mt/user->id :crowberto)
                                      :databases  [{:database_id   (mt/id)
                                                    :input_schemas ["raw_github" "raw_stripe"]}]})]
        (is (= ["raw_github" "raw_stripe"]
               (:input_schemas (first (:databases ws))))))))

  (testing "schemas are required — empty schemas throws"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"input_schemas is required"
         (ws/create-workspace! {:name       "No Schemas"
                                :creator_id (mt/user->id :crowberto)
                                :databases  [{:database_id (mt/id) :input_schemas []}]})))))

(deftest get-and-list-test
  (testing "get returns nil for non-existent"
    (is (nil? (ws/get-workspace 999999))))

  (testing "get returns hydrated workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name       "Get Test"
                                      :creator_id (mt/user->id :crowberto)
                                      :databases  [{:database_id (mt/id) :input_schemas ["PUBLIC"]}]})]
        (let [fetched (ws/get-workspace (:id ws))]
          (is (some? (:creator fetched)))
          (is (= 1 (count (:databases fetched))))))))

  (testing "list returns all"
    (mt/with-model-cleanup [:model/Workspace]
      (ws/create-workspace! {:name "A" :creator_id (mt/user->id :crowberto) :databases []})
      (ws/create-workspace! {:name "B" :creator_id (mt/user->id :crowberto) :databases []})
      (is (>= (count (ws/list-workspaces)) 2)))))

;;; ----------------------------------------- Add/Remove Database ----------------------------------------------

(deftest add-database-test
  (testing "add database with schemas"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws  (ws/create-workspace! {:name "Add DB" :creator_id (mt/user->id :crowberto) :databases []})
            ws' (ws/add-database! (:id ws) (mt/id) :input_schemas ["PUBLIC" "ANALYTICS"])]
        (is (= 1 (count (:databases ws'))))
        (is (= ["PUBLIC" "ANALYTICS"] (:input_schemas (first (:databases ws'))))))))

  (testing "schemas required on add"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name "No Schema Add" :creator_id (mt/user->id :crowberto) :databases []})]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"input_schemas is required"
             (ws/add-database! (:id ws) (mt/id) :input_schemas []))))))

  (testing "duplicate database throws 409"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name       "Dup DB"
                                      :creator_id (mt/user->id :crowberto)
                                      :databases  [{:database_id (mt/id) :input_schemas ["PUBLIC"]}]})]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Database already in workspace"
             (ws/add-database! (:id ws) (mt/id) :input_schemas ["PUBLIC"])))))))

(deftest remove-database-test
  (testing "remove unprovisioned database"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name       "Remove DB"
                                      :creator_id (mt/user->id :crowberto)
                                      :databases  [{:database_id (mt/id) :input_schemas ["PUBLIC"]}]})]
        (is (empty? (:databases (ws/remove-database! (:id ws) (mt/id))))))))

  (testing "remove from non-existent workspace throws 404"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Workspace not found"
         (ws/remove-database! 999999 (mt/id))))))

;;; ----------------------------------------- Lifecycle locking ------------------------------------------------

(deftest locked-when-provisioned-test
  (testing "structural edits blocked when any DB is provisioned"
    (with-stubbed-provisioning
      (mt/with-model-cleanup [:model/Workspace]
        (let [ws (ws/create-workspace! {:name       "Lock Test"
                                        :creator_id (mt/user->id :crowberto)
                                        :databases  [{:database_id (mt/id) :input_schemas ["PUBLIC"]}]})]
          (ws/provision! (:id ws))
          ;; Now locked — all structural edits should fail
          (testing "add-database blocked"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo #"locked"
                 (ws/add-database! (:id ws) 999 :input_schemas ["OTHER"]))))

          (testing "remove-database blocked"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo #"locked"
                 (ws/remove-database! (:id ws) (mt/id)))))

          (testing "update-workspace blocked"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo #"locked"
                 (ws/update-workspace! (:id ws) {:name "New Name" :databases []}))))

          (testing "delete-workspace blocked"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo #"locked"
                 (ws/delete-workspace! (:id ws)))))

          ;; But provisioning actions still work
          (testing "deprovision still works"
            (is (= 1 (ws/deprovision! (:id ws)))))

          ;; After deprovisioning, edits work again
          (testing "edits work after deprovision"
            (let [ws' (ws/get-workspace (:id ws))]
              (is (every? #(= :unprovisioned (:status %)) (:databases ws'))))
            (is (some? (ws/update-workspace! (:id ws) {:name      "Unlocked"
                                                       :databases [{:database_id   (mt/id)
                                                                    :input_schemas ["PUBLIC"]}]})))))))))

(deftest provision-retry-from-partial-state-test
  (testing "can retry provisioning after partial failure"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (ws/create-workspace! {:name       "Partial Test"
                                      :creator_id (mt/user->id :crowberto)
                                      :databases  [{:database_id (mt/id) :input_schemas ["PUBLIC"]}]})]
        ;; Simulate partial failure: flip to provisioning then back to unprovisioned
        (t2/update! :model/WorkspaceDatabase {:workspace_id (:id ws)} {:status :provisioning})
        (t2/update! :model/WorkspaceDatabase {:workspace_id (:id ws)} {:status :unprovisioned})
        ;; Now retry with stubbed provisioning
        (with-stubbed-provisioning
          (is (= 1 (ws/provision! (:id ws))))
          (let [ws' (ws/get-workspace (:id ws))]
            (is (= :provisioned (:status (first (:databases ws')))))))))))

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
