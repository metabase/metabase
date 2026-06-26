(ns metabase-enterprise.remote-sync.api-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.remote-sync.api-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [diehard.core :as dh]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.core :as remote-sync.core]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.git :as source.git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn mock-git-source
  "Create a mock git source for testing"
  [& {:keys [branches error-on-branches?]
      :or {branches ["main" "develop"]}}]
  (reify source.p/Source
    (create-branch [_ _branch _base]
      nil)
    (branches [_]
      (if error-on-branches?
        (throw (Exception. "Repository not found"))
        branches))
    (default-branch [_]
      "main")
    (snapshot [_]
      nil)
    (snapshot-at [_ _version]
      nil)))

(use-fixtures :once
  (fixtures/initialize :db)
  ;; TODO (edpaget 10/23/25): this seems silly, maybe there's a better way?
  (fn [f] (mt/dataset test-data
            (mt/id)
            (f))))

(use-fixtures :each
  test-helpers/clean-remote-sync-state
  (fn [f]
    (mt/with-premium-features #{:remote-sync}
      (f))))

(defn- wait-for-task-completion [task-id]
  (when task-id
    (dh/with-retry {:max-retries 10
                    :delay-ms 500}
      (u/prog1 (t2/select-one :model/RemoteSyncTask :id task-id)
        (when (nil? (:ended_at <>))
          (throw (ex-info "Not finished" {:task-id task-id
                                          :result <>})))))))

;;; ------------------------------------------------- Test Connection Endpoint -------------------------------------------------

(deftest test-connection-succeeds-with-current-settings-test
  (testing "POST /api/ee/remote-sync/test-connection returns success when current settings can reach the repo"
    (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                       remote-sync-token  "valid-token"
                                       remote-sync-branch "main"
                                       remote-sync-type   :read-only]
      (with-redefs [settings/check-git-settings! (constantly nil)
                    source.git/git-source        (fn [_ _ _ _] {:fake-source true})
                    source.git/branches          (fn [_] ["main"])]
        (is (= {:status "success"}
               (mt/user-http-request :crowberto :post 200 "ee/remote-sync/test-connection" {})))))))

(deftest test-connection-forces-fresh-remote-call-test
  (testing "POST /api/ee/remote-sync/test-connection always calls git/branches so rotated tokens are detected"
    ;; check-git-settings! only authenticates when :read-only + branch is set, so the JGit cache
    ;; would otherwise short-circuit subsequent tests with the same token. We need a fresh
    ;; lsRemote on every click — this guards that.
    (let [branches-calls (atom 0)]
      (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                         remote-sync-token  "valid-token"
                                         remote-sync-branch ""
                                         remote-sync-type   :read-write]
        (with-redefs [settings/check-git-settings! (constantly nil)
                      source.git/git-source        (fn [_ _ _ _] {:fake-source true})
                      source.git/branches          (fn [_] (swap! branches-calls inc) [])]
          (mt/user-http-request :crowberto :post 200 "ee/remote-sync/test-connection" {})
          (is (= 1 @branches-calls)
              "Test Connection must call git/branches even when check-git-settings! skips the remote check"))))))

(deftest test-connection-surfaces-fresh-remote-auth-failure-test
  (testing "POST /api/ee/remote-sync/test-connection returns 400 when the forced lsRemote rejects the token"
    (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                       remote-sync-token  "rotated-token"
                                       remote-sync-branch ""
                                       remote-sync-type   :read-write]
      (with-redefs [settings/check-git-settings! (constantly nil)
                    source.git/git-source        (fn [_ _ _ _] {:fake-source true})
                    source.git/branches          (fn [_] (throw (ex-info "Authentication failed" {})))]
        (is (= "Authentication failed: Please check your git credentials"
               (mt/user-http-request :crowberto :post 400 "ee/remote-sync/test-connection" {})))))))

(deftest test-connection-uses-body-overrides-test
  (testing "POST /api/ee/remote-sync/test-connection passes URL and token from the body through to the lsRemote call"
    (let [captured (atom nil)]
      (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                         remote-sync-token  "saved-token"
                                         remote-sync-branch "main"
                                         remote-sync-type   :read-only]
        (with-redefs [settings/check-git-settings! (constantly nil)
                      source.git/git-source        (fn [url _ token _]
                                                     (reset! captured {:url url :token token})
                                                     {:fake-source true})
                      source.git/branches          (fn [_] [])]
          (mt/user-http-request :crowberto :post 200 "ee/remote-sync/test-connection"
                                {:remote-sync-url   "https://github.com/other/repo.git"
                                 :remote-sync-token "new-token"})
          (is (= {:url "https://github.com/other/repo.git" :token "new-token"} @captured)))))))

(deftest test-connection-treats-obfuscated-token-as-unchanged-test
  (testing "POST /api/ee/remote-sync/test-connection uses stored token when body sends the obfuscated value"
    (let [captured (atom nil)
          full-token "ghp_full_secret_token_value"]
      (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                         remote-sync-token  full-token
                                         remote-sync-branch "main"
                                         remote-sync-type   :read-only]
        (with-redefs [settings/check-git-settings! (constantly nil)
                      source.git/git-source        (fn [_ _ token _]
                                                     (reset! captured token)
                                                     {:fake-source true})
                      source.git/branches          (fn [_] [])]
          (mt/user-http-request :crowberto :post 200 "ee/remote-sync/test-connection"
                                {:remote-sync-token (setting/obfuscate-value full-token)})
          (is (= full-token @captured)
              "Obfuscated tokens must be replaced with the stored token before testing"))))))

(deftest test-connection-requires-superuser-test
  (testing "POST /api/ee/remote-sync/test-connection requires superuser permissions"
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/remote-sync/test-connection" {}))))))

(deftest test-connection-errors-when-not-configured-test
  (testing "POST /api/ee/remote-sync/test-connection returns 400 when no url is configured or provided"
    (mt/with-temporary-setting-values [remote-sync-url nil]
      (is (= "Remote sync is not configured."
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/test-connection" {}))))))

(deftest test-connection-returns-friendly-message-on-failure-test
  (testing "POST /api/ee/remote-sync/test-connection wraps exceptions in a user-friendly message"
    (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                       remote-sync-token  "bad-token"
                                       remote-sync-branch "main"
                                       remote-sync-type   :read-only]
      (testing "Authentication failure maps to credentials error"
        (with-redefs [settings/check-git-settings! (fn [_] (throw (ex-info "Authentication failed" {})))]
          (is (= "Authentication failed: Please check your git credentials"
                 (mt/user-http-request :crowberto :post 400 "ee/remote-sync/test-connection" {})))))
      (testing "Repository-not-found maps to URL error"
        (with-redefs [settings/check-git-settings! (fn [_] (throw (ex-info "Repository not found" {})))]
          (is (= "Repository not found: Please check the repository URL"
                 (mt/user-http-request :crowberto :post 400 "ee/remote-sync/test-connection" {}))))))))

;;; ------------------------------------------------- Branches Endpoint -------------------------------------------------

(deftest branches-endpoint-returns-branches-test
  (testing "GET /api/ee/remote-sync/branches returns list of branches"
    (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly (mock-git-source :branches ["main" "develop" "feature-branch"]))]
      (is (= {:items ["main" "develop" "feature-branch"]}
             (mt/user-http-request :crowberto :get 200 "ee/remote-sync/branches"))))))

(deftest branches-endpoint-requires-superuser-test
  (testing "GET /api/ee/remote-sync/branches requires superuser permissions"
    (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly (mock-git-source))]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/remote-sync/branches"))))))

(deftest branches-endpoint-errors-when-git-not-configured-test
  (testing "GET /api/ee/remote-sync/branches errors when git source not configured"
    (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly nil)]
      (is (= "Source not configured. Please configure MB_GIT_SOURCE_REPO_URL environment variable."
             (mt/user-http-request :crowberto :get 400 "ee/remote-sync/branches"))))))

(deftest branches-endpoint-handles-repository-errors-test
  (testing "GET /api/ee/remote-sync/branches handles git repository errors"
    (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly (mock-git-source :error-on-branches? true))]
      (is (= "Repository not found: Please check the repository URL"
             (mt/user-http-request :crowberto :get 400 "ee/remote-sync/branches"))))))

;;; ------------------------------------------------- Import Endpoint -------------------------------------------------

(deftest import-with-default-branch-test
  (testing "POST /api/ee/remote-sync/import succeeds with default branch"
    (let [mock-main (test-helpers/create-mock-source)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
          (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:expected_branch "main"})
                completed-task (wait-for-task-completion task_id)]
            (is (=? {:status "success" :task_id int?} resp))
            (is (remote-sync.task/successful? completed-task))))))))

(deftest import-with-specific-branch-test
  (testing "POST /api/ee/remote-sync/import succeeds with specific branch"
    (let [mock-develop (test-helpers/create-mock-source :branch "develop")]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-develop)]
          (let [{:as response :keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:branch "feature-branch" :expected_branch "main"})
                completed-task (wait-for-task-completion task_id)]
            (is (= "success" (:status response)))
            (is (remote-sync.task/successful? completed-task))))))))

(deftest import-rejects-expected-branch-mismatch-test
  (testing "POST /api/ee/remote-sync/import rejects when expected_branch disagrees with the configured setting"
    (let [mock-main (test-helpers/create-mock-source)]
      (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                         remote-sync-token  "test-token"
                                         remote-sync-branch "main"]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
          (testing "stale expected_branch -> 409 branch_mismatch, no task created"
            (let [before (t2/count :model/RemoteSyncTask)
                  resp   (mt/user-http-request :crowberto :post 409 "ee/remote-sync/import"
                                               {:branch "main" :expected_branch "stale-branch"})]
              (is (true? (:branch_mismatch resp)))
              (is (= "main" (:current_branch resp)))
              (is (= before (t2/count :model/RemoteSyncTask))
                  "no RemoteSyncTask row is created when the guard fires")))
          (testing "matching expected_branch -> pull proceeds"
            (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import"
                                                                   {:branch "main" :expected_branch "main"})]
              (is (=? {:status "success" :task_id int?} resp))
              (wait-for-task-completion task_id)))
          (testing "a branch switch (operational branch != expected_branch) is allowed when expected_branch matches the setting"
            (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import"
                                                                   {:branch "feature-branch" :expected_branch "main"})]
              (is (=? {:status "success" :task_id int?} resp))
              (wait-for-task-completion task_id))))))))

(deftest import-creates-audit-log-entry-test
  (testing "POST /api/ee/remote-sync/import records a remote-sync-import audit log entry (#73335)"
    ;; :audit-app is needed for events to actually be recorded to the audit log
    (mt/with-premium-features #{:remote-sync :audit-app}
      (let [mock-main (test-helpers/create-mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
            (let [before            (t2/count :model/AuditLog :topic "remote-sync-import")
                  {:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:expected_branch "main"})]
              (wait-for-task-completion task_id)
              ;; the audit event publishes after the task's ended_at is set, so poll for the row
              (let [entry (dh/with-retry {:max-retries 10
                                          :delay-ms 200}
                            (u/prog1 (t2/select-one :model/AuditLog :topic "remote-sync-import" {:order-by [[:id :desc]]})
                              (when (<= (t2/count :model/AuditLog :topic "remote-sync-import") before)
                                (throw (ex-info "Audit log entry not written yet" {})))))]
                (testing "attributed to the user who triggered it"
                  (is (= (mt/user->id :crowberto) (:user_id entry))))
                (testing "branch recorded, no :auto flag for manual imports"
                  (is (= "main" (get-in entry [:details :branch])))
                  (is (not (contains? (:details entry) :auto))))))))))))

(deftest import-requires-superuser-test
  (testing "POST /api/ee/remote-sync/import requires superuser permissions"
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/remote-sync/import" {:expected_branch "main"}))))))

(deftest import-errors-when-remote-sync-disabled-test
  (testing "POST /api/ee/remote-sync/import errors when remote sync is disabled"
    (mt/with-temporary-setting-values [remote-sync-url nil]
      (is (= "Remote sync is not configured."
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {:expected_branch "main"}))))))

(deftest import-handles-network-errors-test
  (testing "POST /api/ee/remote-sync/import handles network errors during import"
    (let [mock-main (test-helpers/create-mock-source :fail-mode :network-error)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
          (let [{:as response :keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:expected_branch "main"})
                completed-task (wait-for-task-completion task_id)]
            (is (= "success" (:status response)))
            (is (remote-sync.task/failed? completed-task))))))))

(deftest import-errors-when-task-already-exists-test
  (testing "POST /api/ee/remote-sync/import errors when task already exists"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"}]
      (let [mock-source (test-helpers/create-mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
            (is (= "Remote sync task in progress"
                   (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {:expected_branch "main"})))))))))

(deftest import-errors-when-dirty-changes-test
  (testing "POST /api/ee/remote-sync/import errors when dirty changes exist"
    (let [mock-main (test-helpers/create-mock-source)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (t2/insert! :model/RemoteSyncObject {:model_type "Card"
                                             :model_id 1
                                             :model_name "Test Card"
                                             :model_collection_id 1
                                             :status "updated"
                                             :status_changed_at (java.time.OffsetDateTime/now)})
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
          (is (= "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                 (:message (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {:expected_branch "main"}))))
          (testing "But can force an import"
            (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:force true :expected_branch "main"})
                  completed-task (wait-for-task-completion task_id)]
              (is (=? {:status "success" :task_id int?} resp))
              (is (remote-sync.task/successful? completed-task)))))))))

(deftest import-merge-keeps-local-changes-test
  (testing "POST /api/ee/remote-sync/import with merge=true does a local-only merge instead of erroring on dirty"
    (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}
                   :model/RemoteSyncTask _ {:sync_task_type "foo"
                                            :ended_at :%now
                                            :version "other-version"}]
      (let [mock-main (test-helpers/create-mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (t2/insert! :model/RemoteSyncObject {:model_type "Card"
                                               :model_id 1
                                               :model_name "Test Card"
                                               :model_collection_id 1
                                               :status "update"
                                               :status_changed_at (java.time.OffsetDateTime/now)})
          ;; Stub the app-DB reconcile load — its correctness is covered synchronously by impl-test; here we
          ;; only verify the endpoint/flag wiring and that the async task completes (loading into a real
          ;; warehouse DB inside the task thread is slow/racy on the MySQL/MariaDB app-db matrix).
          (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)
                                      impl/load-snapshot! (constantly nil)]
            (testing "merge=true succeeds even with unsaved local changes"
              (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:merge true :expected_branch "main"})
                    completed-task (wait-for-task-completion task_id)]
                (is (remote-sync.task/successful? completed-task))))))))))

(deftest import-merge-noop-when-remote-not-advanced-test
  (testing "POST /import merge=true when the remote has NOT advanced is a no-op success that keeps local dirty (not a spurious 'history was rewritten' conflict)"
    (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}
                   ;; last-synced version == the mock's current version -> not diverged
                   :model/RemoteSyncTask _ {:sync_task_type "foo" :ended_at :%now :version "mock-version"}]
      (let [mock-main (test-helpers/create-mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (t2/insert! :model/RemoteSyncObject {:model_type "Card"
                                               :model_id 1
                                               :model_name "Test Card"
                                               :model_collection_id 1
                                               :status "update"
                                               :status_changed_at (java.time.OffsetDateTime/now)})
          (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
            (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:merge true :expected_branch "main"})
                  completed-task (wait-for-task-completion task_id)]
              (is (remote-sync.task/successful? completed-task)
                  "a merge pull with nothing new on the remote succeeds instead of failing as a history-rewritten conflict")
              (is (= "update" (t2/select-one-fn :status :model/RemoteSyncObject :model_id 1))
                  "the un-pushed local change is left untouched (still dirty)"))))))))

;;; --------------------------- async-import!/async-export! base-snapshot resolution ---------------------------
;;; These drive the async-*! wrappers end-to-end through a version-controllable fake Source, so the real
;;; base-snapshot resolution + 3-way merge run (no hand-built :base-snapshot, no stubbed compute-merge).
;;; load-snapshot! (the slow app-DB reconcile) is stubbed and captured to assert which branch ran.

(defn- card-yaml-fixture []
  {"collections/c1eidaaaaaaaaaaaaaaaa_coll/cards/card1eidaaaaaaaaaaaaa_q.yaml"
   (test-helpers/generate-card-yaml "card1eidaaaaaaaaaaaaa" "Q1" "c1eidaaaaaaaaaaaaaaaa")})

(deftest async-import-not-diverged-noop-test
  (testing "import merge=true with the remote NOT advanced (last-version == current): no-op success, local stays dirty, no reconcile load"
    (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                       remote-sync-token  "test-token"
                                       remote-sync-branch "main"]
      (let [loaded (atom [])
            src    (test-helpers/versioned-source :current "v1" :trees {"v1" {}})]
        (mt/with-dynamic-fn-redefs [source/source-from-settings  (constantly src)
                                    remote-sync.task/last-version (constantly "v1")
                                    impl/load-snapshot!           (fn [snap & _] (swap! loaded conj (source.p/version snap)) nil)]
          (t2/insert! :model/RemoteSyncObject {:model_type "Card" :model_id 9001 :model_name "Local Card"
                                               :model_collection_id 1 :status "update"
                                               :status_changed_at (java.time.OffsetDateTime/now)})
          (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:merge true :expected_branch "main"})
                task (wait-for-task-completion task_id)]
            (is (remote-sync.task/successful? task))
            (is (empty? @loaded) "no reconcile load happens when there is nothing to fold in")
            (is (= "update" (t2/select-one-fn :status :model/RemoteSyncObject :model_id 9001))
                "the un-pushed local change is left dirty")))))))

(deftest async-import-diverged-resolves-base-test
  (testing "import merge=true when diverged resolves the base from last-version and folds in a remote-only entity"
    (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                       remote-sync-token  "test-token"
                                       remote-sync-branch "main"]
      (let [loaded (atom [])
            src    (test-helpers/versioned-source :current "v2" :trees {"v1" {} "v2" (card-yaml-fixture)})]
        (mt/with-dynamic-fn-redefs [source/source-from-settings  (constantly src)
                                    remote-sync.task/last-version (constantly "v1") ; != current -> diverged, base resolvable
                                    ;; simulate load-snapshot!'s contract (run the in-txn finalize: restore-dirty +
                                    ;; set-version) without the slow app-DB reconcile
                                    impl/load-snapshot!           (fn [_snap _ _ & {:keys [finalize!]}]
                                                                    (swap! loaded conj :loaded)
                                                                    (when finalize! (finalize!))
                                                                    nil)]
          (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:merge true :expected_branch "main"})
                task (wait-for-task-completion task_id)]
            (is (remote-sync.task/successful? task))
            (is (= "v2" (:version task)) "version advances to the remote tip")
            (is (seq @loaded) "the real 3-way merge ran and its result was reconciled into the app DB")))))))

(deftest async-import-base-unreachable-test
  (testing "import merge=true when the base commit is unreachable (orphaned) -> conflict, no reconcile load"
    (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                       remote-sync-token  "test-token"
                                       remote-sync-branch "main"]
      (let [loaded (atom [])
            src    (test-helpers/versioned-source :current "v2" :trees {"v2" (card-yaml-fixture)})] ; "gone" absent
        (mt/with-dynamic-fn-redefs [source/source-from-settings  (constantly src)
                                    remote-sync.task/last-version (constantly "gone")
                                    impl/load-snapshot!           (fn [_snap & _] (swap! loaded conj :loaded) nil)]
          (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:merge true :expected_branch "main"})
                task (wait-for-task-completion task_id)]
            (is (remote-sync.task/conflict? task))
            (is (empty? @loaded) "no load on an unresolvable-base conflict")))))))

(deftest async-import-no-prior-sync-test
  (testing "import merge=true with no prior sync (last-version nil) -> conflict (no base to merge against)"
    (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                       remote-sync-token  "test-token"
                                       remote-sync-branch "main"]
      (let [src (test-helpers/versioned-source :current "v2" :trees {"v2" (card-yaml-fixture)})]
        (mt/with-dynamic-fn-redefs [source/source-from-settings  (constantly src)
                                    remote-sync.task/last-version (constantly nil)
                                    impl/load-snapshot!           (fn [_snap & _] nil)]
          (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:merge true :expected_branch "main"})
                task (wait-for-task-completion task_id)]
            (is (remote-sync.task/conflict? task))))))))

(deftest async-export-diverged-resolves-base-test
  (testing "export merge=true when diverged resolves the base, runs the real merge, writes, and reconciles"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}]
        (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                           remote-sync-token  "test-token"
                                           remote-sync-branch "main"]
          (let [loaded (atom [])
                src    (test-helpers/versioned-source :current "v2" :trees {"v1" {} "v2" {}})]
            (mt/with-dynamic-fn-redefs [source/source-from-settings  (constantly src)
                                        remote-sync.task/last-version (constantly "v1") ; diverged, base resolvable
                                        impl/load-snapshot!           (fn [_snap _ _ & {:keys [finalize!]}]
                                                                        (swap! loaded conj :loaded)
                                                                        (when finalize! (finalize!))
                                                                        nil)]
              (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:branch "main" :merge true})
                    task (wait-for-task-completion task_id)]
                (is (remote-sync.task/successful? task))
                (is (seq @loaded) "the merged result is reconciled back into the app DB (the pull half)")))))))))

(deftest async-export-base-unreachable-test
  (testing "export merge=true when the base commit is unreachable -> conflict, nothing written"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}]
        (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                           remote-sync-token  "test-token"
                                           remote-sync-branch "main"]
          (let [loaded (atom [])
                src    (test-helpers/versioned-source :current "v2" :trees {"v2" {}})] ; "gone" absent
            (mt/with-dynamic-fn-redefs [source/source-from-settings  (constantly src)
                                        remote-sync.task/last-version (constantly "gone")
                                        impl/load-snapshot!           (fn [_snap & _] (swap! loaded conj :loaded) nil)]
              (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:branch "main" :merge true})
                    task (wait-for-task-completion task_id)]
                (is (remote-sync.task/conflict? task))
                (is (empty? @loaded) "no reconcile on an unresolvable-base conflict")))))))))

;;; ------------------------------------------------- Export Endpoint -------------------------------------------------

(deftest export-errors-in-read-only-mode-test
  (testing "POST /api/ee/remote-sync/export errors when in read-only sync mode"
    (mt/with-temporary-setting-values [remote-sync-type :read-only]
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
              (is (= "Exports are only allowed when remote-sync-type is set to 'read-write'"
                     (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {:branch "main"}))))))))))

(deftest export-with-default-settings-test
  (testing "POST /api/ee/remote-sync/export succeeds with default settings"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}]
        (let [mock-main (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
              (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:branch "main"})
                    task (wait-for-task-completion task_id)]
                (is (remote-sync.task/successful? task))
                (is (=? {:message string? :task_id int?}
                        resp))))))))))

(deftest export-with-custom-branch-and-message-test
  (testing "POST /api/ee/remote-sync/export succeeds with a non-default branch and message when on that branch"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}]
        (let [mock-main (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "feature-branch"]
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
              (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                                                     {:branch "feature-branch" :message "Custom export message"})
                    task (wait-for-task-completion task_id)]
                (is (=? {:message string? :task_id int?}
                        resp))
                (is (remote-sync.task/successful? task))))))))))

(deftest export-requires-superuser-test
  (testing "POST /api/ee/remote-sync/export requires superuser permissions"
    (mt/with-temporary-setting-values [remote-sync-type :read-write
                                       remote-sync-url "file://repo.git"]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/remote-sync/export" {:branch "main"}))))))

(deftest export-errors-when-remote-sync-disabled-test
  (testing "POST /api/ee/remote-sync/export errors when remote sync is disabled"
    (mt/with-temporary-setting-values [remote-sync-type :read-write
                                       remote-sync-url nil]
      (is (= "Remote sync is not configured."
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {:branch "main"}))))))

(deftest export-handles-write-errors-test
  (testing "POST /api/ee/remote-sync/export handles write errors"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:is_remote_synced true :name "Test Collection" :location "/"}]
        ;; A pending create makes the export take the incremental write path, where the error fires.
        (t2/insert! :model/RemoteSyncObject {:model_type "Collection" :model_id coll-id :model_name "Test Collection"
                                             :status "create" :status_changed_at (t/offset-date-time)})
        (let [mock-main (test-helpers/create-mock-source :fail-mode :apply-changes-error)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
              (let [response (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:branch "main"})
                    task (wait-for-task-completion (:task_id response))]
                (is (remote-sync.task/failed? task))))))))))

(deftest export-errors-when-task-already-exists-test
  (testing "POST /api/ee/remote-sync/export errors when task already exists"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
              (is (= "Remote sync task in progress"
                     (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {:branch "main"}))))))))))

(deftest export-merges-if-external-changes-test
  (testing "POST /api/ee/remote-sync/export with merge=true merges when the remote is ahead of the last sync"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}
                     :model/RemoteSyncTask _ {:sync_task_type "foo"
                                              :ended_at :%now
                                              :version "other-version"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            ;; Stub the app-DB reconcile load — its correctness is covered synchronously by impl-test; here we
            ;; only verify the endpoint/flag wiring and task completion (loading into a real warehouse DB
            ;; inside the task thread is slow/racy on the MySQL/MariaDB app-db matrix).
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)
                                        impl/load-snapshot! (constantly nil)]
              (testing "merge=true reconciles non-conflicting remote changes and succeeds"
                (let [response (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:merge true :branch "main"})
                      task     (wait-for-task-completion (:task_id response))]
                  (is (remote-sync.task/successful? task)
                      "non-conflicting remote changes are merged in, so the export succeeds")))
              (testing "without the merge flag a diverged export ends in conflict, not success"
                (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "bar"
                                                        :ended_at :%now
                                                        :version "other-version"}]
                  (let [response (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:branch "main"})
                        task     (wait-for-task-completion (:task_id response))]
                    (is (remote-sync.task/conflict? task)
                        "a diverged export without force/merge surfaces a conflict for the UI to resolve"))))
              (testing "Can export when the versions match"
                (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"
                                                        :ended_at :%now
                                                        :version "mock-version"}]
                  (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:branch "main"}))))))))))

(deftest export-preflight-test
  (testing "GET /api/ee/remote-sync/export-preflight previews a merge without writing"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
              (testing "no prior sync -> not diverged"
                (let [resp (mt/user-http-request :crowberto :get 200 "ee/remote-sync/export-preflight?branch=main")]
                  (is (false? (:has_changes resp)))))
              (testing "remote ahead with non-conflicting changes -> clean merge available"
                (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"
                                                        :ended_at :%now
                                                        :version "other-version"}]
                  (let [resp (mt/user-http-request :crowberto :get 200 "ee/remote-sync/export-preflight?branch=main")]
                    (is (true? (:has_changes resp)))
                    (is (true? (:clean resp)))
                    (is (= [] (:conflicts resp)))))))))))))

(deftest export-rejects-branch-mismatch-test
  (testing "export and export-preflight reject a requested branch that disagrees with the configured setting (multi-tab CAS guard)"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}]
        (let [mock-main (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                             remote-sync-token  "test-token"
                                             remote-sync-branch "main"]
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-main)]
              (testing "POST /export -> 409 with a branch_mismatch flag and the current branch"
                (let [before (t2/count :model/RemoteSyncTask)
                      resp   (mt/user-http-request :crowberto :post 409 "ee/remote-sync/export" {:branch "stale-branch"})]
                  (is (true? (:branch_mismatch resp)))
                  (is (= "main" (:current_branch resp)))
                  (is (string? (:message resp)))
                  (is (= before (t2/count :model/RemoteSyncTask))
                      "no RemoteSyncTask row is created when the guard fires")))
              (testing "GET /export-preflight -> 409 with a branch_mismatch flag and the current branch"
                (let [resp (mt/user-http-request :crowberto :get 409 "ee/remote-sync/export-preflight?branch=stale-branch")]
                  (is (true? (:branch_mismatch resp)))
                  (is (= "main" (:current_branch resp))))))))))))

(deftest export-force-if-external-changes-test
  (testing "POST /api/ee/remote-sync/export can force sync when remote is ahead of the last sync"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"
                                              :ended_at :%now
                                              :version "other-version"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
              (testing "Can export with force"
                (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:force true :branch "main"})))))))))

;;; ------------------------------------------------- Current Task Endpoint -------------------------------------------------

(deftest current-task-requires-superuser-test
  (testing "GET /api/ee/remote-sync/current-task requires superuser permissions (GHY-3804)"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/remote-sync/current-task")))))

(deftest current-task-returns-nil-when-no-tasks-test
  (testing "GET /api/ee/remote-sync/current-task returns nil when there are no tasks"
    (is (nil? (mt/user-http-request :crowberto :get 204 "ee/remote-sync/current-task")))))

(deftest current-task-returns-active-task-test
  (testing "GET /api/ee/remote-sync/current-task returns the current task when one exists"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "export"
                                            :last_progress_report_at :%now
                                            :started_at :%now}]
      (is (=? {:id integer?
               :started_at some?
               :ended_at nil?}
              (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task"))))))

(deftest current-task-returns-completed-task-test
  (testing "GET /api/ee/remote-sync/current-task returns completed task after completion"
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "export"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (remote-sync.task/complete-sync-task! id)
      (is (=? {:id integer?
               :started_at some?
               :ended_at some?}
              (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task"))))))

(deftest current-task-returns-outcome-test
  (testing "GET /api/ee/remote-sync/current-task returns the structured outcome for a completed task (GHY-3747)"
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "import"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (remote-sync.task/complete-sync-task! id {:kind "pulled" :count 12 :branch "main"})
      (is (=? {:status "successful"
               :ended_at some?
               :outcome {:kind "pulled" :count 12 :branch "main"}}
              (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task"))))))

(deftest current-task-returns-error-for-failed-task-test
  (testing "GET /api/ee/remote-sync/current-task returns error message for failed task"
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "export"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (remote-sync.task/fail-sync-task! id "Some error")
      (is (=? {:error_message "Some error"}
              (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task"))))))

(deftest current-task-returns-cancelled-status-test
  (testing "GET /api/ee/remote-sync/current-task returns cancelled status for cancelled task"
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "export"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (remote-sync.task/cancel-sync-task! id)
      (is (=? {:cancelled true
               :error_message "Task cancelled"}
              (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task"))))))

;;; ------------------------------------------------- Cancel Task Endpoint -------------------------------------------------

(deftest cancel-task-requires-superuser-test
  (testing "POST /api/ee/remote-sync/current-task/cancel requires superuser permissions (GHY-3804)"
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "export"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/remote-sync/current-task/cancel")))
      (testing "task is not cancelled by the non-superuser request"
        (is (not (remote-sync.task/cancelled? (t2/select-one :model/RemoteSyncTask :id id))))))))

(deftest cancel-task-errors-when-no-tasks-test
  (testing "POST /api/ee/remote-sync/current-task/cancel errors when there are no tasks"
    (is (= "No active task to cancel"
           (mt/user-http-request :crowberto :post 400 "ee/remote-sync/current-task/cancel")))))

(deftest cancel-task-errors-when-last-task-completed-test
  (testing "POST /api/ee/remote-sync/current-task/cancel errors when last task completed"
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "export"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (remote-sync.task/complete-sync-task! id)
      (is (= "No active task to cancel"
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/current-task/cancel"))))))

(deftest cancel-task-errors-when-last-task-errored-test
  (testing "POST /api/ee/remote-sync/current-task/cancel errors when last task errored"
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "export"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (remote-sync.task/fail-sync-task! id "Error msg")
      (is (= "No active task to cancel"
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/current-task/cancel"))))))

(deftest cancel-active-task-test
  (testing "POST /api/ee/remote-sync/current-task/cancel successfully cancels active task"
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "export"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (is (=? {:id id
               :cancelled true
               :error_message "Task cancelled"}
              (mt/user-http-request :crowberto :post 200 "ee/remote-sync/current-task/cancel")))
      (is (remote-sync.task/cancelled? (t2/select-one :model/RemoteSyncTask :id id))))))

;;; ------------------------------------------------- Is Dirty Endpoint -------------------------------------------------

(deftest is-dirty-returns-false-when-no-changes-test
  (testing "GET /api/ee/remote-sync/is-dirty returns false when no remote-synced collections have changes"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/Collection _ {:name "Remote Collection"
                                          :is_remote_synced true
                                          :entity_id "test-collection-1"
                                          :location "/"}]
        (is (= {:is_dirty false}
               (mt/user-http-request :crowberto :get 200 "ee/remote-sync/is-dirty")))))))

(deftest is-dirty-returns-true-when-changes-exist-test
  (testing "GET /api/ee/remote-sync/is-dirty returns true when any remote-synced collection has changes"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/Collection remote-col {:name "Remote Collection"
                                                   :is_remote_synced true
                                                   :entity_id "test-collection-1"
                                                   :location "/"}
                     :model/Card card {:collection_id (:id remote-col)
                                       :name "Test Card"}
                     :model/RemoteSyncObject _ {:model_type "Card"
                                                :model_id (:id card)
                                                :model_name "Test Card"
                                                :model_collection_id (:id remote-col)
                                                :status "pending"
                                                :status_changed_at (java.time.OffsetDateTime/now)}]
        (is (= {:is_dirty true}
               (mt/user-http-request :crowberto :get 200 "ee/remote-sync/is-dirty")))))))

(deftest is-dirty-requires-superuser-test
  (testing "GET /api/ee/remote-sync/is-dirty requires superuser permissions"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/remote-sync/is-dirty")))))

;;; ------------------------------------------------- Dirty Models Endpoint -------------------------------------------------

(deftest dirty-returns-empty-list-when-no-dirty-models-test
  (testing "GET /api/ee/remote-sync/dirty returns empty list when no dirty models"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/Collection _ {:name "Remote Collection"
                                          :is_remote_synced true
                                          :entity_id "test-collection-1"
                                          :location "/"}]
        (is (= {:dirty []}
               (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")))))))

(deftest dirty-returns-all-dirty-models-test
  (testing "GET /api/ee/remote-sync/dirty returns all dirty models across remote-synced collections"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/Collection remote-col1 {:name "Remote Collection 1"
                                                    :is_remote_synced true
                                                    :entity_id "test-collection-1"
                                                    :location "/"}
                     :model/Collection remote-col2 {:name "Remote Collection 2"
                                                    :is_remote_synced true
                                                    :entity_id "test-collection-2"
                                                    :location "/"}
                     :model/Card card1 {:collection_id (:id remote-col1)
                                        :name "Card 1"}
                     :model/Card card2 {:collection_id (:id remote-col2)
                                        :name "Card 2"}
                     :model/Dashboard dashboard {:collection_id (:id remote-col1)
                                                 :name "Dashboard 1"}
                     :model/RemoteSyncObject _ {:model_type "card"
                                                :model_id (:id card1)
                                                :model_name "Card 1"
                                                :model_collection_id (:id remote-col1)
                                                :status "pending"
                                                :status_changed_at (java.time.OffsetDateTime/now)}
                     :model/RemoteSyncObject _ {:model_type "card"
                                                :model_id (:id card2)
                                                :model_name "Card 2"
                                                :model_collection_id (:id remote-col2)
                                                :status "pending"
                                                :status_changed_at (java.time.OffsetDateTime/now)}
                     :model/RemoteSyncObject _ {:model_type "dashboard"
                                                :model_id (:id dashboard)
                                                :model_name "Dashboard 1"
                                                :model_collection_id (:id remote-col1)
                                                :status "pending"
                                                :status_changed_at (java.time.OffsetDateTime/now)}]
        (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
              dirty-items (:dirty response)]
          (is (= 3 (count dirty-items)))
          (is (= #{"Card 1" "Card 2" "Dashboard 1"}
                 (set (map :name dirty-items))))
          (is (= #{"card" "dashboard"}
                 (set (map :model dirty-items)))))))))

(deftest dirty-returns-nested-collection-models-test
  (testing "GET /api/ee/remote-sync/dirty returns dirty models from nested collections"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/Collection remote-col {:name "Remote Collection"
                                                   :is_remote_synced true
                                                   :entity_id "test-collection-1"
                                                   :location "/"}
                     :model/Collection nested-col {:name "Nested Collection"
                                                   :is_remote_synced true
                                                   :location (str "/" (:id remote-col) "/")}
                     :model/Card nested-card {:collection_id (:id nested-col)
                                              :name "Nested Card"}
                     :model/RemoteSyncObject _ {:model_type "card"
                                                :model_name "Nested Card"
                                                :model_collection_id (:id nested-col)
                                                :model_id (:id nested-card)
                                                :status "pending"
                                                :status_changed_at (java.time.OffsetDateTime/now)}]
        (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
              dirty-items (:dirty response)]
          (is (= 1 (count dirty-items)))
          (is (= "Nested Card" (:name (first dirty-items)))))))))

(deftest dirty-deduplicates-items-test
  (testing "GET /api/ee/remote-sync/dirty deduplicates items"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/Collection remote-col {:name "Remote Collection"
                                                   :is_remote_synced true
                                                   :entity_id "test-collection-1"
                                                   :location "/"}
                     :model/Card card {:collection_id (:id remote-col)
                                       :name "Test Card"}
                     :model/RemoteSyncObject _ {:model_type "Card"
                                                :model_id (:id card)
                                                :model_name "Test Card"
                                                :model_collection_id (:id remote-col)
                                                :status "pending"
                                                :status_changed_at (java.time.OffsetDateTime/now)}]
        (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
              dirty-items (:dirty response)]
          (is (= 1 (count dirty-items)))
          (is (= "Test Card" (:name (first dirty-items)))))))))

(deftest dirty-requires-superuser-test
  (testing "GET /api/ee/remote-sync/dirty requires superuser permissions"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/remote-sync/dirty")))))

;;; ------------------------------------------------- Settings Endpoint -------------------------------------------------

(deftest settings-update-succeeds-test
  (testing "PUT /api/ee/remote-sync/settings successfully updates settings"
    (let [mock-main (test-helpers/create-mock-source)]
      (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                  source/source-from-settings (constantly mock-main)]
        (mt/with-temporary-setting-values [remote-sync-url nil
                                           remote-sync-type :read-write]
          (let [resp (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                           {:remote-sync-url "https://github.com/test/repo.git"
                                            :remote-sync-branch "main"})]
            (is (= {:success true} resp))))))))

(deftest settings-update-triggers-import-in-read-only-test
  (testing "PUT /api/ee/remote-sync/settings triggers import when type is read-only"
    (let [mock-main (test-helpers/create-mock-source)]
      (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                  source/source-from-settings (constantly mock-main)]
        (mt/with-temporary-setting-values [remote-sync-type :read-only
                                           remote-sync-branch "main"
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:remote-sync-url "file://repo.git"
                                                :remote-sync-type :read-only})
                task (wait-for-task-completion (:task_id response))]
            (is (=? {:success true} response))
            (is (remote-sync.task/successful? task))))))))

(deftest settings-requires-superuser-test
  (testing "PUT /api/ee/remote-sync/settings requires superuser permissions"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :put 403 "ee/remote-sync/settings" {})))))

(deftest settings-handles-invalid-settings-test
  (testing "PUT /api/ee/remote-sync/settings handles invalid settings"
    (let [response (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                         {:remote-sync-url "asdf://invalid-url"})]
      (is (= "Invalid repository URL: only HTTPS URLs are supported (e.g., https://git-host.example.com/yourcompany/repo.git)" (:error response))))))

(deftest settings-cannot-change-with-dirty-data
  (testing "PUT /api/ee/remote-sync/settings doesn't allow losing dirty data"
    (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly true)
                                settings/check-and-update-remote-settings! #(throw (Exception. "Should not be called"))]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"
                                         remote-sync-type :read-write]
        (testing "cannot change to read-only mode"
          (is (= "There are unsaved changes in the Remote Sync collection which will be overwritten switching to read-only mode."
                 (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                       {:remote-sync-type :read-only
                                        :remote-sync-branch "main"
                                        :remote-sync-url "https://github.com/test/repo.git"
                                        :remote-sync-token "test-token"}))))))))

(deftest settings-refuses-while-task-running-test
  (testing "PUT /api/ee/remote-sync/settings refuses with 400 when a RemoteSyncTask is active"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                            :initiated_by   (mt/user->id :rasta)
                                            :started_at     (t/offset-date-time)
                                            :progress       0.0}]
      (let [check-git-call-count (atom 0)]
        (with-redefs [settings/check-git-settings! (fn [_] (swap! check-git-call-count inc) true)]
          (mt/with-temporary-setting-values [remote-sync-url    "file://my/repo.git"
                                             remote-sync-token  nil
                                             remote-sync-type   :read-only
                                             remote-sync-branch "main"]
            (let [response (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                                 {:remote-sync-url    "file://different.git"
                                                  :remote-sync-type   :read-only
                                                  :remote-sync-branch "feature-x"
                                                  :remote-sync-token  nil})]
              (is (= "Remote sync task in progress" (:message response))
                  "endpoint should return the guard's error message"))
            (is (= "file://my/repo.git" (settings/remote-sync-url))
                "remote-sync-url must remain unchanged when the guard fires")
            (is (= "main" (settings/remote-sync-branch))
                "remote-sync-branch must remain unchanged when the guard fires")
            (is (zero? @check-git-call-count)
                "check-git-settings! must not be called when the guard fires")))))))

;;; ------------------------------------------- Settings Collections Tests -------------------------------------------

(deftest settings-collections-enables-remote-sync-on-single-collection-test
  (testing "PUT /api/ee/remote-sync/settings with collections enables remote sync on a single collection"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
        (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                    impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:collections {coll-id true}})]
            (is (= {:success true} response))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll-id))))))))))

(deftest settings-collections-disables-remote-sync-on-single-collection-test
  (testing "PUT /api/ee/remote-sync/settings with collections disables remote sync on a single collection"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
        (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                    impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:collections {coll-id false}})]
            (is (= {:success true} response))
            (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll-id))))))))))

(deftest settings-collections-enables-multiple-collections-test
  (testing "PUT /api/ee/remote-sync/settings with collections enables remote sync on multiple collections"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced false}
                     :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced false}]
        (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                    impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:collections {coll1-id true coll2-id true}})]
            (is (= {:success true} response))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id))))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll2-id))))))))))

(deftest settings-collections-mixed-enable-disable-test
  (testing "PUT /api/ee/remote-sync/settings with collections handles mixed enable/disable operations"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced false}
                     :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}]
        (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                    impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:collections {coll1-id true coll2-id false}})]
            (is (= {:success true} response))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id))))
            (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll2-id))))))))))

(deftest settings-collections-cascades-to-descendants-test
  (testing "PUT /api/ee/remote-sync/settings with collections cascades to descendants"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced false}
                     :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced false}
                     :model/Collection {grandchild-id :id} {:name "Grandchild" :location (format "/%d/%d/" parent-id child-id) :is_remote_synced false}]
        (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                    impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:collections {parent-id true}})]
            (is (= {:success true} response))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id child-id))))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id grandchild-id))))))))))

(deftest settings-collections-cascades-disable-to-descendants-test
  (testing "PUT /api/ee/remote-sync/settings with collections cascades disable to descendants"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced true}
                     :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced true}
                     :model/Collection {grandchild-id :id} {:name "Grandchild" :location (format "/%d/%d/" parent-id child-id) :is_remote_synced true}]
        (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                    impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:collections {parent-id false}})]
            (is (= {:success true} response))
            (is (false? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
            (is (false? (:is_remote_synced (t2/select-one :model/Collection :id child-id))))
            (is (false? (:is_remote_synced (t2/select-one :model/Collection :id grandchild-id))))))))))

(deftest settings-collections-errors-on-non-remote-synced-dependencies-test
  (testing "PUT /api/ee/remote-sync/settings with collections errors when enabling a collection with non-remote-synced dependencies"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {remote-synced-coll-id :id} {:name "Remote Synced" :location "/" :is_remote_synced false}
                     :model/Collection {regular-coll-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                     :model/Card {source-card-id :id} {:name "Source Card"
                                                       :collection_id regular-coll-id
                                                       :database_id (mt/id)
                                                       :dataset_query (mt/mbql-query venues)}
                     :model/Card _ {:name "Dependent Card"
                                    :collection_id remote-synced-coll-id
                                    :database_id (mt/id)
                                    :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
        (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                    impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                               {:collections {remote-synced-coll-id true}})]
            (is (= "Uses content that is not remote synced." (:error response)))))))))

(deftest settings-collections-errors-on-remote-synced-dependents-test
  (testing "PUT /api/ee/remote-sync/settings with collections errors when disabling a collection that has remote-synced dependents"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced true}
                     :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}
                     :model/Card {source-card-id :id} {:name "Source Card"
                                                       :collection_id coll1-id
                                                       :database_id (mt/id)
                                                       :dataset_query (mt/mbql-query venues)}
                     :model/Card _ {:name "Dependent Card"
                                    :collection_id coll2-id
                                    :database_id (mt/id)
                                    :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
        (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                    impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                               {:collections {coll1-id false}})]
            (is (= "Used by remote synced content." (:error response)))))))))

(deftest settings-collections-empty-is-no-op-test
  (testing "PUT /api/ee/remote-sync/settings with empty collections is a no-op"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                  impl/finish-remote-config! (constantly nil)]
        (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                             {:collections {}})]
          (is (= {:success true} response))
          (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))))))))

(deftest settings-collections-requires-superuser-test
  (testing "PUT /api/ee/remote-sync/settings with collections requires superuser permissions"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "ee/remote-sync/settings"
                                   {:collections {coll-id true}}))))))

(deftest settings-collections-rejects-changes-in-read-only-mode-test
  (testing "PUT /api/ee/remote-sync/settings rejects collection changes when remote-sync-type is read-only"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}
                   :model/Collection {synced-coll-id :id} {:name "Synced Collection" :location "/" :is_remote_synced true}]
      (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                  impl/finish-remote-config! (constantly nil)]
        (testing "rejects enabling collections when remote-sync-type is explicitly read-only"
          (is (= "Cannot change synced collections when remote-sync-type is read-only."
                 (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                       {:remote-sync-type :read-only
                                        :collections {coll-id true}}))))
        (testing "rejects disabling collections when remote-sync-type is explicitly read-only"
          (is (= "Cannot change synced collections when remote-sync-type is read-only."
                 (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                       {:remote-sync-type :read-only
                                        :collections {synced-coll-id false}}))))
        (testing "rejects collection changes when remote-sync-type is already read-only (default)"
          (mt/with-temporary-setting-values [remote-sync-type :read-only]
            (is (= "Cannot change synced collections when remote-sync-type is read-only."
                   (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                         {:collections {coll-id true}})))))))))

(deftest settings-collections-no-op-skips-read-only-check-test
  (testing "PUT /api/ee/remote-sync/settings skips read-only error when collections have no actual changes"
    (mt/with-temp [:model/Collection {unsynced-id :id} {:name "Unsynced Collection" :location "/" :is_remote_synced false}
                   :model/Collection {synced-id :id} {:name "Synced Collection" :location "/" :is_remote_synced true}]
      (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                  impl/finish-remote-config! (constantly nil)]
        (testing "sending false for already-unsynced collection in read-only mode succeeds"
          (is (= {:success true}
                 (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                       {:remote-sync-type :read-only
                                        :collections {unsynced-id false}}))))
        (testing "sending true for already-synced collection in read-only mode succeeds"
          (is (= {:success true}
                 (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                       {:remote-sync-type :read-only
                                        :collections {synced-id true}}))))
        (testing "mix of no-op and real change still rejects in read-only mode"
          (is (= "Cannot change synced collections when remote-sync-type is read-only."
                 (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                       {:remote-sync-type :read-only
                                        :collections {synced-id true unsynced-id true}}))))))))

(deftest settings-collections-no-op-skips-bulk-set-test
  (testing "PUT /api/ee/remote-sync/settings skips bulk-set-remote-sync when collections have no actual changes"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced Collection" :location "/" :is_remote_synced true}
                     :model/Collection {unsynced-id :id} {:name "Unsynced Collection" :location "/" :is_remote_synced false}]
        (let [bulk-set-called? (atom false)]
          (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                      impl/finish-remote-config! (constantly nil)
                                      remote-sync.core/bulk-set-remote-sync (fn [& _] (reset! bulk-set-called? true))]
            (testing "no-op collections do not call bulk-set-remote-sync"
              (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                   {:collections {synced-id true unsynced-id false}})]
                (is (= {:success true} response))
                (is (false? @bulk-set-called?))))))))))

(deftest settings-collections-allows-changes-in-read-write-mode-test
  (testing "PUT /api/ee/remote-sync/settings allows collection changes when remote-sync-type is read-write"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (mt/with-dynamic-fn-redefs [settings/check-and-update-remote-settings! (constantly nil)
                                  impl/finish-remote-config! (constantly nil)]
        (testing "allows enabling collections when remote-sync-type is explicitly read-write"
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:remote-sync-type :read-write
                                                :collections {coll-id true}})]
            (is (= {:success true} response))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll-id))))))
        (testing "allows disabling collections when remote-sync-type is explicitly read-write"
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:remote-sync-type :read-write
                                                :collections {coll-id false}})]
            (is (= {:success true} response))
            (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll-id))))))
        (testing "allows collection changes when remote-sync-type is already read-write"
          (mt/with-temporary-setting-values [remote-sync-type :read-write]
            (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                 {:collections {coll-id true}})]
              (is (= {:success true} response))
              (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))))))))))

(deftest create-branch
  (testing "POST /api/ee/remote-sync/create-branch creates a new branch"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"
                                         remote-sync-type :read-write]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
          (is (= {:status  "success"
                  :message "Branch 'feature-branch' created from 'main'"}
                 (mt/user-http-request :crowberto :post 200 "ee/remote-sync/create-branch"
                                       {:name "feature-branch"})))
          (is (= #{["main" "main-ref"] ["develop" "develop-ref"] ["feature-branch" "feature-branch-ref"]}
                 (set (source.p/branches mock-source))))
          (is (= "feature-branch" (settings/remote-sync-branch))))))))

(deftest stash
  (testing "POST /api/ee/remote-sync/stash"
    (let [mock-source  (test-helpers/create-mock-source)
          export-calls (atom 0)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"
                                         remote-sync-type :read-write]
        (mt/with-temp [:model/RemoteSyncObject remote-sync {:model_type          "Card"
                                                            :model_id            1
                                                            :model_name          "Test Card"
                                                            :model_collection_id 1
                                                            :status              "updated"
                                                            :status_changed_at   (java.time.OffsetDateTime/now)}]
          (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)
                                      impl/async-export!          (fn [_ _ _ & _opts] (assoc remote-sync :calls (swap! export-calls inc)))]
            (is (=? {:status  "success"
                     :message "Stashing to feature-branch"}
                    (mt/user-http-request :crowberto :post 200 "ee/remote-sync/stash"
                                          {:new_branch "feature-branch"
                                           :message    "Stash message"})))
            (is (= #{["main" "main-ref"] ["develop" "develop-ref"] ["feature-branch" "feature-branch-ref"]}
                   (set (source.p/branches mock-source))))
            (is (= 1 @export-calls))))))))

;;; ------------------------------------------------- Has Remote Changes Endpoint -------------------------------------------------

(deftest has-remote-changes-requires-superuser-test
  (testing "GET /api/ee/remote-sync/has-remote-changes requires superuser permissions"
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/remote-sync/has-remote-changes"))))))

(deftest has-remote-changes-errors-when-not-configured-test
  (testing "GET /api/ee/remote-sync/has-remote-changes errors when remote sync is not configured"
    (mt/with-temporary-setting-values [remote-sync-url nil]
      (is (= "Remote sync is not configured."
             (mt/user-http-request :crowberto :get 400 "ee/remote-sync/has-remote-changes"))))))

(deftest has-remote-changes-returns-true-when-never-imported-test
  (testing "GET /api/ee/remote-sync/has-remote-changes returns true when never imported"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
          ;; Clear cache before test
          (impl/invalidate-remote-changes-cache!)
          (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")]
            (is (true? (:has_changes response)))
            (is (= "mock-version" (:remote_version response)))
            (is (nil? (:local_version response)))
            (is (= false (:cached response)))))))))

(deftest has-remote-changes-returns-true-when-versions-differ-test
  (testing "GET /api/ee/remote-sync/has-remote-changes returns true when remote version differs from local"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                                :ended_at :%now
                                                :version "old-version"}]
          (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
            ;; Clear cache before test
            (impl/invalidate-remote-changes-cache!)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")]
              (is (true? (:has_changes response)))
              (is (= "mock-version" (:remote_version response)))
              (is (= "old-version" (:local_version response)))
              (is (= false (:cached response))))))))))

(deftest has-remote-changes-returns-false-when-versions-match-test
  (testing "GET /api/ee/remote-sync/has-remote-changes returns false when versions match"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                                :ended_at :%now
                                                :version "mock-version"}]
          (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
            ;; Clear cache before test
            (impl/invalidate-remote-changes-cache!)
            (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")]
              (is (= false (:has_changes response)))
              (is (= "mock-version" (:remote_version response)))
              (is (= "mock-version" (:local_version response)))
              (is (= false (:cached response))))))))))

(deftest has-remote-changes-uses-cache-test
  (testing "GET /api/ee/remote-sync/has-remote-changes uses cache on subsequent calls"
    (let [mock-source (test-helpers/create-mock-source)
          call-count (atom 0)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"
                                         remote-sync-check-changes-cache-ttl-seconds 60]
        (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                                :ended_at :%now
                                                :version "mock-version"}]
          (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _args]
                                                                    (swap! call-count inc)
                                                                    mock-source)]
            ;; Clear cache before test
            (impl/invalidate-remote-changes-cache!)
            ;; First call - should hit the source
            (let [response1 (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")]
              (is (= false (:cached response1)))
              (is (= 1 @call-count)))
            ;; Second call - should use cache
            (let [response2 (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")]
              (is (true? (:cached response2)))
              (is (= 1 @call-count)))))))))

(deftest has-remote-changes-force-refresh-bypasses-cache-test
  (testing "GET /api/ee/remote-sync/has-remote-changes?force-refresh=true bypasses cache"
    (let [mock-source (test-helpers/create-mock-source)
          call-count (atom 0)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"
                                         remote-sync-check-changes-cache-ttl-seconds 60]
        (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                                :ended_at :%now
                                                :version "mock-version"}]
          (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _args]
                                                                    (swap! call-count inc)
                                                                    mock-source)]
            ;; Clear cache before test
            (impl/invalidate-remote-changes-cache!)
            ;; First call - should hit the source
            (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")
            (is (= 1 @call-count))
            ;; Second call with force-refresh=true - should bypass cache
            (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes"
                                                 :force-refresh true)]
              (is (= false (:cached response)))
              (is (= 2 @call-count)))))))))

(deftest has-remote-changes-cache-invalidated-on-branch-change-test
  (testing "GET /api/ee/remote-sync/has-remote-changes invalidates cache when branch changes"
    (let [mock-source (test-helpers/create-mock-source)
          call-count (atom 0)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"
                                         remote-sync-check-changes-cache-ttl-seconds 60]
        (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                                :ended_at :%now
                                                :version "mock-version"}]
          (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _args]
                                                                    (swap! call-count inc)
                                                                    mock-source)]
            ;; Clear cache before test
            (impl/invalidate-remote-changes-cache!)
            ;; First call with main branch
            (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")
            (is (= 1 @call-count))
            ;; Change branch setting
            (mt/with-temporary-setting-values [remote-sync-branch "develop"]
              ;; Should hit source again due to branch change
              (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")]
                (is (= false (:cached response)))
                (is (= 2 @call-count))))))))))

(defn- missing-branch-source
  "Source whose snapshot throws the typed :missing-branch ex-info — simulating a
   configured branch that has been deleted upstream."
  [branch]
  (reify source.p/Source
    (branches [_] ["main"])
    (create-branch [_ _ _] nil)
    (default-branch [_] "main")
    (snapshot [_]
      (throw (ex-info (str "Invalid branch: " branch)
                      {:error-type :missing-branch
                       :branch branch})))
    (snapshot-at [_ _version]
      (throw (ex-info (str "Invalid branch: " branch)
                      {:error-type :missing-branch
                       :branch branch})))))

(deftest has-remote-changes-returns-branch-missing-gracefully-test
  (testing "GET /has-remote-changes returns branch_missing=true instead of 500 when the branch has been deleted upstream"
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                       remote-sync-token "test-token"
                                       remote-sync-branch "gone"
                                       remote-sync-check-changes-cache-ttl-seconds 60]
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                              :ended_at :%now
                                              :version "some-prior-version"}]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] (missing-branch-source "gone"))]
          (impl/invalidate-remote-changes-cache!)
          (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")]
            (is (false? (:has_changes response)))
            (is (true? (:branch_missing response)))
            (is (nil? (:remote_version response)))
            (is (= "some-prior-version" (:local_version response)))
            (is (false? (:cached response)))))))))

(deftest has-remote-changes-does-not-cache-branch-missing-test
  (testing "Branch-missing results are not cached so a subsequent call re-checks"
    (let [snapshot-calls (atom 0)
          ;; First call returns missing-branch; second call succeeds.
          source-fn (fn [& _]
                      (swap! snapshot-calls inc)
                      (if (= 1 @snapshot-calls)
                        (missing-branch-source "gone")
                        (test-helpers/create-mock-source)))]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "gone"
                                         remote-sync-check-changes-cache-ttl-seconds 60]
        (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                                :ended_at :%now
                                                :version "mock-version"}]
          (mt/with-dynamic-fn-redefs [source/source-from-settings source-fn]
            (impl/invalidate-remote-changes-cache!)
            (let [first-response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")]
              (is (true? (:branch_missing first-response)))
              (is (false? (:cached first-response))))
            ;; Second call re-hits the source; cache was not populated by the first call.
            (let [second-response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/has-remote-changes")]
              (is (not (:branch_missing second-response)))
              (is (false? (:cached second-response)))
              (is (= 2 @snapshot-calls)))))))))

(deftest has-remote-changes-still-propagates-other-errors-test
  (testing "Non-missing-branch failures still propagate (the graceful handler is :missing-branch-only)"
    (let [failing-source (reify source.p/Source
                           (branches [_] ["main"])
                           (create-branch [_ _ _] nil)
                           (default-branch [_] "main")
                           (snapshot [_] (throw (RuntimeException. "boom")))
                           (snapshot-at [_ _version] (throw (RuntimeException. "boom"))))]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"
                                         remote-sync-check-changes-cache-ttl-seconds 60]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] failing-source)]
          (impl/invalidate-remote-changes-cache!)
          (is (thrown-with-msg? RuntimeException #"boom"
                                (impl/has-remote-changes?))))))))

;;; ------------------------------------------- Token Preservation Tests -------------------------------------------

(deftest settings-preserves-token-when-switching-to-read-only-test
  (testing "PUT /api/ee/remote-sync/settings preserves token when switching from read-write to read-only"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                  source/source-from-settings (constantly mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "secret-token-value"
                                           remote-sync-branch "main"
                                           remote-sync-type :read-write]
          (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                 {:remote-sync-type :read-only})]
            (wait-for-task-completion task_id)
            (is (= {:success true :task_id task_id} resp))
            (is (= :read-only (settings/remote-sync-type)))
            (is (= "secret-token-value" (settings/remote-sync-token))
                "Token should be preserved when not included in request")))))))

(deftest settings-preserves-token-when-changing-branch-test
  (testing "PUT /api/ee/remote-sync/settings preserves token when changing branch"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                  source/source-from-settings (constantly mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "secret-token-value"
                                           remote-sync-branch "main"
                                           remote-sync-type :read-write]
          (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                 {:remote-sync-branch "develop"})]
            (wait-for-task-completion task_id)
            (is (=? {:success true} resp))
            (is (= "develop" (settings/remote-sync-branch)))
            (is (= "secret-token-value" (settings/remote-sync-token))
                "Token should be preserved when not included in request")))))))

(deftest settings-clears-token-when-explicitly-nil-test
  (testing "PUT /api/ee/remote-sync/settings clears token when explicitly set to nil"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                  source/source-from-settings (constantly mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "secret-token-value"
                                           remote-sync-branch "main"
                                           remote-sync-type :read-write]
          (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                 {:remote-sync-token nil})]
            (wait-for-task-completion task_id)
            (is (=? {:success true} resp))
            (is (nil? (settings/remote-sync-token))
                "Token should be cleared when explicitly set to nil")))))))

;;; ------------------------------------------- Transforms Setting Tests -------------------------------------------

(deftest settings-updates-transforms-setting-test
  (testing "PUT /api/ee/remote-sync/settings can update remote-sync-transforms setting"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                  source/source-from-settings (constantly mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"
                                           remote-sync-type :read-write
                                           remote-sync-transforms false]
          (let [built-in-count (t2/count :model/TransformTag :built_in_type [:not= nil])]
            (testing "can enable transforms sync"
              (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                     {:remote-sync-transforms true})]
                (wait-for-task-completion task_id)
                (is (=? {:success true} resp))
                (is (true? (settings/remote-sync-transforms)))
                (is (= built-in-count (t2/count :model/TransformTag :built_in_type [:not= nil]))
                    "Built-in transform tags should not be deleted by sync")))
            (testing "can disable transforms sync"
              (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                     {:remote-sync-transforms false})]
                (wait-for-task-completion task_id)
                (is (=? {:success true} resp))
                (is (false? (settings/remote-sync-transforms)))
                (is (= built-in-count (t2/count :model/TransformTag :built_in_type [:not= nil]))
                    "Built-in transform tags should not be deleted by sync")))))))))

(deftest settings-preserves-transforms-when-not-specified-test
  (testing "PUT /api/ee/remote-sync/settings preserves transforms setting when not specified"
    (let [mock-source (test-helpers/create-mock-source)]
      (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                  source/source-from-settings (constantly mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"
                                           remote-sync-type :read-write
                                           remote-sync-transforms true]
          (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                 {:remote-sync-branch "develop"})]
            (wait-for-task-completion task_id)
            (is (=? {:success true} resp))
            (is (true? (settings/remote-sync-transforms))
                "Transforms setting should be preserved when not included in request")))))))

;;; ------------------------------------------- Dirty Endpoint with Transforms Root Tests -------------------------------------------

(deftest dirty-returns-transforms-root-collection-test
  (testing "GET /api/ee/remote-sync/dirty returns the Transforms root collection (id=-1) when present"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/RemoteSyncObject _ {:model_type "Collection"
                                                :model_id settings/transforms-root-id
                                                :model_name "Transforms"
                                                :status "create"
                                                :status_changed_at (java.time.OffsetDateTime/now)}]
        (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
              dirty-items (:dirty response)]
          (is (= 1 (count dirty-items)))
          (is (= "Transforms" (:name (first dirty-items))))
          (is (= "collection" (:model (first dirty-items))))
          (is (= settings/transforms-root-id (:id (first dirty-items)))))))))

(deftest dirty-returns-transforms-root-collection-with-delete-status-test
  (testing "GET /api/ee/remote-sync/dirty returns the Transforms root collection (id=-1) with delete status"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/RemoteSyncObject _ {:model_type "Collection"
                                                :model_id settings/transforms-root-id
                                                :model_name "Transforms"
                                                :status "delete"
                                                :status_changed_at (java.time.OffsetDateTime/now)}]
        (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
              dirty-items (:dirty response)]
          (is (= 1 (count dirty-items)))
          (is (= "Transforms" (:name (first dirty-items))))
          (is (= "collection" (:model (first dirty-items))))
          (is (= "delete" (:sync_status (first dirty-items))))
          (is (= settings/transforms-root-id (:id (first dirty-items)))))))))

(deftest dirty-returns-transforms-root-collection-when-setting-disabled-test
  (testing "GET /api/ee/remote-sync/dirty returns the Transforms root collection when transforms setting is disabled"
    (test-helpers/with-clean-object
      (mt/with-temporary-setting-values [remote-sync-transforms false]
        (mt/with-temp [:model/RemoteSyncObject _ {:model_type "Collection"
                                                  :model_id settings/transforms-root-id
                                                  :model_name "Transforms"
                                                  :status "delete"
                                                  :status_changed_at (java.time.OffsetDateTime/now)}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
                dirty-items (:dirty response)]
            (is (= 1 (count dirty-items)) "Transforms root should be returned even when setting is disabled")
            (is (= "Transforms" (:name (first dirty-items))))
            (is (= "delete" (:sync_status (first dirty-items))))))))))

(deftest settings-collections-not-marked-synced-when-settings-validation-fails-test
  (testing "PUT /api/ee/remote-sync/settings does not mark collections as synced when settings validation fails"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
        (with-redefs [settings/check-and-update-remote-settings!
                      (fn [_] (throw (ex-info "Authentication is required" {:status-code 400})))
                      impl/finish-remote-config! (constantly nil)]
          (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                {:remote-sync-url   "https://github.com/test/private-repo.git"
                                 :remote-sync-type  :read-write
                                 :collections       {coll-id true}})
          (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))))))))

;; ---------- API-level guard sweep --------------------------------------------------------------
;;
;; Boundary tests verifying that every mutating remote-sync HTTP endpoint surfaces the guard's
;; refusal as a 400 response with `Remote sync task in progress`. Companions to the operation-level
;; tests; this catches the case where an endpoint is edited to bypass the guarded function.

(deftest import-refuses-while-task-running-test
  (testing "POST /api/ee/remote-sync/import returns 400 when a RemoteSyncTask is active"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                            :initiated_by   (mt/user->id :rasta)
                                            :started_at     (t/offset-date-time)
                                            :progress       0.0}]
      (let [mock-source     (test-helpers/create-mock-source)
            tasks-before    (t2/count :model/RemoteSyncTask)]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                             remote-sync-token  "test-token"
                                             remote-sync-branch "main"
                                             remote-sync-type   :read-write]
            (is (= "Remote sync task in progress"
                   (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {:expected_branch "main"})))
            (is (= tasks-before (t2/count :model/RemoteSyncTask))
                "no NEW RemoteSyncTask row should be created when the guard fires")))))))

(deftest export-refuses-while-task-running-test
  (testing "POST /api/ee/remote-sync/export returns 400 when a RemoteSyncTask is active"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                            :initiated_by   (mt/user->id :rasta)
                                            :started_at     (t/offset-date-time)
                                            :progress       0.0}]
      (let [mock-source  (test-helpers/create-mock-source)
            tasks-before (t2/count :model/RemoteSyncTask)]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                             remote-sync-token  "test-token"
                                             remote-sync-branch "main"
                                             remote-sync-type   :read-write]
            (is (= "Remote sync task in progress"
                   (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export"
                                         {:message "test export" :branch "main"})))
            (is (= tasks-before (t2/count :model/RemoteSyncTask))
                "no NEW RemoteSyncTask row should be created when the guard fires")))))))

(deftest create-branch-refuses-while-task-running-test
  (testing "POST /api/ee/remote-sync/create-branch returns 400 when a RemoteSyncTask is active"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                            :initiated_by   (mt/user->id :rasta)
                                            :started_at     (t/offset-date-time)
                                            :progress       0.0}]
      (let [mock-source      (test-helpers/create-mock-source)
            initial-branches @(:branches-atom mock-source)]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                             remote-sync-token  "test-token"
                                             remote-sync-branch "main"
                                             remote-sync-type   :read-write]
            ;; The endpoint wraps the guard's exception with "Failed to create branch: ..." in its catch.
            (is (re-find #"Remote sync task in progress"
                         (str (mt/user-http-request :crowberto :post 400 "ee/remote-sync/create-branch"
                                                    {:name "feature-x"}))))
            (is (= "main" (settings/remote-sync-branch))
                "remote-sync-branch must remain unchanged when the guard fires")
            (is (= initial-branches @(:branches-atom mock-source))
                "no new branch should be pushed to the source when the guard fires")))))))

(deftest stash-refuses-while-task-running-test
  (testing "POST /api/ee/remote-sync/stash returns 400 when a RemoteSyncTask is active"
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                            :initiated_by   (mt/user->id :rasta)
                                            :started_at     (t/offset-date-time)
                                            :progress       0.0}]
      (let [mock-source      (test-helpers/create-mock-source)
            initial-branches @(:branches-atom mock-source)
            tasks-before     (t2/count :model/RemoteSyncTask)]
        (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/test/repo.git"
                                             remote-sync-token  "test-token"
                                             remote-sync-branch "main"
                                             remote-sync-type   :read-write]
            ;; The endpoint wraps the guard's exception with "Failed to stash changes to branch: ..." in its catch.
            (is (re-find #"Remote sync task in progress"
                         (str (mt/user-http-request :crowberto :post 400 "ee/remote-sync/stash"
                                                    {:new_branch "stash-branch"
                                                     :message    "stash msg"}))))
            (is (= "main" (settings/remote-sync-branch))
                "remote-sync-branch must remain unchanged when the guard fires")
            (is (= initial-branches @(:branches-atom mock-source))
                "no new branch should be pushed to the source when the guard fires")
            (is (= tasks-before (t2/count :model/RemoteSyncTask))
                "no NEW RemoteSyncTask row should be created when the guard fires")))))))
