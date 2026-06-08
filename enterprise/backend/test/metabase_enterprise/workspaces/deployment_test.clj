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
  (testing "provision! with remote-sync config also creates the collection, sets settings, and triggers import"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace :model/Database]
      (let [{:keys [ws-id]} (provisioned-workspace!)
            inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                             {:url "https://child.example.com" :api_key "k"})
            calls   (atom [])]
        ;; Stub returns bodies the orchestrator reads: a collection id, then an import task id.
        (with-redefs [http/request (fn [req]
                                     (swap! calls conj req)
                                     {:status 200
                                      :body   (cond
                                                (= "/api/collection" (re-find #"/api/collection$" (:url req)))
                                                {:id 99}
                                                (re-find #"/remote-sync/import" (:url req))
                                                {:task_id "task-1"}
                                                :else {})})]
          (deployment/provision! ws-id inst-id {:url "https://repo.example/x.git" :token "tok" :branch "main"}))
        (let [paths (map #(-> % :url (->> (re-find #"/api/.*"))) @calls)]
          (testing "four child calls in order: bind, collection, settings, import"
            (is (= 4 (count @calls)))
            (is (= [:post :post :put :post] (map :method @calls)))
            (is (= ["/api/ee/advanced-config/"
                    "/api/collection"
                    "/api/ee/remote-sync/settings"
                    "/api/ee/remote-sync/import"]
                   paths)))
          (testing "the settings call pins the created collection and points at the repo"
            (let [settings-req (nth @calls 2)
                  fp           (:form-params settings-req)]
              (is (= "https://repo.example/x.git" (:remote-sync-url fp)))
              (is (= "read-write" (:remote-sync-type fp)))
              (is (= {99 true} (:collections fp))))))))))

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

(deftest deprovision-frees-instance-test
  (testing "deprovision! cleans the synced collection, unbinds the child, and frees the instance"
    (mt/with-model-cleanup [:model/WorkspaceInstance :model/WorkspaceDatabase :model/Workspace]
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "bound"}]
        (let [inst-id (t2/insert-returning-pk! :model/WorkspaceInstance
                                               {:url "https://child.example.com" :api_key "k"
                                                :workspace_id ws-id})
              calls   (atom [])]
          ;; GET /api/collection returns one "Robot DE" to delete.
          (with-redefs [http/request (fn [req]
                                       (swap! calls conj req)
                                       {:status 200
                                        :body (if (re-find #"/api/collection$" (:url req))
                                                [{:id 7 :name "Robot DE"} {:id 8 :name "Other"}]
                                                "")})]
            (let [result (deployment/deprovision! ws-id)]
              (testing "instance is free again"
                (is (nil? (:workspace_id result)))
                (is (nil? (:workspace_id (t2/select-one :model/WorkspaceInstance :id inst-id)))))
              (testing "child calls: list collections, archive the Robot DE collection, unbind"
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
            (let [result (deployment/deprovision! ws-id)]
              (is (nil? (:workspace_id result)))
              (is (nil? (:workspace_id (t2/select-one :model/WorkspaceInstance :id inst-id)))))))))))

(deftest deprovision-404-when-unbound-test
  (testing "deprovision! 404s when no instance is provisioned for the workspace"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "unbound"}]
      (is (thrown-with-msg? Exception #"No pool instance"
                            (deployment/deprovision! ws-id))))))
