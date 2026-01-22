(ns metabase-enterprise.remote-sync.api-test
  (:require
   [clojure.test :refer :all]
   [diehard.core :as dh]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
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

;;; ------------------------------------------------- Branches Endpoint -------------------------------------------------

(deftest branches-endpoint-returns-branches-test
  (testing "GET /api/ee/remote-sync/branches returns list of branches"
    (with-redefs [source/source-from-settings (constantly (mock-git-source :branches ["main" "develop" "feature-branch"]))]
      (is (= {:items ["main" "develop" "feature-branch"]}
             (mt/user-http-request :crowberto :get 200 "ee/remote-sync/branches"))))))

(deftest branches-endpoint-requires-superuser-test
  (testing "GET /api/ee/remote-sync/branches requires superuser permissions"
    (with-redefs [source/source-from-settings (constantly (mock-git-source))]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/remote-sync/branches"))))))

(deftest branches-endpoint-errors-when-git-not-configured-test
  (testing "GET /api/ee/remote-sync/branches errors when git source not configured"
    (with-redefs [source/source-from-settings (constantly nil)]
      (is (= "Source not configured. Please configure MB_GIT_SOURCE_REPO_URL environment variable."
             (mt/user-http-request :crowberto :get 400 "ee/remote-sync/branches"))))))

(deftest branches-endpoint-handles-repository-errors-test
  (testing "GET /api/ee/remote-sync/branches handles git repository errors"
    (with-redefs [source/source-from-settings (constantly (mock-git-source :error-on-branches? true))]
      (is (= "Repository not found: Please check the repository URL"
             (mt/user-http-request :crowberto :get 400 "ee/remote-sync/branches"))))))

;;; ------------------------------------------------- Import Endpoint -------------------------------------------------

(deftest import-with-default-branch-test
  (testing "POST /api/ee/remote-sync/import succeeds with default branch"
    (let [mock-main (test-helpers/create-mock-source)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (with-redefs [source/source-from-settings (constantly mock-main)]
          (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {})
                completed-task (wait-for-task-completion task_id)]
            (is (=? {:status "success" :task_id int?} resp))
            (is (remote-sync.task/successful? completed-task))))))))

(deftest import-with-specific-branch-test
  (testing "POST /api/ee/remote-sync/import succeeds with specific branch"
    (let [mock-develop (test-helpers/create-mock-source :branch "develop")]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (with-redefs [source/source-from-settings (constantly mock-develop)]
          (let [{:as response :keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:branch "feature-branch"})
                completed-task (wait-for-task-completion task_id)]
            (is (= "success" (:status response)))
            (is (remote-sync.task/successful? completed-task))))))))

(deftest import-requires-superuser-test
  (testing "POST /api/ee/remote-sync/import requires superuser permissions"
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/remote-sync/import" {}))))))

(deftest import-errors-when-remote-sync-disabled-test
  (testing "POST /api/ee/remote-sync/import errors when remote sync is disabled"
    (mt/with-temporary-setting-values [remote-sync-url nil]
      (is (= "Remote sync is not configured."
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {}))))))

(deftest import-handles-network-errors-test
  (testing "POST /api/ee/remote-sync/import handles network errors during import"
    (let [mock-main (test-helpers/create-mock-source :fail-mode :network-error)]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"]
        (with-redefs [source/source-from-settings (constantly mock-main)]
          (let [{:as response :keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {})
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
          (with-redefs [source/source-from-settings (constantly mock-source)]
            (is (= "Remote sync in progress"
                   (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {})))))))))

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
        (with-redefs [source/source-from-settings (constantly mock-main)]
          (is (= "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                 (:message (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {}))))
          (testing "But can force an import"
            (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:force true})
                  completed-task (wait-for-task-completion task_id)]
              (is (=? {:status "success" :task_id int?} resp))
              (is (remote-sync.task/successful? completed-task)))))))))

;;; ------------------------------------------------- Export Endpoint -------------------------------------------------

(deftest export-errors-in-read-only-mode-test
  (testing "POST /api/ee/remote-sync/export errors when in read-only sync mode"
    (mt/with-temporary-setting-values [remote-sync-type :read-only]
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-source)]
              (is (= "Exports are only allowed when remote-sync-type is set to 'read-write'"
                     (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {}))))))))))

(deftest export-with-default-settings-test
  (testing "POST /api/ee/remote-sync/export succeeds with default settings"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}]
        (let [mock-main (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-main)]
              (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {})
                    task (wait-for-task-completion task_id)]
                (is (remote-sync.task/successful? task))
                (is (=? {:message string? :task_id int?}
                        resp))))))))))

(deftest export-with-custom-branch-and-message-test
  (testing "POST /api/ee/remote-sync/export succeeds with custom branch and message"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}]
        (let [mock-main (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-main)]
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
             (mt/user-http-request :rasta :post 403 "ee/remote-sync/export" {}))))))

(deftest export-errors-when-remote-sync-disabled-test
  (testing "POST /api/ee/remote-sync/export errors when remote sync is disabled"
    (mt/with-temporary-setting-values [remote-sync-type :read-write
                                       remote-sync-url nil]
      (is (= "Remote sync is not configured."
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {}))))))

(deftest export-handles-write-errors-test
  (testing "POST /api/ee/remote-sync/export handles write errors"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:is_remote_synced true :name "Test Collection" :location "/"}]
        (let [mock-main (test-helpers/create-mock-source :fail-mode :write-files-error)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-main)]
              (let [response (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {})
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
            (with-redefs [source/source-from-settings (constantly mock-source)]
              (is (= "Remote sync in progress"
                     (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {}))))))))))

(deftest export-errors-if-external-changes-test
  (testing "POST /api/ee/remote-sync/export errors when remote is ahead of the last sync"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"
                                              :ended_at :%now
                                              :version "other-version"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-source)]
              (is (= "Cannot export changes that will overwrite new changes in the branch."
                     (:message (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {}))))
              (testing "Can export when the versions match"
                (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"
                                                        :ended_at :%now
                                                        :version "mock-version"}]
                  (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {}))))))))))

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
            (with-redefs [source/source-from-settings (constantly mock-source)]
              (testing "Can export with force"
                (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {:force true})))))))))

;;; ------------------------------------------------- Current Task Endpoint -------------------------------------------------

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
      (with-redefs [settings/check-git-settings! (constantly nil)
                    source/source-from-settings (constantly mock-main)]
        (mt/with-temporary-setting-values [remote-sync-url nil
                                           remote-sync-type :read-write]
          (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                 {:remote-sync-url "https://github.com/test/repo.git"
                                                                  :remote-sync-branch "main"})
                task (wait-for-task-completion task_id)]
            (is (=? {:success true} resp))
            (is (remote-sync.task/successful? task))))))))

(deftest settings-update-triggers-import-in-read-only-test
  (testing "PUT /api/ee/remote-sync/settings triggers import when type is read-only"
    (let [mock-main (test-helpers/create-mock-source)]
      (with-redefs [settings/check-git-settings! (constantly nil)
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
      (is (= "Invalid Repository URL format" (:error response))))))

(deftest settings-cannot-change-with-dirty-data
  (testing "PUT /api/ee/remote-sync/settings doesn't allow losing dirty data"
    (with-redefs [remote-sync.object/dirty? (constantly true)
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

;;; ------------------------------------------- Settings Collections Tests -------------------------------------------

(deftest settings-collections-enables-remote-sync-on-single-collection-test
  (testing "PUT /api/ee/remote-sync/settings with collections enables remote sync on a single collection"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
        (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
                      impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:collections {coll-id true}})]
            (is (= {:success true} response))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll-id))))))))))

(deftest settings-collections-disables-remote-sync-on-single-collection-test
  (testing "PUT /api/ee/remote-sync/settings with collections disables remote sync on a single collection"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
        (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
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
        (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
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
        (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
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
        (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
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
        (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
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
        (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
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
        (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
                      impl/finish-remote-config! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                               {:collections {coll1-id false}})]
            (is (= "Used by remote synced content." (:error response)))))))))

(deftest settings-collections-empty-is-no-op-test
  (testing "PUT /api/ee/remote-sync/settings with empty collections is a no-op"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
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
      (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
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

(deftest settings-collections-allows-changes-in-read-write-mode-test
  (testing "PUT /api/ee/remote-sync/settings allows collection changes when remote-sync-type is read-write"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (with-redefs [settings/check-and-update-remote-settings! (constantly nil)
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
  (testing "POST /api/ee/remote-sync/create-branch creates a new branch")
  (let [mock-source (test-helpers/create-mock-source)]
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                       remote-sync-token "test-token"
                                       remote-sync-branch "main"
                                       remote-sync-type :read-write]
      (with-redefs [source/source-from-settings (constantly mock-source)]
        (is (= {:status "success"
                :message "Branch 'feature-branch' created from 'main'"}
               (mt/user-http-request :crowberto :post 200 "ee/remote-sync/create-branch"
                                     {:name "feature-branch"})))
        (is (= #{["main" "main-ref"] ["develop" "develop-ref"] ["feature-branch" "feature-branch-ref"]}
               (set (source.p/branches mock-source))))
        (is (= "feature-branch" (settings/remote-sync-branch)))))))

(deftest stash
  (testing "POST /api/ee/remote-sync/stash")
  (let [mock-source (test-helpers/create-mock-source)
        export-calls (atom 0)]
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                       remote-sync-token "test-token"
                                       remote-sync-branch "main"
                                       remote-sync-type :read-write]
      (mt/with-temp [:model/RemoteSyncObject remote-sync {:model_type "Card"
                                                          :model_id 1
                                                          :model_name "Test Card"
                                                          :model_collection_id 1
                                                          :status "updated"
                                                          :status_changed_at (java.time.OffsetDateTime/now)}]
        (with-redefs [source/source-from-settings (constantly mock-source)
                      impl/async-export!          (fn [_ _ _] (assoc remote-sync :calls (swap! export-calls inc)))]
          (is (=? {:status "success"
                   :message "Stashing to feature-branch"}
                  (mt/user-http-request :crowberto :post 200 "ee/remote-sync/stash"
                                        {:new_branch "feature-branch"
                                         :message "Stash message"})))
          (is (= #{["main" "main-ref"] ["develop" "develop-ref"] ["feature-branch" "feature-branch-ref"]}
                 (set (source.p/branches mock-source))))
          (is (= 1 @export-calls)))))))

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
        (with-redefs [source/source-from-settings (constantly mock-source)]
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
          (with-redefs [source/source-from-settings (constantly mock-source)]
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
          (with-redefs [source/source-from-settings (constantly mock-source)]
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
          (with-redefs [source/source-from-settings (fn [& _args]
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
          (with-redefs [source/source-from-settings (fn [& _args]
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
          (with-redefs [source/source-from-settings (fn [& _args]
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

;;; ------------------------------------------- Token Preservation Tests -------------------------------------------

(deftest settings-preserves-token-when-switching-to-read-only-test
  (testing "PUT /api/ee/remote-sync/settings preserves token when switching from read-write to read-only"
    (let [mock-source (test-helpers/create-mock-source)]
      (with-redefs [settings/check-git-settings! (constantly nil)
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
      (with-redefs [settings/check-git-settings! (constantly nil)
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
      (with-redefs [settings/check-git-settings! (constantly nil)
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
      (with-redefs [settings/check-git-settings! (constantly nil)
                    source/source-from-settings (constantly mock-source)]
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"
                                           remote-sync-type :read-write
                                           remote-sync-transforms false]
          (testing "can enable transforms sync"
            (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                   {:remote-sync-transforms true})]
              (wait-for-task-completion task_id)
              (is (=? {:success true} resp))
              (is (true? (settings/remote-sync-transforms)))))
          (testing "can disable transforms sync"
            (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                   {:remote-sync-transforms false})]
              (wait-for-task-completion task_id)
              (is (=? {:success true} resp))
              (is (false? (settings/remote-sync-transforms))))))))))

(deftest settings-preserves-transforms-when-not-specified-test
  (testing "PUT /api/ee/remote-sync/settings preserves transforms setting when not specified"
    (let [mock-source (test-helpers/create-mock-source)]
      (with-redefs [settings/check-git-settings! (constantly nil)
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
