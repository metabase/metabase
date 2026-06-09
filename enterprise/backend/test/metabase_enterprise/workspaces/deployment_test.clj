(ns metabase-enterprise.workspaces.deployment-test
  "Tests for the provision / deprovision orchestrator. The child HTTP calls are stubbed
   via `clj-http.client/request` so these exercise the parent-side logic (guards, config
   build, pool-row state transitions) without a live child instance."
  (:require
   [clj-http.client :as http]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.deployment :as deployment]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- provisioned-workspace!
  "Create a workspace with one :provisioned database so `build-workspace-config` succeeds.
   Returns `{:ws-id ... :db-id ...}`. Caller must clean up `:model/WorkspaceDatabase`
   before `:model/Database` (the Database pre-delete hook refuses while a non-unprovisioned
   workspace_database row references it)."
  []
  (let [db-id (t2/insert-returning-pk! :model/Database {:name (str (gensym "deploy-db")) :engine :h2 :details {}})
        ws-id (t2/insert-returning-pk! :model/Workspace {:name "deploy-ws"
                                                         :creator_id (mt/user->id :crowberto)})]
    (t2/insert! :model/WorkspaceDatabase
                {:workspace_id     ws-id
                 :database_id      db-id
                 :database_details {:user "u" :password "p"}
                 :output_namespace "ws_out"
                 :input_schemas    ["public"]
                 :status           :provisioned})
    {:ws-id ws-id :db-id db-id}))

(defmacro ^:private with-captured-child-calls
  "Stub `clj-http.client/request`, recording each call into `calls-atom`, returning 200."
  [calls-atom & body]
  `(with-redefs [http/request (fn [req#] (swap! ~calls-atom conj req#) {:status 200 :body ""})]
     ~@body))

(deftest provision-happy-path-test
  (testing "provision! builds config, calls the child, and marks the instance busy"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace :model/Database]
      (let [{:keys [ws-id]} (provisioned-workspace!)
            inst-id  (t2/insert-returning-pk! :model/WorkspaceInstance
                                              {:url "https://child.example.com" :api_key "k"})
            calls    (atom [])]
        (with-captured-child-calls calls
          (let [result (deployment/provision! ws-id inst-id nil)]
            (testing "instance is now bound to the workspace"
              (is (= ws-id (:workspace_id result)))
              (is (= ws-id (:workspace_id (t2/select-one :model/WorkspaceInstance :id inst-id)))))
            (testing "the child got one advanced-config bind call with the api_key header"
              (is (= 1 (count @calls)))
              (let [req  (first @calls)
                    part (-> req :multipart first)]
                (is (= :post (:method req)))
                (is (= "https://child.example.com/api/ee/advanced-config/" (:url req)))
                (is (= "k" (get-in req [:headers "x-api-key"])))
                (is (= "config" (:name part)))
                ;; Must be a File (not a String): clj-http only encodes a file part —
                ;; with a filename, which Ring turns into the :tempfile the child's
                ;; advanced-config endpoint requires — when :content is a File.
                (is (instance? java.io.File (:content part)))))))))))

(deftest provision-with-remote-sync-test
  (testing "provision! with remote-sync config looks up/creates the collection, sets settings, triggers import"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace :model/Database]
      (let [{:keys [ws-id]} (provisioned-workspace!)
            inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                             {:url "https://child.example.com" :api_key "k"})
            calls   (atom [])]
        ;; GET /api/collection -> [] (no existing Robot DE) so a POST creates one (id 99).
        (with-redefs [http/request (fn [req]
                                     (swap! calls conj req)
                                     {:status 200
                                      :body   (cond
                                                (and (= :get (:method req)) (re-find #"/api/collection$" (:url req)))
                                                []
                                                (and (= :post (:method req)) (re-find #"/api/collection$" (:url req)))
                                                {:id 99}
                                                (re-find #"/remote-sync/import" (:url req))
                                                {:task_id "task-1"}
                                                :else {})})]
          (deployment/provision! ws-id inst-id {:url "https://repo.example/x.git" :token "tok" :branch "main"}))
        (let [steps (map (juxt :method #(re-find #"/api/.*" (:url %))) @calls)]
          (testing "child calls in order: bind, list collections, create collection, settings, import"
            (is (= [[:post "/api/ee/advanced-config/"]
                    [:get  "/api/collection"]
                    [:post "/api/collection"]
                    [:put  "/api/ee/remote-sync/settings"]
                    [:post "/api/ee/remote-sync/import"]]
                   steps)))
          (testing "the settings call pins the created collection and points at the repo"
            (let [fp (:form-params (nth @calls 3))]
              (is (= "https://repo.example/x.git" (:remote-sync-url fp)))
              (is (= "read-write" (:remote-sync-type fp)))
              (is (= {99 true} (:collections fp))))))))))

(deftest provision-reuses-existing-synced-collection-test
  (testing "provision! reuses an existing Robot DE collection instead of creating a duplicate"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace :model/Database]
      (let [{:keys [ws-id]} (provisioned-workspace!)
            inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                             {:url "https://child.example.com" :api_key "k"})
            calls   (atom [])]
        ;; GET /api/collection -> an existing Robot DE (id 42); no POST create should happen.
        (with-redefs [http/request (fn [req]
                                     (swap! calls conj req)
                                     {:status 200
                                      :body   (cond
                                                (and (= :get (:method req)) (re-find #"/api/collection$" (:url req)))
                                                [{:id 42 :name "Robot DE"}]
                                                (re-find #"/remote-sync/import" (:url req))
                                                {:task_id "t"}
                                                :else {})})]
          (deployment/provision! ws-id inst-id {:url "https://repo/x.git" :token "tok"}))
        (testing "no POST /api/collection (reused id 42)"
          (is (not-any? #(and (= :post (:method %)) (re-find #"/api/collection$" (:url %))) @calls)))
        (testing "settings pins the reused collection"
          (let [settings-req (first (filter #(re-find #"/remote-sync/settings" (:url %)) @calls))]
            (is (= {42 true} (:collections (:form-params settings-req))))))))))

(deftest provision-rejects-busy-instance-test
  (testing "provision! 409s when the target instance is already provisioned"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace :model/Database]
      (mt/with-temp [:model/Workspace {other-ws :id} {:name "other"}]
        (let [{:keys [ws-id]} (provisioned-workspace!)
              inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                               {:url "https://busy.example.com" :api_key "k"
                                                :workspace_id other-ws})
              calls   (atom [])]
          (with-captured-child-calls calls
            (is (thrown-with-msg? Exception #"already provisioned"
                                  (deployment/provision! ws-id inst-id nil))))
          (testing "no child call was made"
            (is (zero? (count @calls)))))))))

(deftest provision-rolls-back-on-child-failure-test
  (testing "if the child bind fails, the instance stays free (workspace_id not set)"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace :model/Database]
      (let [{:keys [ws-id]} (provisioned-workspace!)
            inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                             {:url "https://child.example.com" :api_key "k"})]
        (with-redefs [http/request (fn [_] (throw (ex-info "boom" {})))]
          (is (thrown? Exception (deployment/provision! ws-id inst-id nil))))
        (testing "instance remains free"
          (is (nil? (:workspace_id (t2/select-one :model/WorkspaceInstance :id inst-id)))))))))

(deftest provision-rolls-back-bind-when-a-later-step-fails-test
  (testing "if a post-bind step (remote-sync) fails, the child is unbound and the instance freed — no zombie"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace :model/Database]
      (let [{:keys [ws-id]} (provisioned-workspace!)
            inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                             {:url "https://child.example.com" :api_key "k"})
            calls   (atom [])]
        ;; bind (advanced-config) succeeds; the first remote-sync call (create collection) fails.
        (with-redefs [http/request (fn [req]
                                     (swap! calls conj req)
                                     (if (re-find #"/api/collection$" (:url req))
                                       (throw (ex-info "remote-sync boom" {}))
                                       {:status 200 :body {}}))]
          (is (thrown? Exception
                       (deployment/provision! ws-id inst-id
                                              {:url "https://repo/x.git" :token "t" :branch "main"}))))
        (testing "instance is rolled back to free"
          (is (nil? (:workspace_id (t2/select-one :model/WorkspaceInstance :id inst-id)))))
        (testing "the child was unbound during rollback"
          (is (some #(and (= :delete (:method %))
                          (re-find #"/workspace-instance/current" (:url %)))
                    @calls)))))))

(deftest deprovision-tolerates-dead-child-unbind-test
  (testing "if the child unbind fails, the pool slot is still freed (no permanently-stuck instance)"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace]
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "bound"}]
        (let [inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                               {:url "https://dead.example.com" :api_key "k"
                                                :workspace_id ws-id})]
          ;; collection list returns empty (nothing to clean); the unbind DELETE throws.
          (with-redefs [http/request (fn [req]
                                       (if (re-find #"/workspace-instance/current" (:url req))
                                         (throw (ex-info "child down" {}))
                                         {:status 200 :body []}))]
            (let [result (deployment/deprovision! ws-id inst-id)]
              (is (nil? (:workspace_id result)))
              (is (nil? (:workspace_id (t2/select-one :model/WorkspaceInstance :id inst-id)))))))))))

(deftest deprovision-frees-instance-test
  (testing "deprovision! cleans the synced collection, unbinds the child, and frees the instance"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace]
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "bound"}]
        (let [inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                               {:url "https://child.example.com" :api_key "k"
                                                :workspace_id ws-id})
              calls   (atom [])]
          ;; GET /api/collection returns the pinned synced collection (id 7) plus a user
          ;; collection that merely shares the name (id 9, NOT remote-synced) — only 7 should
          ;; be archived.
          (with-redefs [http/request (fn [req]
                                       (swap! calls conj req)
                                       {:status 200
                                        :body (if (re-find #"/api/collection$" (:url req))
                                                [{:id 7 :name "Robot DE" :is_remote_synced true}
                                                 {:id 8 :name "Other"    :is_remote_synced false}
                                                 {:id 9 :name "Robot DE" :is_remote_synced false}]
                                                "")})]
            (let [result (deployment/deprovision! ws-id inst-id)]
              (testing "instance is free again"
                (is (nil? (:workspace_id result)))
                (is (nil? (:workspace_id (t2/select-one :model/WorkspaceInstance :id inst-id)))))
              (testing "child calls: list collections, archive ONLY the pinned synced collection (7), unbind"
                (is (= [[:get "https://child.example.com/api/collection"]
                        [:put "https://child.example.com/api/collection/7"]
                        [:delete "https://child.example.com/api/ee/workspace-instance/current"]]
                       (map (juxt :method :url) @calls))))
              (testing "the archive call sets :archived true"
                (is (= {:archived true} (:form-params (second @calls))))))))))))

(deftest deprovision-tolerates-cleanup-failure-test
  (testing "a failure cleaning the synced collection does NOT abort the deprovision"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace]
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "bound"}]
        (let [inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                               {:url "https://child.example.com" :api_key "k"
                                                :workspace_id ws-id})]
          ;; GET /api/collection throws; the unbind + free must still happen.
          (with-redefs [http/request (fn [req]
                                       (if (re-find #"/api/collection$" (:url req))
                                         (throw (ex-info "boom" {}))
                                         {:status 200 :body ""}))]
            (let [result (deployment/deprovision! ws-id inst-id)]
              (is (nil? (:workspace_id result)))
              (is (nil? (:workspace_id (t2/select-one :model/WorkspaceInstance :id inst-id)))))))))))

(deftest deprovision-404-when-unbound-test
  (testing "deprovision! 404s when no instance is provisioned for the workspace"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "unbound"}]
      (is (thrown-with-msg? Exception #"No pool instance"
                            (deployment/deprovision! ws-id 1))))))

(deftest deprovision-409-on-instance-mismatch-test
  (testing "deprovision! 409s when the named instance is not the one bound to the workspace"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace]
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "bound"}]
        (let [bound-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                                {:url "https://bound.example.com" :api_key "k"
                                                 :workspace_id ws-id})]
          (is (thrown-with-msg? Exception #"not the one provisioned"
                                (deployment/deprovision! ws-id (inc bound-id)))))))))
