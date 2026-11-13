(ns metabase-enterprise.workspaces.core-test
  "Tests for the workspace programmatic API and lifecycle rules."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.connection :as t2.connection]
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
  (reify provisioning/Provisioner
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
        (testing "a router or destination database is rejected, even with workspaces enabled"
          (mt/with-temp [:model/Database {router-id :id} {:engine   :postgres
                                                          :details  {}
                                                          :settings {:database-enable-workspaces true}}
                         :model/DatabaseRouter _ {:database_id router-id :user_attribute "db_name"}
                         :model/Database {destination-id :id} {:engine             :postgres
                                                               :details            {}
                                                               :router_database_id router-id
                                                               :settings           {:database-enable-workspaces true}}]
            (doseq [db-id [router-id destination-id]]
              (is (thrown-with-msg? ExceptionInfo #"Workspaces are not enabled for this database"
                                    (ws/create-workspace! {:name         "Routed"
                                                           :creator_id   (mt/user->id :crowberto)
                                                           :database_ids [db-id]}))))))
        (testing "a missing database is rejected"
          (is (thrown-with-msg? ExceptionInfo #"Database not found"
                                (ws/create-workspace! {:name         "Nope"
                                                       :creator_id   (mt/user->id :crowberto)
                                                       :database_ids [Integer/MAX_VALUE]}))))
        (testing "provisioning failure cleans up: databases torn down, workspace and rows deleted"
          (let [failing-provisioner (reify provisioning/Provisioner
                                      (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
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
        (testing "init refusing a user that was already there: nothing is torn down, and no rows are left"
          (let [destroyed (atom 0)
                refusing  (reify provisioning/Provisioner
                            (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                            (init!    [_ _ _ _]   (throw (ex-info "user exists" {:status-code        409
                                                                                 :workspace/cleanup? false})))
                            (grant!   [_ _ _ _ _] nil)
                            (destroy! [_ _ _ _]   (swap! destroyed inc)))]
            (with-redefs [provisioning/dispatching-provisioner refusing]
              (let [e (is (thrown-with-msg? ExceptionInfo #"user exists"
                                            (ws/create-workspace! {:name         "Refused"
                                                                   :creator_id   (mt/user->id :crowberto)
                                                                   :database_ids [db-id]})))]
                (is (=? {:status-code 409 :cleanup_required false} (ex-data e))
                    "the refused row is gone, so the teardown finds nothing and the 409 stands")))
            (is (zero? @destroyed)
                "destroy would drop the user init refused, which may belong to another parent")
            (is (not (t2/exists? :model/Workspace :name "Refused")))
            (is (not (t2/exists? :model/WorkspaceDatabase :database_id db-id)))))
        (testing "provision-workspace! deletes a refused row without a teardown, so a later delete has nothing to drop"
          (let [destroyed (atom 0)
                refusing  (reify provisioning/Provisioner
                            (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                            (init!    [_ _ _ _]   (throw (ex-info "user exists" {:status-code        409
                                                                                 :workspace/cleanup? false})))
                            (grant!   [_ _ _ _ _] nil)
                            (destroy! [_ _ _ _]   (swap! destroyed inc)))
                ws        (ws/create-workspace! {:name "Refused later" :creator_id (mt/user->id :crowberto)})]
            (t2/insert! :model/WorkspaceDatabase {:workspace_id     (:id ws)
                                                  :database_id      db-id
                                                  :input_schemas    ["public"]
                                                  :database_details {}
                                                  :output_namespace ""
                                                  :status           :unprovisioned})
            (is (= 1 (provisioning/provision-workspace! (:id ws) refusing)))
            (is (not (t2/exists? :model/WorkspaceDatabase :workspace_id (:id ws))))
            (with-redefs [provisioning/dispatching-provisioner refusing]
              (is (nil? (ws/delete-workspace! (:id ws)))))
            (is (zero? @destroyed))))
        (testing "a grant error with :workspace/cleanup? false still tears down what init made, and keeps the row"
          (let [destroyed (atom 0)
                failing   (reify provisioning/Provisioner
                            (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                            (init!    [_ _ _ _]   nil)
                            (grant!   [_ _ _ _ _] (throw (ex-info "grant failed" {:workspace/cleanup? false})))
                            (destroy! [_ _ _ _]   (swap! destroyed inc)))
                ws        (ws/create-workspace! {:name "Grant failed" :creator_id (mt/user->id :crowberto)})
                wsd-id    (t2/insert-returning-pk! :model/WorkspaceDatabase {:workspace_id     (:id ws)
                                                                             :database_id      db-id
                                                                             :input_schemas    ["public"]
                                                                             :database_details {}
                                                                             :output_namespace ""
                                                                             :status           :unprovisioned})]
            (is (= 1 (provisioning/provision-workspace! (:id ws) failing)))
            (is (= 1 @destroyed) "only init's error can say that nothing is left to tear down")
            (is (=? {:status :unprovisioned} (t2/select-one :model/WorkspaceDatabase :id wsd-id)))
            (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
              (is (nil? (ws/delete-workspace! (:id ws)))))))
        (testing "provisioning failure whose cleanup also fails keeps the workspace and throws, so that a later delete can retry"
          (let [wedged (reify provisioning/Provisioner
                         (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                         (init!    [_ _ _ _]   (throw (ex-info "boom" {:status-code 409})))
                         (grant!   [_ _ _ _ _] nil)
                         (destroy! [_ _ _ _]   (throw (ex-info "warehouse down" {}))))]
            (with-redefs [provisioning/dispatching-provisioner wedged]
              (let [e (is (thrown? ExceptionInfo
                                   (ws/create-workspace! {:name         "Wedged"
                                                          :creator_id   (mt/user->id :crowberto)
                                                          :database_ids [db-id]})))]
                (is (=? {:status-code 500 :cleanup_required true :message #"boom.*warehouse down"}
                        (ex-data e))
                    "two failures are a 500, and the kept workspace still needs a delete")))
            (let [ws (t2/select-one :model/Workspace :name "Wedged")]
              (is (some? ws)
                  "the workspace must be kept while any database row remains")
              (is (=? [{:status :unprovisioned}]
                      (t2/select :model/WorkspaceDatabase :workspace_id (:id ws)))
                  "the row whose teardown failed is kept, forced :unprovisioned")
              ;; retry the teardown via delete once the warehouse is back
              (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                (is (nil? (ws/delete-workspace! (:id ws)))))
              (is (nil? (ws/get-workspace (:id ws)))))))
        (testing "success: the attached database comes back :provisioned"
          (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
            (let [ws (ws/create-workspace! {:name         "Provisioned"
                                            :creator_id   (mt/user->id :crowberto)
                                            :database_ids [db-id]})]
              (is (=? [{:database_id   db-id
                        :input_schemas ["public"]
                        :status        :provisioned}]
                      (:databases ws))))))))))

(deftest create-workspace-empty-input-schemas-test
  (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
    (testing "a database with schemas but no synced tables is rejected before anything is created"
      (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                  :details  {}
                                                  :settings {:database-enable-workspaces true}}]
        (mt/with-model-cleanup [:model/Workspace]
          (is (=? {:message #".*no synced schemas.*"
                   :data    {:status-code 400 :database_id db-id}}
                  (try
                    (ws/create-workspace! {:name         "No Inputs"
                                           :creator_id   (mt/user->id :crowberto)
                                           :database_ids [db-id]})
                    nil
                    (catch ExceptionInfo e {:message (ex-message e) :data (ex-data e)}))))
          (is (not (t2/exists? :model/Workspace :name "No Inputs"))))))
    (testing "a schemaless database (MySQL) is accepted with empty input_schemas"
      (mt/with-temp [:model/Database {db-id :id} {:engine   :mysql
                                                  :details  {}
                                                  :settings {:database-enable-workspaces true}}
                     :model/Table _ {:db_id db-id :schema nil :active true}]
        (mt/with-model-cleanup [:model/Workspace]
          (is (=? [{:database_id   db-id
                    :input_schemas []
                    :status        :provisioned}]
                  (:databases (ws/create-workspace! {:name         "MySQL"
                                                     :creator_id   (mt/user->id :crowberto)
                                                     :database_ids [db-id]})))))))))

(deftest refused-init-row-is-never-torn-down-by-a-concurrent-delete-test
  (testing "a DELETE that runs once a refused init has released the per-row lock destroys nothing"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db-id :schema "public" :active true}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [destroyed   (atom 0)
              refusing    (reify provisioning/Provisioner
                            (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                            (init!    [_ _ _ _]   (throw (ex-info "user exists" {:status-code        409
                                                                                 :workspace/cleanup? false})))
                            (grant!   [_ _ _ _ _] nil)
                            (destroy! [_ _ _ _]   (swap! destroyed inc)))
              lock!       provisioning/do-with-workspace-database-lock
              injected?   (atom false)
              deleted     (promise)]
          (with-redefs [provisioning/dispatching-provisioner           refusing
                        provisioning/do-with-workspace-database-lock (fn [wsd-id thunk]
                                                                       (try
                                                                         (lock! wsd-id thunk)
                                                                         (finally
                                                                           (when (compare-and-set! injected? false true)
                                                                             (let [ws-id (t2/select-one-pk :model/Workspace :name "Refused race")]
                                                                               (deliver deleted
                                                                                        (deref (future
                                                                                                 (try
                                                                                                   (ws/delete-workspace! ws-id)
                                                                                                   :deleted
                                                                                                   (catch Throwable t t)))
                                                                                               90000
                                                                                               :timeout)))))))]
            (is (thrown-with-msg? ExceptionInfo #"user exists"
                                  (ws/create-workspace! {:name         "Refused race"
                                                         :creator_id   (mt/user->id :crowberto)
                                                         :database_ids [db-id]}))))
          (is (= :deleted (deref deleted 0 :not-run))
              "the DELETE ran to completion after the lock was released")
          (is (zero? @destroyed)
              "destroy would drop the user init refused, which may belong to another parent"))))))

(deftest create-workspace-failure-never-destroys-a-database-whose-init-never-ran-test
  (mt/with-temp [:model/Database {db1-id :id} {:engine   :postgres
                                               :details  {}
                                               :settings {:database-enable-workspaces true}}
                 :model/Table _ {:db_id db1-id :schema "public" :active true}
                 :model/Database {db2-id :id} {:engine   :postgres
                                               :details  {}
                                               :settings {:database-enable-workspaces true}}
                 :model/Table _ {:db_id db2-id :schema "public" :active true}]
    (mt/with-model-cleanup [:model/Workspace]
      (letfn [(refusing [refused-db-id inited destroyed]
                (reify provisioning/Provisioner
                  (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                  (init!    [_ _ db _]
                    (swap! inited conj (:id db))
                    (when (= refused-db-id (:id db))
                      (throw (ex-info "user exists" {:status-code 409 :workspace/cleanup? false}))))
                  (grant!   [_ _ _ _ _] nil)
                  (destroy! [_ _ db _]  (swap! destroyed conj (:id db)))))
              (create! [ws-name provisioner]
                (with-redefs [provisioning/dispatching-provisioner provisioner]
                  (try
                    (ws/create-workspace! {:name         ws-name
                                           :creator_id   (mt/user->id :crowberto)
                                           :database_ids [db1-id db2-id]})
                    nil
                    (catch ExceptionInfo e (ex-data e)))))]
        (testing "the second database refuses after the first one's init ran: the first is destroyed"
          (let [inited    (atom #{})
                destroyed (atom #{})]
            (is (=? {:status-code 409 :cleanup_required false}
                    (create! "Second refused" (refusing db2-id inited destroyed))))
            (is (= #{db1-id db2-id} @inited))
            (is (= #{db1-id} @destroyed))))
        (testing "the first database refuses: the second one's init never ran, so nothing of it is destroyed"
          (let [inited    (atom #{})
                destroyed (atom #{})]
            (is (=? {:status-code 409 :cleanup_required false}
                    (create! "First refused" (refusing db1-id inited destroyed))))
            (is (= #{db1-id} @inited)
                "only the first database's init ran")
            (is (= #{} @destroyed)
                "destroy drops the role and schema of the computed names, which another parent may own")
            (is (not (t2/exists? :model/Workspace :name "First refused")))
            (is (not (t2/exists? :model/WorkspaceDatabase :database_id [:in [db1-id db2-id]])))))))))

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
        (is (nil? (ws/delete-workspace! (:id ws))))
        (is (nil? (ws/get-workspace (:id ws))))))))

(deftest delete-workspace-with-pending-status-test
  (testing "a stale :provisioning/:deprovisioning row (left by a crashed instance) is torn down like any other state"
    (doseq [pending-status [:provisioning :deprovisioning]]
      (testing (str "status " pending-status)
        (mt/with-model-cleanup [:model/Workspace]
          (let [ws     (ws/create-workspace! {:name       (str "Pending " (name pending-status))
                                              :creator_id (mt/user->id :crowberto)})
                _      (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                         (add-database! (:id ws) (mt/id) ["PUBLIC"]))
                wsd-id (t2/select-one-pk :model/WorkspaceDatabase :workspace_id (:id ws))]
            ;; force the row into a pending state last touched long ago, as a crash
            ;; leaves it. :provisioning rows that crashed never stored their iso
            ;; details, so clear them too.
            (t2/update! :model/WorkspaceDatabase {:id wsd-id}
                        (cond-> {:status     pending-status
                                 :updated_at (t/minus (t/offset-date-time) (t/hours 1))}
                          (= pending-status :provisioning)
                          (assoc :output_namespace "" :database_details {})))
            (let [destroyed? (atom false)
                  recording  (reify provisioning/Provisioner
                               (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                               (init!    [_ _ _ _]   nil)
                               (grant!   [_ _ _ _ _] nil)
                               (destroy! [_ _ _ _]   (reset! destroyed? true) nil))]
              (with-redefs [provisioning/dispatching-provisioner recording]
                (is (nil? (ws/delete-workspace! (:id ws)))))
              (is (true? @destroyed?)
                  "pending rows get a real warehouse teardown, not an app-DB-only removal")
              (is (nil? (ws/get-workspace (:id ws))))
              (is (not (t2/exists? :model/WorkspaceDatabase :id wsd-id))))))))))

(deftest delete-workspace-while-in-flight-test
  (testing "a fresh :provisioning/:deprovisioning row means work is running: delete refuses with 409 and touches nothing"
    (doseq [pending-status [:provisioning :deprovisioning]]
      (testing (str "status " pending-status)
        (mt/with-model-cleanup [:model/Workspace]
          (let [ws         (ws/create-workspace! {:name       (str "Busy " (name pending-status))
                                                  :creator_id (mt/user->id :crowberto)})
                _          (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                             (add-database! (:id ws) (mt/id) ["PUBLIC"]))
                wsd-id     (t2/select-one-pk :model/WorkspaceDatabase :workspace_id (:id ws))
                _          (t2/update! :model/WorkspaceDatabase {:id wsd-id} {:status pending-status})
                destroyed? (atom false)
                recording  (reify provisioning/Provisioner
                             (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                             (init!    [_ _ _ _]   nil)
                             (grant!   [_ _ _ _ _] nil)
                             (destroy! [_ _ _ _]   (reset! destroyed? true) nil))
                e          (with-redefs [provisioning/dispatching-provisioner recording]
                             (try
                               (ws/delete-workspace! (:id ws))
                               nil
                               (catch ExceptionInfo e e)))]
            (is (=? {:status-code 409 :error-code "workspace_busy"}
                    (ex-data e)))
            (is (false? @destroyed?)
                "no teardown runs while the other operation holds the row")
            (is (=? {:status pending-status}
                    (t2/select-one :model/WorkspaceDatabase :id wsd-id)))
            (is (some? (ws/get-workspace (:id ws))))
            (t2/update! :model/WorkspaceDatabase {:id wsd-id} {:status :provisioned})
            (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
              (is (nil? (ws/delete-workspace! (:id ws)))))))))))

;;; ------------------------------------- Delete during a running create ----------------------------------------

(defn- do-with-committed-databases!
  "Call `f` with the ids of two committed Databases eligible for workspaces, each with one synced Table. Afterwards,
  delete any Workspace created meanwhile, the Databases and their WorkspaceDatabase rows. Not `mt/with-temp`: a
  thread started inside it shares the test's app-DB connection, so the per-row locks of a create and a delete on two
  threads would not exclude each other."
  [f]
  (let [db-ids (vec (for [_ (range 2)]
                      (let [db-id (t2/insert-returning-pk! :model/Database {:name     (mt/random-name)
                                                                            :engine   :postgres
                                                                            :details  {}
                                                                            :settings {:database-enable-workspaces true}})]
                        (t2/insert! :model/Table {:db_id db-id :schema "public" :name "t" :active true})
                        db-id)))]
    (try
      (mt/with-model-cleanup [:model/Workspace]
        (apply f db-ids))
      (finally
        (t2/delete! :model/WorkspaceDatabase :database_id [:in db-ids])
        (t2/delete! :model/Database :id [:in db-ids])))))

(defn- recording-provisioner
  "A provisioner that adds the id of each Database it inits to the set in `inited`, and of each Database it destroys
  to the set in `destroyed`. When given, `init!` is called with the Database after it is recorded."
  [inited destroyed & {:keys [init!]}]
  (reify provisioning/Provisioner
    (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
    (init!    [_ _ db _]  (swap! inited conj (:id db)) (when init! (init! db)))
    (grant!   [_ _ _ _ _] nil)
    (destroy! [_ _ db _]  (swap! destroyed conj (:id db)))))

(defn- gated-provision-workspace-database!
  "A replacement for `provisioning/provision-workspace-database!`. Its first call delivers the row's id to `at-gate`
  and waits for `release`: `:before` the row's warehouse work starts, or `:after` the row is provisioned."
  [where at-gate release]
  (let [provision! provisioning/provision-workspace-database!
        calls      (atom 0)
        gate!      (fn [wsd-id]
                     (deliver at-gate wsd-id)
                     (deref release 30000 nil))]
    (fn [wsd-id provisioner]
      (let [first? (= 1 (swap! calls inc))]
        (when (and first? (= where :before))
          (gate! wsd-id))
        (let [result (provision! wsd-id provisioner)]
          (when (and first? (= where :after))
            (gate! wsd-id))
          result)))))

(deftest delete-before-a-database-starts-provisioning-answers-busy-test
  (doseq [[gate where expected-statuses] [["before the first database's provisioning starts" :before [:provisioning :provisioning]]
                                          ["after the first database is provisioned, before the second's starts" :after [:provisioned :provisioning]]]]
    (testing (str "a DELETE " gate)
      (do-with-committed-databases!
       (fn [db1-id db2-id]
         (let [ws-name   (str "Gated delete " (name where))
               inited    (atom #{})
               destroyed (atom #{})
               at-gate   (promise)
               release   (promise)]
           (try
             (is (nil? t2.connection/*current-connectable*)
                 "premise: no app-DB connection is bound, so each thread uses its own")
             (with-redefs [provisioning/dispatching-provisioner         (recording-provisioner inited destroyed)
                           provisioning/provision-workspace-database! (gated-provision-workspace-database! where at-gate release)]
               (let [create  (future (try
                                       (ws/create-workspace! {:name         ws-name
                                                              :creator_id   (mt/user->id :crowberto)
                                                              :database_ids [db1-id db2-id]})
                                       (catch ExceptionInfo e e)))
                     _       (is (not= ::timeout (deref at-gate 20000 ::timeout))
                                 "premise: the create reached the gate")
                     ws-id   (t2/select-one-pk :model/Workspace :name ws-name)
                     _       (is (= expected-statuses
                                    (t2/select-fn-vec :status :model/WorkspaceDatabase :workspace_id ws-id
                                                      {:order-by [:id]}))
                                 "every database the create has not finished is :provisioning, so the busy check sees it")
                     delete  (try
                               (ws/delete-workspace! ws-id)
                               :deleted
                               (catch ExceptionInfo e (ex-data e)))
                     _       (deliver release true)
                     created (deref create 30000 ::timeout)]
                 (is (=? {:status-code 409 :error-code "workspace_busy"} delete))
                 (is (= #{} (reduce disj @destroyed @inited))
                     "a teardown drops the user and schema of the computed names, which another parent may own")
                 (is (=? {:databases [{:status :provisioned} {:status :provisioned}]}
                         created)
                     "the refused DELETE left the create alone")))
             (finally
               (deliver release true)))))))))

(deftest delete-during-a-live-create-answers-busy-and-destroys-nothing-test
  (testing "a DELETE while the first database's init runs answers 409 workspace_busy, and destroys nothing of that database after init refuses"
    (do-with-committed-databases!
     (fn [db1-id db2-id]
       (let [inited    (atom #{})
             destroyed (atom #{})
             in-init   (promise)
             release   (promise)
             refusing  (recording-provisioner inited destroyed
                                              :init! (fn [db]
                                                       (when (= db1-id (:id db))
                                                         (deliver in-init true)
                                                         (deref release 20000 nil)
                                                         (throw (ex-info "user exists" {:status-code        409
                                                                                        :workspace/cleanup? false})))))]
         (try
           (is (nil? t2.connection/*current-connectable*)
               "premise: no app-DB connection is bound, so each thread uses its own")
           (with-redefs [provisioning/dispatching-provisioner refusing]
             (let [create (future (try
                                    (ws/create-workspace! {:name         "Refused during delete"
                                                           :creator_id   (mt/user->id :crowberto)
                                                           :database_ids [db1-id db2-id]})
                                    (catch ExceptionInfo e e)))
                   _      (is (true? (deref in-init 20000 false))
                              "premise: the create is in the first database's init")
                   ws-id  (t2/select-one-pk :model/Workspace :name "Refused during delete")
                   delete (future (try
                                    (ws/delete-workspace! ws-id)
                                    :deleted
                                    (catch ExceptionInfo e (ex-data e))))
                   early  (deref delete 5000 ::still-waiting)]
               (deliver release true)
               (is (=? {:status-code 409 :error-code "workspace_busy"} early)
                   "the DELETE answers at once, without waiting for the create's per-row lock")
               (is (=? {:status-code 409 :error-code "workspace_busy"} (deref delete 90000 ::timeout)))
               (is (re-find #"user exists" (str (ex-message (deref create 90000 ::timeout))))
                   "the create answers init's refusal")))
           (is (= #{db1-id} @inited)
               "premise: only the first database's init ran")
           (is (not (contains? @destroyed db1-id))
               "a teardown drops the user init refused, which another parent may own")
           (is (not (t2/exists? :model/Workspace :name "Refused during delete")))
           (finally
             (deliver release true))))))))

(deftest delete-workspace-teardown-failure-test
  (testing "when teardown fails, nothing is deleted: the row and the workspace are kept for retry"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws     (ws/create-workspace! {:name "Unreachable WS" :creator_id (mt/user->id :crowberto)})
            _      (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                     (add-database! (:id ws) (mt/id) ["PUBLIC"]))
            wsd-id (t2/select-one-pk :model/WorkspaceDatabase :workspace_id (:id ws))
            boom   (reify provisioning/Provisioner
                     (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                     (init!    [_ _ _ _]   nil)
                     (grant!   [_ _ _ _ _] nil)
                     (destroy! [_ _ _ _]   (throw (ex-info "Connection refused" {}))))]
        (with-redefs [provisioning/dispatching-provisioner boom]
          (is (thrown-with-msg? ExceptionInfo #"Connection refused"
                                (ws/delete-workspace! (:id ws)))
              "the combined teardown failure is thrown, carrying what the database returned"))
        (is (some? (ws/get-workspace (:id ws)))
            "the workspace must be kept when any teardown fails")
        (is (=? {:status :unprovisioned}
                (t2/select-one :model/WorkspaceDatabase :id wsd-id))
            "the failed row is kept, forced :unprovisioned")
        (testing "retrying the delete once the warehouse is reachable finishes the job"
          (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
            (is (nil? (ws/delete-workspace! (:id ws)))))
          (is (nil? (ws/get-workspace (:id ws))))
          (is (not (t2/exists? :model/WorkspaceDatabase :id wsd-id))))))))

(deftest delete-workspace-combines-teardown-failures-test
  (testing "every database gets its teardown attempt and all failures come back as one combined exception"
    (mt/with-temp [:model/Database {db2-id :id} {:engine   :postgres
                                                 :details  {}
                                                 :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [ws   (ws/create-workspace! {:name "Multi fail" :creator_id (mt/user->id :crowberto)})
              _    (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                     (add-database! (:id ws) (mt/id) ["PUBLIC"])
                     (add-database! (:id ws) db2-id ["public"]))
              boom (reify provisioning/Provisioner
                     (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                     (init!    [_ _ _ _]   nil)
                     (grant!   [_ _ _ _ _] nil)
                     (destroy! [_ _ db _]  (throw (ex-info (str "down: " (:id db)) {}))))
              e    (with-redefs [provisioning/dispatching-provisioner boom]
                     (try
                       (ws/delete-workspace! (:id ws))
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
          (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
            (is (nil? (ws/delete-workspace! (:id ws))))))))))

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
