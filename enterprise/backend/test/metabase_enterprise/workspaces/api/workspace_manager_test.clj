(ns metabase-enterprise.workspaces.api.workspace-manager-test
  "HTTP smoke tests for the workspace-manager API. Permission rules are exercised at the
   model level — see workspace_test.clj and workspace_database_test.clj. These tests just
   verify routing, request/response shape, and that the model-level permission predicates
   are wired into the endpoints (one 403 spot-check is enough)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase-enterprise.workspaces.models.workspace :as workspace]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.permissions.test-util :as perms.test-util]
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
    (details [_ _ _ _]
      {:schema "mb_iso_stub" :database_details {:user "stub_user" :password "stub_pass"}})
    (init! [_ _ _ _] nil)
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ _ _] nil)))

(deftest crud-smoke-test
  (testing "create, get, list, delete round-trip"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db-id :schema "public" :active true}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (let [{ws-id :id :as ws} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                         {:name "Smoke Test" :database_ids [db-id]})]
            (is (=? {:id        pos-int?
                     :name      "Smoke Test"
                     :databases [{:database_id db-id}]
                     :creator   some?}
                    ws))
            (testing "get"
              (is (=? {:id ws-id :name "Smoke Test"}
                      (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id)))))
            (testing "list"
              (is (=? [{:id ws-id}]
                      (mt/user-http-request :crowberto :get 200 "ee/workspace-manager/"))))
            (testing "delete"
              (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id))
              (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id)))))))))

(deftest delete-workspace-pending-databases-test
  (testing "DELETE tears down a stale pending database (left by a crashed instance) like any other state"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db-id :schema "public" :active true}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                  {:name "Pending" :database_ids [db-id]})
                wsd-id      (t2/select-one-pk :model/WorkspaceDatabase :workspace_id ws-id)]
            (t2/update! :model/WorkspaceDatabase {:id wsd-id}
                        {:status     :provisioning
                         :updated_at (t/minus (t/offset-date-time) (t/hours 1))})
            (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id))
            (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id))))))))

(deftest delete-workspace-during-create-test
  (testing "DELETE while a create is still provisioning answers 409 at once, and the create still succeeds"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db-id :schema "public" :active true}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [started  (promise)
              release  (promise)
              blocking (reify provisioning/Provisioner
                         (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                         (init!    [_ _ _ _]   (deliver started true) (deref release 30000 nil) nil)
                         (grant!   [_ _ _ _ _] nil)
                         (destroy! [_ _ _ _]   nil))]
          (with-redefs [provisioning/dispatching-provisioner blocking]
            (let [create (future (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                       {:name "Slow create" :database_ids [db-id]}))]
              (try
                (is (true? (deref started 10000 false)) "the create reached the warehouse step")
                (let [ws-id (t2/select-one-pk :model/Workspace :name "Slow create")]
                  (is (=? {:error-code "workspace_busy"}
                          (mt/user-http-request :crowberto :delete 409 (str "ee/workspace-manager/" ws-id))))
                  (deliver release true)
                  (is (=? {:id ws-id :databases [{:status "provisioned"}]}
                          (deref create 10000 ::timed-out))
                      "the refused delete left the create alone")
                  (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id)))
                (finally
                  (deliver release true)
                  (deref create 10000 nil))))))))))

(deftest delete-workspace-teardown-failure-test
  (testing "DELETE returns a 500 with the database's error and keeps the workspace when a teardown fails"
    ;; Committed `with-temp`: the teardown-failure bookkeeping writes on a fresh autocommit connection, which
    ;; cannot see rows inside the default rollback-only `with-temp` transaction.
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                  :details  {}
                                                  :settings {:database-enable-workspaces true}}
                     :model/Table _ {:db_id db-id :schema "public" :active true}]
        (mt/with-model-cleanup [:model/Workspace]
          (let [{ws-id :id} (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                              (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                    {:name "Unreachable" :database_ids [db-id]}))
                boom        (reify provisioning/Provisioner
                              (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                              (init!    [_ _ _ _]   nil)
                              (grant!   [_ _ _ _ _] nil)
                              (destroy! [_ _ _ _]   (throw (ex-info "Connection refused" {}))))]
            (with-redefs [provisioning/dispatching-provisioner boom]
              (is (=? {:message "Connection refused"}
                      (mt/user-http-request :crowberto :delete 500 (str "ee/workspace-manager/" ws-id)))))
            (testing "the workspace survives, its database shown as teardown_failed, and a retry deletes it"
              (is (=? {:databases [{:database_id      db-id
                                    :output_namespace "mb_iso_stub"
                                    :status           "teardown_failed"}]}
                      (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id))))
              (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id)))
              (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id)))))))))

(deftest delete-workspace-force-test
  (testing "DELETE ?force=true drops teardown_failed databases without a warehouse teardown"
    ;; Committed `with-temp`: the teardown-failure bookkeeping writes on a fresh autocommit connection, which
    ;; cannot see rows inside the default rollback-only `with-temp` transaction.
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                  :details  {}
                                                  :settings {:database-enable-workspaces true}}
                     :model/Table _ {:db_id db-id :schema "public" :active true}]
        (mt/with-model-cleanup [:model/Workspace]
          (let [{ws-id :id} (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                              (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                    {:name "Gone for good" :database_ids [db-id]}))
                destroys    (atom 0)
                boom        (reify provisioning/Provisioner
                              (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                              (init!    [_ _ _ _]   nil)
                              (grant!   [_ _ _ _ _] nil)
                              (destroy! [_ _ _ _]   (swap! destroys inc) (throw (ex-info "Connection refused" {}))))]
            (with-redefs [provisioning/dispatching-provisioner boom]
              (testing "force does not skip the teardown of a database that is not teardown_failed"
                (mt/user-http-request :crowberto :delete 500 (str "ee/workspace-manager/" ws-id) :force true)
                (is (= 1 @destroys)))
              (testing "without force, a teardown_failed database keeps failing"
                (mt/user-http-request :crowberto :delete 500 (str "ee/workspace-manager/" ws-id))
                (is (= 2 @destroys)))
              (testing "with force, the workspace is deleted without calling destroy!, and the leftovers are logged"
                (mt/with-log-messages-for-level [messages [metabase-enterprise.workspaces.provisioning :warn]]
                  (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id) :force true)
                  (is (= 2 @destroys))
                  (is (some #(re-find #"mb_iso_stub.*stub_user" (:message %)) (messages)))))
              (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id))
              (is (not (t2/exists? :model/WorkspaceDatabase :database_id db-id))
                  "no row is left to block deleting the Database"))))))))

(deftest delete-workspace-teardown-conflict-test
  (testing "DELETE passes a database's 409 from teardown through, so the caller can tell retry-later from broken"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db-id :schema "public" :active true}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [{ws-id :id} (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                            (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                  {:name "Session open" :database_ids [db-id]}))
              busy        (reify provisioning/Provisioner
                            (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                            (init!    [_ _ _ _]   nil)
                            (grant!   [_ _ _ _ _] nil)
                            (destroy! [_ _ _ _]   (throw (ex-info "1 session(s) of the workspace user are still open"
                                                                  {:status-code 409}))))]
          (with-redefs [provisioning/dispatching-provisioner busy]
            (is (=? {:message "1 session(s) of the workspace user are still open"}
                    (mt/user-http-request :crowberto :delete 409 (str "ee/workspace-manager/" ws-id)))))
          (testing "the workspace survives and a retry deletes it"
            (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id))
            (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
              (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id)))))))))

(deftest create-workspace-provisioning-failure-test
  (testing "POST / never returns 200 when provisioning fails"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db-id :schema "public" :active true}]
      (mt/with-model-cleanup [:model/Workspace]
        (letfn [(provisioner [init-error destroy-error]
                  (reify provisioning/Provisioner
                    (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                    (init!    [_ _ _ _]   (throw init-error))
                    (grant!   [_ _ _ _ _] nil)
                    (destroy! [_ _ _ _]   (when destroy-error (throw destroy-error)))))
                (create! [status-code]
                  (mt/user-http-request :crowberto :post status-code "ee/workspace-manager/"
                                        {:name "Failing" :database_ids [db-id]}))]
          (doseq [status-code [409 412]]
            (testing (str "a database's " status-code " reaches the caller")
              (with-redefs [provisioning/dispatching-provisioner
                            (provisioner (ex-info "refused" {:status-code status-code}) nil)]
                (is (=? {:message "refused" :cleanup_required false}
                        (create! status-code))))))
          (testing "an error without a status code is a 500"
            (with-redefs [provisioning/dispatching-provisioner (provisioner (ex-info "boom" {}) nil)]
              (is (=? {:message "boom" :cleanup_required false}
                      (create! 500)))))
          (is (not (t2/exists? :model/Workspace :name "Failing"))
              "a create whose cleanup succeeded leaves no workspace")
          (testing "a failed cleanup is a 500 that says the kept workspace needs a delete"
            (with-redefs [provisioning/dispatching-provisioner
                          (provisioner (ex-info "refused" {:status-code 409}) (ex-info "warehouse down" {}))]
              (let [response (create! 500)
                    kept-id  (t2/select-one-pk :model/Workspace :name "Failing")]
                (is (=? {:message "refused; warehouse down" :cleanup_required true} response))
                (is (= kept-id (:workspace_id response))
                    "the 500 names the kept workspace, so the client can delete it")))
            (let [ws-id (t2/select-one-pk :model/Workspace :name "Failing")]
              (is (some? ws-id))
              (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id))))))))))

(deftest create-workspace-row-delete-failure-test
  (testing "POST / is a 500 that asks for a delete when the warehouse is clean but the Workspace row stays"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db-id :schema "public" :active true}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [failing (reify provisioning/Provisioner
                        (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                        (init!    [_ _ _ _]   (throw (ex-info "refused" {:status-code 409})))
                        (grant!   [_ _ _ _ _] nil)
                        (destroy! [_ _ _ _]   nil))]
          (with-redefs [provisioning/dispatching-provisioner failing
                        workspace/delete-workspace!          (fn [_id] (throw (ex-info "app db down" {})))]
            (is (=? {:message "refused; Could not delete the workspace row." :cleanup_required true}
                    (mt/user-http-request :crowberto :post 500 "ee/workspace-manager/"
                                          {:name "Row kept" :database_ids [db-id]}))))
          (let [ws-id (t2/select-one-pk :model/Workspace :name "Row kept")]
            (is (some? ws-id) "the Workspace row is kept, so the caller must delete it")
            (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
              (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id)))))))))

(deftest create-workspace-second-database-failure-test
  (testing "POST / with two databases: the second fails to provision, and the first one's warehouse objects are torn down"
    (mt/with-temp [:model/Database {db1-id :id} {:engine   :postgres
                                                 :details  {}
                                                 :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db1-id :schema "public" :active true}
                   :model/Database {db2-id :id} {:engine   :postgres
                                                 :details  {}
                                                 :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db2-id :schema "public" :active true}]
      (mt/with-model-cleanup [:model/Workspace]
        (let [inited    (atom #{})
              destroyed (atom #{})
              failing   (reify provisioning/Provisioner
                          (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                          (init!    [_ _ db _]
                            (when (= db2-id (:id db))
                              (throw (ex-info "refused" {:status-code 409})))
                            (swap! inited conj (:id db)))
                          (grant!   [_ _ _ _ _] nil)
                          (destroy! [_ _ db _]  (swap! destroyed conj (:id db))))]
          (with-redefs [provisioning/dispatching-provisioner failing]
            (is (=? {:message "refused" :cleanup_required false}
                    (mt/user-http-request :crowberto :post 409 "ee/workspace-manager/"
                                          {:name "Two" :database_ids [db1-id db2-id]}))))
          (is (= #{db1-id} @inited) "the first database was provisioned before the second failed")
          (is (contains? @destroyed db1-id) "the first database's warehouse objects are torn down")
          (is (not (t2/exists? :model/Workspace :name "Two")))
          (is (not (t2/exists? :model/WorkspaceDatabase :database_id [:in [db1-id db2-id]]))))))))

(deftest create-workspace-with-database-ids-test
  (testing "POST / attaches and provisions the given databases (each must be eligible) with their schemas"
    (mt/with-temp [:model/Database {eligible-id :id} {:engine   :postgres
                                                      :details  {}
                                                      :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id eligible-id :schema "public" :active true}
                   :model/Table _ {:db_id eligible-id :schema "analytics" :active true}
                   :model/Database {ineligible-id :id} {:engine :postgres :details {}}
                   :model/Database {tableless-id :id} {:engine   :postgres
                                                       :details  {}
                                                       :settings {:database-enable-workspaces true}}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (is (=? {:databases [{:database_id   eligible-id
                                :input_schemas ["analytics" "public"]
                                :status        "provisioned"}]}
                  (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                        {:name "With dbs" :database_ids [eligible-id]})))
          (testing "an ineligible database is rejected"
            (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/"
                                  {:name "Nope" :database_ids [ineligible-id]}))
          (testing "a database with no synced schemas is rejected"
            (is (=? #".*no synced schemas.*"
                    (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/"
                                          {:name "Nope" :database_ids [tableless-id]}))))
          (testing "at least one database is required"
            (mt/user-http-request :crowberto :post 400 "ee/workspace-manager/"
                                  {:name "Nope" :database_ids []})))))))

;;; ------------------------------------------ Idempotency-Key -------------------------------------------------

(defn- counting-provisioner
  "A stub provisioner whose `init!` (one call per provisioned database) counts its
  calls in `inits` and then runs `on-init`."
  [inits on-init]
  (reify provisioning/Provisioner
    (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
    (init!    [_ _ _ _]   (swap! inits inc) (on-init) nil)
    (grant!   [_ _ _ _ _] nil)
    (destroy! [_ _ _ _]   nil)))

(defn- create-with-key [expected-status idempotency-key ws-name db-id]
  (mt/user-http-request :crowberto :post expected-status "ee/workspace-manager/"
                        {:request-options {:headers {"idempotency-key" idempotency-key}}}
                        {:name ws-name :database_ids [db-id]}))

(defn- do-with-eligible-database!
  "Call `f` with the id of a committed Database eligible for workspaces, deleting it and
  any Workspace created meanwhile afterwards. Not `mt/with-temp`: that runs its body in
  a rollback-only transaction which the request threads of these tests would inherit
  and share, so concurrent creates would not race in separate transactions."
  [f]
  (let [db-id (t2/insert-returning-pk! :model/Database {:name     (mt/random-name)
                                                        :engine   :postgres
                                                        :details  {}
                                                        :settings {:database-enable-workspaces true}})]
    ;; a synced table, so the database has an input schema and create does not refuse it
    (t2/insert! :model/Table {:db_id db-id :schema "public" :name "t" :active true})
    (try
      (mt/with-model-cleanup [:model/Workspace]
        (f db-id))
      (finally
        (t2/delete! :model/Database :id db-id)))))

(deftest create-idempotency-retry-after-success-test
  (testing "a retry with the same Idempotency-Key returns the first workspace and provisions nothing"
    (do-with-eligible-database!
     (fn [db-id]
       (let [inits (atom 0)]
         (with-redefs [provisioning/dispatching-provisioner (counting-provisioner inits (constantly nil))]
           (let [first-ws (create-with-key 200 "retry-after-success" "Retried" db-id)
                 retry-ws (create-with-key 200 "retry-after-success" "Retried" db-id)]
             (is (=? {:id pos-int? :databases [{:status "provisioned"}]} first-ws))
             (is (= first-ws retry-ws)
                 "the retry gets the same response as the original create")
             (is (= 1 @inits))
             (is (= 1 (t2/count :model/Workspace :idempotency_key "retry-after-success"))))))))))

(deftest create-idempotency-retry-while-in-flight-test
  (testing "a retry while the first create is still provisioning answers 409 workspace_busy and provisions nothing"
    (do-with-eligible-database!
     (fn [db-id]
       (let [inits   (atom 0)
             started (promise)
             release (promise)]
         (with-redefs [provisioning/dispatching-provisioner (counting-provisioner
                                                             inits
                                                             #(do (deliver started true)
                                                                  (deref release 30000 nil)))]
           (let [create (future (create-with-key 200 "retry-in-flight" "Slow" db-id))]
             (try
               (is (true? (deref started 10000 false)) "the first create reached the warehouse step")
               (is (=? {:error-code "workspace_busy"}
                       (create-with-key 409 "retry-in-flight" "Slow" db-id)))
               (deliver release true)
               (is (=? {:databases [{:status "provisioned"}]}
                       (deref create 10000 ::timed-out))
                   "the refused retry left the first create alone")
               (is (= 1 @inits))
               (finally
                 (deliver release true)
                 (deref create 10000 nil))))))))))

(deftest create-idempotency-retry-after-failure-test
  (testing "a create that failed and deleted its workspace frees the key: a retry provisions again"
    (do-with-eligible-database!
     (fn [db-id]
       (let [inits (atom 0)]
         (with-redefs [provisioning/dispatching-provisioner (counting-provisioner
                                                             inits
                                                             #(throw (ex-info "Connection refused" {})))]
           (is (=? {:message "Connection refused"}
                   (create-with-key 500 "retry-after-failure" "Flaky" db-id)))
           (is (zero? (t2/count :model/Workspace :idempotency_key "retry-after-failure"))))
         (with-redefs [provisioning/dispatching-provisioner (counting-provisioner inits (constantly nil))]
           (is (=? {:databases [{:status "provisioned"}]}
                   (create-with-key 200 "retry-after-failure" "Flaky" db-id))))
         (is (= 2 @inits))
         (is (= 1 (t2/count :model/Workspace :idempotency_key "retry-after-failure"))
             "the retry's workspace holds the freed key"))))))

(deftest create-idempotency-retry-after-failed-cleanup-test
  (testing "a retry of a create whose provisioning and cleanup both failed replays the 500 and provisions nothing"
    (do-with-eligible-database!
     (fn [db-id]
       (let [inits  (atom 0)
             wedged (reify provisioning/Provisioner
                      (details  [_ _ _ _]   {:schema "mb_iso_stub" :database_details {:user "stub_user"}})
                      (init!    [_ _ _ _]   (swap! inits inc) (throw (ex-info "Connection refused" {})))
                      (grant!   [_ _ _ _ _] nil)
                      (destroy! [_ _ _ _]   (throw (ex-info "warehouse down" {}))))]
         (with-redefs [provisioning/dispatching-provisioner wedged]
           ;; #86601: the first create is a 500 that names the kept workspace; #86788: its row is teardown_failed
           (let [{ws-id :workspace_id} (create-with-key 500 "retry-after-failed-cleanup" "Wedged" db-id)]
             (is (pos-int? ws-id))
             (is (=? {:databases [{:status "teardown_failed"}]}
                     (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id))))
             (is (=? {:workspace_id ws-id :cleanup_required true}
                     (create-with-key 500 "retry-after-failed-cleanup" "Wedged" db-id)))
             (is (= 1 @inits) "the retry provisioned nothing")
             (is (= 1 (t2/count :model/Workspace :idempotency_key "retry-after-failed-cleanup"))
                 "the key stays on the kept workspace")
             (testing "deleting the kept workspace finishes the cleanup"
               (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
                 (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id)))))))))))

(deftest create-without-idempotency-key-test
  (testing "without an Idempotency-Key, two identical creates make two workspaces"
    (do-with-eligible-database!
     (fn [db-id]
       (let [inits (atom 0)]
         (with-redefs [provisioning/dispatching-provisioner (counting-provisioner inits (constantly nil))]
           (let [a (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                         {:name "Twin" :database_ids [db-id]})
                 b (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                         {:name "Twin" :database_ids [db-id]})]
             (is (not= (:id a) (:id b)))
             (is (= 2 @inits)))))))))

(deftest create-idempotency-concurrent-test
  (testing "two concurrent creates with the same Idempotency-Key provision once"
    (do-with-eligible-database!
     (fn [db-id]
       (let [inits   (atom 0)
             go      (promise)
             release (promise)]
         (with-redefs [provisioning/dispatching-provisioner (counting-provisioner
                                                             inits
                                                             #(deref release 30000 nil))]
           (let [first-done (promise)
                 request    #(do @go
                                 (let [response (mt/user-http-request-full-response
                                                 :crowberto :post "ee/workspace-manager/"
                                                 {:request-options {:headers {"idempotency-key" "concurrent"}}}
                                                 {:name "Concurrent" :database_ids [db-id]})]
                                   (deliver first-done true)
                                   response))
                 creates    [(future (request)) (future (request))]
                 _          (deliver go true)
                 ;; the winner blocks in provisioning until released, so the request
                 ;; that answers first is the loser; then let the winner finish
                 _          (deref first-done 10000 nil)
                 _          (deliver release true)
                 statuses   (mapv #(:status (deref % 30000 nil)) creates)
                 ids        (into #{} (keep #(get-in (deref %) [:body :id])) creates)]
             (is (every? #{200 409} statuses))
             (is (some #{200} statuses))
             (is (= 1 (count ids)) "every 200 is the same workspace")
             (is (= 1 @inits))
             (is (= 1 (t2/count :model/Workspace :idempotency_key "concurrent"))))))))))

(deftest create-idempotency-key-validation-test
  (testing "a blank or overlong Idempotency-Key is a 400 and creates nothing"
    (do-with-eligible-database!
     (fn [db-id]
       (with-redefs [provisioning/dispatching-provisioner (counting-provisioner (atom 0) (constantly nil))]
         (doseq [bad-key ["   " (apply str (repeat 256 "k"))]]
           (create-with-key 400 bad-key "Bad key" db-id))
         (is (zero? (t2/count :model/Workspace :name "Bad key")))
         (testing "255 characters is allowed"
           (create-with-key 200 (apply str (repeat 255 "k")) "Long key" db-id)))))))

(deftest rename-workspace-test
  (testing "PUT /:id renames a workspace and returns the updated WorkspaceResponse"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Before"}]
      (is (=? {:id ws-id :name "After"}
              (mt/user-http-request :crowberto :put 200 (str "ee/workspace-manager/" ws-id) {:name "After"})))
      (is (= "After" (t2/select-one-fn :name :model/Workspace :id ws-id)))
      (testing "404 for a missing id"
        (mt/user-http-request :crowberto :put 404 "ee/workspace-manager/13371337" {:name "X"})))))

(deftest download-config-endpoint-test
  (testing "GET /:id/config"
    (mt/with-temp [:model/Database {db-id :id} {:engine :postgres :details {}}
                   :model/Workspace {ws-id :id} {:name "Cfg WS"}
                   :model/WorkspaceDatabase _ {:workspace_id     ws-id
                                               :database_id      db-id
                                               :database_details {}
                                               :output_namespace ""
                                               :input_schemas    ["public"]
                                               :status           :provisioned}]
      (testing "returns application/x-yaml with an attachment Content-Disposition"
        (is (=? {:status  200
                 :headers {"Content-Type"        "application/x-yaml"
                           "Content-Disposition" "attachment; filename=\"config.yml\""}}
                (mt/user-http-request-full-response
                 :crowberto :get 200 (str "ee/workspace-manager/" ws-id "/config")))))
      (testing "422, not a retryable 409, when only an admin can fix the database's connection settings"
        (t2/update! :model/Database :id db-id {:details {:additional-options "user=parent_admin"}})
        (mt/user-http-request :crowberto :get 422 (str "ee/workspace-manager/" ws-id "/config"))
        (t2/update! :model/Database :id db-id {:details {}}))
      (testing "422, not a retryable 409, when an emitted value contains a template form"
        (t2/update! :model/Workspace :id ws-id {:name "Cfg {{env HOME}}"})
        (mt/user-http-request :crowberto :get 422 (str "ee/workspace-manager/" ws-id "/config"))
        (t2/update! :model/Workspace :id ws-id {:name "Cfg WS"}))
      (testing "409 when a database is not :provisioned"
        (t2/update! :model/WorkspaceDatabase :workspace_id ws-id {:status :unprovisioned})
        (mt/user-http-request :crowberto :get 409 (str "ee/workspace-manager/" ws-id "/config")))
      (testing "404 for a missing workspace"
        (mt/user-http-request :crowberto :get 404 "ee/workspace-manager/13371337/config")))))

(deftest download-config-local-file-ssl-root-cert-test
  (testing "GET /:id/config answers 422 naming the database when its SSL root certificate is a file on the server"
    (mt/with-temp [:model/Database {db-id :id} {:name    "Cert DW" :engine :postgres
                                                :details {:ssl                   true
                                                          :ssl-root-cert-options "local"
                                                          :ssl-root-cert-path    "/nonexistent/fe103/root.crt"}}
                   :model/Workspace {ws-id :id} {:name "Cert WS"}
                   :model/WorkspaceDatabase _ {:workspace_id     ws-id
                                               :database_id      db-id
                                               :database_details {}
                                               :output_namespace ""
                                               :input_schemas    ["public"]
                                               :status           :provisioned}]
      (is (= (str "The SSL root certificate of database \"Cert DW\" is a file on this instance's server, which "
                  "workspaces don't copy. Upload the file in the database's connection settings instead.")
             (mt/user-http-request :crowberto :get 422 (str "ee/workspace-manager/" ws-id "/config")))))))

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
        (mt/user-http-request :rasta :get 403 (str "ee/workspace-manager/" ws-id "/config"))
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace-manager/" ws-id))))))

(deftest contract-version-header-test
  (testing "workspace-manager responses carry X-Metabase-Workspaces-Version: 2"
    (testing "on success"
      (is (= "2" (get-in (mt/user-http-request-full-response :crowberto :get 200 "ee/workspace-manager/")
                         [:headers "X-Metabase-Workspaces-Version"]))))
    (testing "on the 401 the auth wrapper answers"
      (is (= "2" (get-in (mt/client-full-response :get 401 "ee/workspace-manager/")
                         [:headers "X-Metabase-Workspaces-Version"]))))
    (testing "not on errors an endpoint throws: the server's exception middleware builds those responses"
      (is (nil? (get-in (mt/user-http-request-full-response :crowberto :get 404 "ee/workspace-manager/13371337")
                        [:headers "X-Metabase-Workspaces-Version"]))))))
