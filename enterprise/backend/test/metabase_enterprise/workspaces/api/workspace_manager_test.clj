(ns metabase-enterprise.workspaces.api.workspace-manager-test
  "HTTP smoke tests for the workspace-manager API. Permission rules are exercised at the
   model level — see workspace_test.clj and workspace_database_test.clj. These tests just
   verify routing, request/response shape, and that the model-level permission predicates
   are wired into the endpoints (one 403 spot-check is enough)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
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
  (testing "DELETE tears down a pending database like any other state"
    (mt/with-temp [:model/Database {db-id :id} {:engine   :postgres
                                                :details  {}
                                                :settings {:database-enable-workspaces true}}
                   :model/Table _ {:db_id db-id :schema "public" :active true}]
      (mt/with-model-cleanup [:model/Workspace]
        (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
          (let [{ws-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                                  {:name "Pending" :database_ids [db-id]})
                wsd-id      (t2/select-one-pk :model/WorkspaceDatabase :workspace_id ws-id)]
            (t2/update! :model/WorkspaceDatabase {:id wsd-id} {:status :provisioning})
            (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id))
            (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id))))))))

(deftest delete-workspace-teardown-failure-test
  (testing "DELETE returns a 500 with the database's error and keeps the workspace when a teardown fails"
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
          (testing "the workspace survives and a retry deletes it"
            (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id))
            (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
              (mt/user-http-request :crowberto :delete 204 (str "ee/workspace-manager/" ws-id)))
            (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" ws-id))))))))

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
  "Call `f` with the id of a committed Database that is eligible for workspaces.
  Afterwards, delete that Database and every Workspace that `f` created. Not
  `mt/with-temp`: that runs its body in a rollback-only transaction which the request
  threads of these tests would inherit and share, so concurrent creates would not race
  in separate transactions."
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

(deftest create-idempotency-retry-of-kept-empty-workspace-test
  (testing "a kept workspace with no databases (cleanup removed them, deleting the row failed) is a failed create: the retry answers 500"
    (do-with-eligible-database!
     (fn [db-id]
       (mt/with-temp [:model/Workspace {ws-id :id} {:name            "Kept empty"
                                                    :creator_id      (mt/user->id :crowberto)
                                                    :idempotency_key "kept-empty"}]
         (is (=? {:workspace_id ws-id :cleanup_required true}
                 (create-with-key 500 "kept-empty" "Kept empty" db-id))))))))

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
           ;; master keeps the workspace and answers 200; with #86601 this first create is the 500 too
           (let [{ws-id :id} (create-with-key 200 "retry-after-failed-cleanup" "Wedged" db-id)]
             (is (=? {:databases [{:status "unprovisioned"}]}
                     (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" ws-id))))
             ;; master's failed cleanup leaves the row `unprovisioned`, like a create that has not yet
             ;; reached it, so a retry within 15 minutes is a 409; with #86788 the row is `teardown_failed`
             (is (=? {:error-code "workspace_busy"}
                     (create-with-key 409 "retry-after-failed-cleanup" "Wedged" db-id)))
             (t2/update! :model/WorkspaceDatabase {:workspace_id ws-id}
                         {:updated_at (t/minus (t/offset-date-time) (t/hours 1))})
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
  (testing "a blank or overlong Idempotency-Key, or one with surrounding whitespace, is a 400 and creates nothing"
    (do-with-eligible-database!
     (fn [db-id]
       (with-redefs [provisioning/dispatching-provisioner (counting-provisioner (atom 0) (constantly nil))]
         (doseq [bad-key ["   " (apply str (repeat 256 "k")) "k " " k"]]
           (create-with-key 400 bad-key "Bad key" db-id))
         (is (zero? (t2/count :model/Workspace :name "Bad key")))
         (testing "255 characters is allowed"
           (create-with-key 200 (apply str (repeat 255 "k")) "Long key" db-id)))))))

(defn- pausing-before-nth-provision!
  "A replacement for `provisioning/provision-single!` whose `n`th call delivers its row id
  to `paused`, then waits for `resume`, before the row turns `:provisioning`."
  [n paused resume]
  (let [provision-single! provisioning/provision-single!
        calls             (atom 0)]
    (fn
      ([wsd-id]
       (when (= n (swap! calls inc))
         (deliver paused wsd-id)
         (deref resume 30000 nil))
       (provision-single! wsd-id))
      ;; the 1-arity original calls the var again with 2 args; that call is not counted
      ([wsd-id provisioner]
       (provision-single! wsd-id provisioner)))))

(deftest create-idempotency-retry-before-database-provisioning-test
  (testing "a same-key retry while a database of the first create is not yet provisioning gets 409 workspace_busy, never the failed-create 500"
    (doseq [[n window] [[1 "before the first database turns provisioning"]
                        [2 "after the first database is provisioned, before the second turns provisioning"]]]
      (testing window
        (do-with-eligible-database!
         (fn [db1-id]
           (do-with-eligible-database!
            (fn [db2-id]
              (let [idempotency-key (str "retry-before-provisioning-" n)
                    paused          (promise)
                    resume          (promise)
                    create!         #(mt/user-http-request-full-response
                                      :crowberto :post "ee/workspace-manager/"
                                      {:request-options {:headers {"idempotency-key" idempotency-key}}}
                                      {:name "Gated" :database_ids [db1-id db2-id]})]
                (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)
                              provisioning/provision-single!       (pausing-before-nth-provision! n paused resume)]
                  (let [create (future (create!))]
                    (try
                      (is (some? (deref paused 10000 nil)) "the first create paused before a database turned provisioning")
                      (let [{:keys [status body]} (create!)]
                        (is (= 409 status) (str "body " (pr-str body)))
                        (is (=? {:error-code "workspace_busy"} body)))
                      (deliver resume true)
                      (is (=? {:status 200 :body {:databases [{:status "provisioned"} {:status "provisioned"}]}}
                              (deref create 10000 ::timed-out))
                          "the first create still finishes")
                      (finally
                        (deliver resume true)
                        (deref create 10000 nil))))))))))))))

(deftest create-idempotency-retry-while-database-turns-provisioning-test
  (testing "a same-key retry whose database turns provisioning right after the retry's first status query still gets 409, never the failed-create 500"
    (do-with-eligible-database!
     (fn [db-id]
       (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
         (let [{ws-id :id} (create-with-key 200 "retry-turns-provisioning" "Racing" db-id)
               exists?     t2/exists?
               advanced?   (atom false)]
           ;; the first create has committed the row but not yet reached it
           (t2/update! :model/WorkspaceDatabase {:workspace_id ws-id}
                       {:status :unprovisioned :updated_at (t/offset-date-time)})
           ;; the create's `provision-single!` commits `:provisioning` just after the retry's
           ;; first WorkspaceDatabase status query
           (with-redefs [t2/exists? (fn [model & args]
                                      (let [result (apply exists? model args)]
                                        (when (and (= :model/WorkspaceDatabase model)
                                                   (compare-and-set! advanced? false true))
                                          (t2/update! :model/WorkspaceDatabase {:workspace_id ws-id}
                                                      {:status :provisioning}))
                                        result))]
             (is (=? {:error-code "workspace_busy"}
                     (create-with-key 409 "retry-turns-provisioning" "Racing" db-id))))
           (is (true? @advanced?) "the row advanced during the retry")))))))

(deftest create-idempotency-retry-of-stale-workspace-test
  (testing "a retry whose workspace has only rows older than 15 minutes that are not provisioned answers the failed-create 500"
    (doseq [status [:provisioning :unprovisioned]]
      (testing status
        (do-with-eligible-database!
         (fn [db-id]
           (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
             (let [idempotency-key (str "retry-stale-" (name status))
                   {ws-id :id}     (create-with-key 200 idempotency-key "Crashed" db-id)]
               (t2/update! :model/WorkspaceDatabase {:workspace_id ws-id}
                           {:status     status
                            :updated_at (t/minus (t/offset-date-time) (t/hours 1))})
               (is (=? {:workspace_id ws-id :cleanup_required true}
                       (create-with-key 500 idempotency-key "Crashed" db-id)))))))))))

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
