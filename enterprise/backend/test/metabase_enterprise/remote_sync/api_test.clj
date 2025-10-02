(ns metabase-enterprise.remote-sync.api-test
  (:require
   [clojure.test :refer :all]
   [diehard.core :as dh]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

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
    (list-files [_] [])
    (read-file [_ _] "")
    (write-files! [_ _ _] nil)
    (version [_] "mock-version")))

(defn delete-existing-remote-sync-tasks-fixture
  [f]
  (t2/delete! :model/RemoteSyncTask)
  (f))

(use-fixtures :once
  (fixtures/initialize :db)
  ;; TODO: this seems silly, maybe there's a better way?
  (fn [f] (mt/dataset test-data
            (mt/id)
            (f))))

(use-fixtures :each
  delete-existing-remote-sync-tasks-fixture
  (fn [f] (mt/with-model-cleanup [:model/RemoteSyncObject] (f)))
  (fn [f] (mt/with-premium-features #{:serialization} (f))))

(deftest branches-endpoint-test
  (testing "GET /api/ee/remote-sync/branches"

    (testing "successful response with configured source"
      (with-redefs [source/source-from-settings (constantly (mock-git-source :branches ["main" "develop" "feature-branch"]))]
        (mt/user-http-request :crowberto :get 200 "ee/remote-sync/branches")
        (is (= {:items ["main" "develop" "feature-branch"]}
               (mt/user-http-request :crowberto :get 200 "ee/remote-sync/branches")))))

    (testing "requires superuser permissions"
      (with-redefs [source/source-from-settings (constantly (mock-git-source))]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/remote-sync/branches")))))

    (testing "error when git source not configured"
      (with-redefs [source/source-from-settings (constantly nil)]
        (let [response (mt/user-http-request :crowberto :get 400 "ee/remote-sync/branches")]
          (is (= {:status "error"
                  :message "Git source not configured. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}
                 response)))))

    (testing "error handling for git repository errors"
      (with-redefs [source/source-from-settings (constantly (mock-git-source :error-on-branches? true))]
        (let [response (mt/user-http-request :crowberto :get 400 "ee/remote-sync/branches")]
          (is (= {:status "error"
                  :message "Repository not found: Please check the repository URL"}
                 response)))))))

(defn- wait-for-task-completion [task-id]
  (when task-id
    (dh/with-retry {:max-retries 10
                    :delay-ms 500}
      (u/prog1 (t2/select-one :model/RemoteSyncTask :id task-id)
        (when (nil? (:ended_at <>))
          (throw (ex-info "Not finished" {:task-id task-id
                                          :result <>})))))))

(deftest import-endpoint-test
  (testing "POST /api/ee/remote-sync/import"
    (testing "successful import with default branch"
      (let [mock-main (test-helpers/create-mock-source)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (with-redefs [source/source-from-settings (constantly mock-main)]
            (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {})
                  completed-task (wait-for-task-completion task_id)]
              (is (=? {:status "success" :task_id int?} resp))
              (is (remote-sync.task/successful? completed-task)))))))

    (testing "successful import with specific branch"
      (let [mock-develop (test-helpers/create-mock-source :branch "develop")]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (with-redefs [source/source-from-settings (constantly mock-develop)]
            (let [{:as response :keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:branch "feature-branch"})
                  completed-task (wait-for-task-completion task_id)]
              (is (= "success" (:status response)))
              (is (remote-sync.task/successful? completed-task)))))))

    (testing "requires superuser permissions"
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "ee/remote-sync/import" {})))))

    (testing "error when remote sync is disabled"
      (mt/with-temporary-setting-values [remote-sync-enabled false]
        (let [response (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {})]
          (is (= "Git sync is paused. Please resume it to perform import operations."
                 response)))))

    (testing "error handling for import failure"
      (let [mock-main (test-helpers/create-mock-source :fail-mode :network-error)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (with-redefs [source/source-from-settings (constantly mock-main)]
            (let [{:as response :keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {})
                  completed-task (wait-for-task-completion task_id)]
              (is (= "success" (:status response)))
              (is (remote-sync.task/failed? completed-task)))))))

    (testing "If a task already exists we get an error"
      (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-source)]
              (is (= "Remote sync in progress"
                     (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {}))))))))))

(deftest export-endpoint-test
  (testing "POST /api/ee/remote-sync/export"
    (mt/with-temporary-setting-values [remote-sync-type :production]
      (testing "If we are in production sync it errors"
        (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"}]
          (let [mock-source (test-helpers/create-mock-source)]
            (mt/with-temporary-setting-values [remote-sync-enabled true
                                               remote-sync-url "https://github.com/test/repo.git"
                                               remote-sync-token "test-token"
                                               remote-sync-branch "main"]
              (with-redefs [source/source-from-settings (constantly mock-source)]
                (is (= "Exports are only allowed when remote-sync-type is set to 'development'"
                       (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {})))))))))

    (mt/with-temporary-setting-values [remote-sync-type :development]
      (testing "successful export with default settings"
        (let [mock-main (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-main)]
              (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {})
                    task (wait-for-task-completion task_id)]
                (is (remote-sync.task/successful? task))
                (is (=? {:message string? :task_id int?}
                        resp)))))))

      (testing "successful export with custom branch and message"
        (let [mock-main (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-main)]
              (let [{:keys [task_id] :as resp} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                                                     {:branch "feature-branch" :message "Custom export message"})
                    task (wait-for-task-completion task_id)]
                (is (=? {:message string? :task_id int?}
                        resp))
                (is (remote-sync.task/successful? task)))))))

      (testing "requires superuser permissions"
        (mt/with-temporary-setting-values [remote-sync-enabled true]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/remote-sync/export" {})))))

      (testing "error when remote sync is disabled"
        (mt/with-temporary-setting-values [remote-sync-enabled false]
          (let [response (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {})]
            (is (= "Git sync is paused. Please resume it to perform export operations."
                   response)))))

      (testing "error handling for export failure"
        (let [mock-main (test-helpers/create-mock-source :fail-mode :write-files-error)]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-main)]
              (let [response (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {})
                    task (wait-for-task-completion (:task_id response))]
                (is (remote-sync.task/failed? task)))))))

      (testing "If a task already exists we get an error"
        (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "foo"}]
          (let [mock-source (test-helpers/create-mock-source)]
            (mt/with-temporary-setting-values [remote-sync-enabled true
                                               remote-sync-url "https://github.com/test/repo.git"
                                               remote-sync-token "test-token"
                                               remote-sync-branch "main"]
              (with-redefs [source/source-from-settings (constantly mock-source)]
                (is (= "Remote sync in progress"
                       (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {}))))))))))

  (deftest get-current-sync-status-works
    (testing "Works when there are no tasks at all"
      (is (nil? (mt/user-http-request :crowberto :get 204 "ee/remote-sync/current-task"))))
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "export"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (testing "Returns the current task if one exists"
        (is (=? {:id integer?
                 :started_at some?
                 :ended_at nil?} (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task"))))
      (testing "After task completion, it's still the current task"
        (remote-sync.task/complete-sync-task! id)
        (is (=? {:id integer?
                 :started_at some?
                 :ended_at some?}
                (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task")))))
    (mt/with-temp [:model/RemoteSyncTask {id :id} {:sync_task_type "export"
                                                   :last_progress_report_at :%now
                                                   :started_at :%now}]
      (testing "Returns the current task if one exists"
        (is (=? {:id integer?
                 :started_at some?
                 :ended_at nil?} (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task"))))
      (testing "After task errors, returns nothing again"
        (remote-sync.task/fail-sync-task! id "Some error")
        (is (=? {:error_message "Some error"}
                (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task")))))))

(deftest global-is-dirty-endpoint-test
  (test-helpers/with-clean-object
    (testing "GET /api/ee/remote-sync/is-dirty"

      (testing "returns false when no remote-synced collections have changes"
        (mt/with-temp [:model/Collection _ {:name "Remote Collection"
                                            :type "remote-synced"
                                            :entity_id "test-collection-1"
                                            :location "/"}]
          ;; No changes exist
          (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/is-dirty")]
            (is (= {:is_dirty false} response)))))

      (testing "returns true when any remote-synced collection has changes"
        (mt/with-temp [:model/Collection remote-col {:name "Remote Collection"
                                                     :type "remote-synced"
                                                     :entity_id "test-collection-1"
                                                     :location "/"}
                       :model/Card card {:collection_id (:id remote-col)
                                         :name "Test Card"}
                       :model/RemoteSyncObject _ {:model_type "Card"
                                                  :model_id (:id card)
                                                  :status "pending"
                                                  :status_changed_at (java.time.OffsetDateTime/now)}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/is-dirty")]
            (is (= {:is_dirty true} response)))))

      (testing "requires superuser permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/remote-sync/is-dirty")))))))

(deftest global-dirty-endpoint-test
  (test-helpers/with-clean-object
    (testing "GET /api/ee/remote-sync/dirty"

      (testing "returns empty list when no remote-synced collections have dirty models"
        (mt/with-temp [:model/Collection _ {:name "Remote Collection"
                                            :type "remote-synced"
                                            :entity_id "test-collection-1"
                                            :location "/"}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")]
            (is (= {:dirty []} response)))))

      (testing "returns all dirty models across remote-synced collections"
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
                       :model/RemoteSyncObject _ {:model_type "Card"
                                                  :model_id (:id card1)
                                                  :status "pending"
                                                  :status_changed_at (java.time.OffsetDateTime/now)}
                       :model/RemoteSyncObject _ {:model_type "Card"
                                                  :model_id (:id card2)
                                                  :status "pending"
                                                  :status_changed_at (java.time.OffsetDateTime/now)}
                       :model/RemoteSyncObject _ {:model_type "Dashboard"
                                                  :model_id (:id dashboard)
                                                  :status "pending"
                                                  :status_changed_at (java.time.OffsetDateTime/now)}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
                dirty-items (:dirty response)]
            (is (= 3 (count dirty-items)))
            (is (= #{"Card 1" "Card 2" "Dashboard 1"}
                   (set (map :name dirty-items))))
            (is (= #{"card" "dashboard"}
                   (set (map :model dirty-items)))))))

      (testing "returns dirty models from nested collections"
        (mt/with-temp [:model/Collection remote-col {:name "Remote Collection"
                                                     :type "remote-synced"
                                                     :entity_id "test-collection-1"
                                                     :location "/"}
                       :model/Collection nested-col {:name "Nested Collection"
                                                     :type "remote-synced"
                                                     :location (str "/" (:id remote-col) "/")}
                       :model/Card nested-card {:collection_id (:id nested-col)
                                                :name "Nested Card"}
                       :model/RemoteSyncObject _ {:model_type "Card"
                                                  :model_id (:id nested-card)
                                                  :status "pending"
                                                  :status_changed_at (java.time.OffsetDateTime/now)}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
                dirty-items (:dirty response)]
            (is (= 1 (count dirty-items)))
            (is (= "Nested Card" (:name (first dirty-items)))))))

      (testing "deduplicates items with distinct-by"
        ;; The API uses distinct-by to handle potential duplicates
        (mt/with-temp [:model/Collection remote-col {:name "Remote Collection"
                                                     :type "remote-synced"
                                                     :entity_id "test-collection-1"
                                                     :location "/"}
                       :model/Card card {:collection_id (:id remote-col)
                                         :name "Test Card"}
                       ;; Create a remote sync object entry for the card
                       :model/RemoteSyncObject _ {:model_type "Card"
                                                  :model_id (:id card)
                                                  :status "pending"
                                                  :status_changed_at (java.time.OffsetDateTime/now)}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")
                dirty-items (:dirty response)]
            ;; Should only return one item
            (is (= 1 (count dirty-items)))
            (is (= "Test Card" (:name (first dirty-items)))))))

      (testing "requires superuser permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/remote-sync/dirty")))))))

(deftest settings-endpoint-test
  (testing "PUT /api/ee/remote-sync/settings"

    (let [mock-main (test-helpers/create-mock-source)]
      (with-redefs [settings/check-git-settings (constantly nil)
                    source/source-from-settings (constantly mock-main)]
        (testing "successful settings update"
          (mt/with-temporary-setting-values [remote-sync-enabled false
                                             remote-sync-type :development]

            (let [{:as resp :keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                                   {:remote-sync-enabled true
                                                                    :remote-sync-url "https://github.com/test/repo.git"
                                                                    :remote-sync-branch "main"})
                  task (wait-for-task-completion task_id)]
              (is (=? {:success true} resp))
              (is (remote-sync.task/successful? task)))))

        (testing "successful settings update with import triggers import"

          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-type :production
                                             remote-sync-branch "main"
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"]

            (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                 {:remote-sync-enabled true
                                                  :remote-sync-type :production})
                  task (wait-for-task-completion (:task_id response))]
              (is (=? {:success true} response))
              (is (remote-sync.task/successful? task))))))

      (testing "requires superuser permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/remote-sync/settings" {}))))

      (testing "error handling for invalid settings"
        (let [response (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                             {:remote-sync-url "invalid-url"})]
          (is (= "Unable to connect to git repository with the provided settings" (:error response))))))))
