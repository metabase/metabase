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
    (list-files [_] [])
    (read-file [_ _] "")
    (write-files! [_ _ _] nil)
    (version [_] "mock-version")))

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

(deftest export-errors-in-production-mode-test
  (testing "POST /api/ee/remote-sync/export errors when in production sync mode"
    (mt/with-temporary-setting-values [remote-sync-type :production]
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-source)]
              (is (= "Exports are only allowed when remote-sync-type is set to 'development'"
                     (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {}))))))))))

(deftest export-with-default-settings-test
  (testing "POST /api/ee/remote-sync/export succeeds with default settings"
    (mt/with-temporary-setting-values [remote-sync-type :development]
      (mt/with-temp [:model/Collection _ {:type "remote-synced" :name "Test Collection" :location "/"}]
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
    (mt/with-temporary-setting-values [remote-sync-type :development]
      (mt/with-temp [:model/Collection _ {:type "remote-synced" :name "Test Collection" :location "/"}]
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
    (mt/with-temporary-setting-values [remote-sync-type :development
                                       remote-sync-url "file://repo.git"]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/remote-sync/export" {}))))))

(deftest export-errors-when-remote-sync-disabled-test
  (testing "POST /api/ee/remote-sync/export errors when remote sync is disabled"
    (mt/with-temporary-setting-values [remote-sync-type :development
                                       remote-sync-url nil]
      (is (= "Remote sync is not configured."
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {}))))))

(deftest export-handles-write-errors-test
  (testing "POST /api/ee/remote-sync/export handles write errors"
    (mt/with-temporary-setting-values [remote-sync-type :development]
      (mt/with-temp [:model/Collection _ {:type "remote-synced" :name "Test Collection" :location "/"}]
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
    (mt/with-temporary-setting-values [remote-sync-type :development]
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
    (mt/with-temporary-setting-values [remote-sync-type :development]
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
    (mt/with-temporary-setting-values [remote-sync-type :development]
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
                                          :type "remote-synced"
                                          :entity_id "test-collection-1"
                                          :location "/"}]
        (is (= {:is_dirty false}
               (mt/user-http-request :crowberto :get 200 "ee/remote-sync/is-dirty")))))))

(deftest is-dirty-returns-true-when-changes-exist-test
  (testing "GET /api/ee/remote-sync/is-dirty returns true when any remote-synced collection has changes"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/Collection remote-col {:name "Remote Collection"
                                                   :type "remote-synced"
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
                                          :type "remote-synced"
                                          :entity_id "test-collection-1"
                                          :location "/"}]
        (is (= {:dirty []}
               (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")))))))

(deftest dirty-returns-all-dirty-models-test
  (testing "GET /api/ee/remote-sync/dirty returns all dirty models across remote-synced collections"
    (test-helpers/with-clean-object
      (mt/with-temp [:model/Collection remote-col1 {:name "Remote Collection 1"
                                                    :type "remote-synced"
                                                    :entity_id "test-collection-1"
                                                    :location "/"}
                     :model/Collection remote-col2 {:name "Remote Collection 2"
                                                    :type "remote-synced"
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
                                                   :type "remote-synced"
                                                   :entity_id "test-collection-1"
                                                   :location "/"}
                     :model/Collection nested-col {:name "Nested Collection"
                                                   :type "remote-synced"
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
                                                   :type "remote-synced"
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
                                           remote-sync-type :development]
          (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                 {:remote-sync-url "https://github.com/test/repo.git"
                                                                  :remote-sync-branch "main"})
                task (wait-for-task-completion task_id)]
            (is (=? {:success true} resp))
            (is (remote-sync.task/successful? task))))))))

(deftest settings-update-triggers-import-in-production-test
  (testing "PUT /api/ee/remote-sync/settings triggers import when type is production"
    (let [mock-main (test-helpers/create-mock-source)]
      (with-redefs [settings/check-git-settings! (constantly nil)
                    source/source-from-settings (constantly mock-main)]
        (mt/with-temporary-setting-values [remote-sync-type :production
                                           remote-sync-branch "main"
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                               {:remote-sync-url "file://repo.git"
                                                :remote-sync-type :production})
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
  (testing "PUT /api/ee/remote-sync/settings doesn't allow loosing dirty data"
    (with-redefs [remote-sync.object/dirty-global? (constantly true)
                  settings/check-and-update-remote-settings! #(throw (Exception. "Should not be called"))]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"
                                         remote-sync-type :development]
        (testing "cannot change to production mode"
          (is (= "There are unsaved changes in the Remote Sync collection which will be overwritten switching to production mode."
                 (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                       {:remote-sync-type :production
                                        :remote-sync-branch "main"
                                        :remote-sync-url "https://github.com/test/repo.git"
                                        :remote-sync-token "test-token"}))))))))

(deftest create-branch
  (testing "POST /api/ee/remote-sync/create-branch creates a new branch")
  (let [mock-source (test-helpers/create-mock-source)]
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                       remote-sync-token "test-token"
                                       remote-sync-branch "main"
                                       remote-sync-type :development]
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
                                       remote-sync-type :development]
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
