(ns metabase-enterprise.remote-sync.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-change-log :as change-log]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(defn mock-git-source
  "Create a mock git source for testing"
  [& {:keys [branches error-on-branches?]
      :or {branches ["main" "develop"]}}]
  (reify source.p/LibrarySource
    (branches [_]
      (if error-on-branches?
        (throw (Exception. "Repository not found"))
        branches))
    (list-files [_ _] [])
    (read-file [_ _ _] "")
    (write-files! [_ _ _ _] nil)))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each (fn [f] (mt/with-model-cleanup [:model/RemoteSyncChangeLog] (f))))

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

(deftest import-endpoint-test
  (testing "POST /api/ee/remote-sync/import"

    (testing "successful import with default branch"
      (let [mock-source (test-helpers/create-mock-source)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (with-redefs [source/source-from-settings (constantly mock-source)]
            (is (= "Success"
                   (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {})))))))

    (testing "successful import with specific branch"
      (let [mock-source (test-helpers/create-mock-source)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (with-redefs [source/source-from-settings (constantly mock-source)]
            (is (= "Success"
                   (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import" {:branch "feature-branch"})))))))

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
      (let [mock-source (test-helpers/create-mock-source :fail-mode :network-error)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (with-redefs [source/source-from-settings (constantly mock-source)]
            (let [response (mt/user-http-request :crowberto :post 400 "ee/remote-sync/import" {})]
              (is (contains? response :status))
              (is (= "error" (:status response)))
              (is (contains? response :message)))))))))

(deftest export-endpoint-test
  (testing "POST /api/ee/remote-sync/export"

    (testing "successful export with default settings"
      (let [mock-source (test-helpers/create-mock-source)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (with-redefs [source/source-from-settings (constantly mock-source)]
            (is (= "Success"
                   (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export" {})))))))

    (testing "successful export with custom branch and message"
      (let [mock-source (test-helpers/create-mock-source)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (with-redefs [source/source-from-settings (constantly mock-source)]
            (is (= "Success"
                   (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                         {:branch "feature-branch" :message "Custom export message"})))))))

    (testing "successful export with specific collection"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                      :type "remote-synced"
                                                      :entity_id "test-collection-1xxxx"
                                                      :location "/"}]
        (let [mock-source (test-helpers/create-mock-source)]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"
                                             remote-sync-branch "main"]
            (with-redefs [source/source-from-settings (constantly mock-source)]
              (is (= "Success"
                     (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                           {:collection_id coll-id}))))))))

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
      (let [mock-source (test-helpers/create-mock-source :fail-mode :write-files-error)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (with-redefs [source/source-from-settings (constantly mock-source)]
            (let [response (mt/user-http-request :crowberto :post 400 "ee/remote-sync/export" {})]
              (is (contains? response :status))
              (is (= "error" (:status response)))
              (is (contains? response :message)))))))))

(deftest is-dirty-endpoint-test
  (testing "GET /api/ee/remote-sync/:collection-id/is-dirty"

    (testing "returns false when collection is not dirty"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                      :type "remote-synced"
                                                      :entity_id "test-collection-1xxxx"
                                                      :location "/"}]
        (with-redefs [change-log/dirty-collection? (constantly false)]
          (let [response (mt/user-http-request :crowberto :get 200 (format "ee/remote-sync/%d/is-dirty" coll-id))]
            (is (= {:is_dirty false} response))))))

    (testing "returns true when collection is dirty"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                      :type "remote-synced"
                                                      :entity_id "test-collection-1xxxx"
                                                      :location "/"}]
        (with-redefs [change-log/dirty-collection? (constantly true)]
          (let [response (mt/user-http-request :crowberto :get 200 (format "ee/remote-sync/%d/is-dirty" coll-id))]
            (is (= {:is_dirty true} response))))))

    (testing "requires superuser permissions"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                      :type "remote-synced"
                                                      :entity_id "test-collection-1xxxx"
                                                      :location "/"}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (format "ee/remote-sync/%d/is-dirty" coll-id))))))))

(deftest dirty-endpoint-test
  (testing "GET /api/ee/remote-sync/:collection-id/dirty"

    (testing "returns empty list when no dirty models"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                      :type "remote-synced"
                                                      :entity_id "test-collection-1xxxx"
                                                      :location "/"}]
        (with-redefs [change-log/dirty-for-collection (constantly [])]
          (let [response (mt/user-http-request :crowberto :get 200 (format "ee/remote-sync/%d/dirty" coll-id))]
            (is (= {:dirty []} response))))))

    (testing "returns dirty models when they exist"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                      :type "remote-synced"
                                                      :entity_id "test-collection-1xxxx"
                                                      :location "/"}]
        (let [dirty-models [{:id 1 :model "Collection"} {:id 2 :model "Card"}]]
          (with-redefs [change-log/dirty-for-collection (constantly dirty-models)]
            (let [response (mt/user-http-request :crowberto :get 200 (format "ee/remote-sync/%d/dirty" coll-id))]
              (is (= {:dirty dirty-models} response)))))))

    (testing "requires superuser permissions"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                      :type "remote-synced"
                                                      :entity_id "test-collection-1xxxx"
                                                      :location "/"}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (format "ee/remote-sync/%d/dirty" coll-id))))))))

(deftest settings-endpoint-test
  (testing "PUT /api/ee/remote-sync/settings"

    (let [mock-source (test-helpers/create-mock-source)]
      (with-redefs [settings/check-git-settings (constantly nil)
                    source/source-from-settings (constantly mock-source)]
        (testing "successful settings update"
          (mt/with-temporary-setting-values [remote-sync-enabled false
                                             remote-sync-type "export"]

            (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                 {:remote-sync-enabled true
                                                  :remote-sync-url "https://github.com/test/repo.git"
                                                  :remote-sync-branch "main"})]
              (is (= {:success true} response)))))

        (testing "successful settings update with import triggers import"

          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-type "import"
                                             remote-sync-branch "main"
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-token "test-token"]

            (let [response (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                                 {:remote-sync-enabled true
                                                  :remote-sync-type "import"})]
              (is (= {:success true} response))))))

      (testing "requires superuser permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/remote-sync/settings" {}))))

      (testing "error handling for invalid settings"
        (let [response (mt/user-http-request :crowberto :put 400 "ee/remote-sync/settings"
                                             {:remote-sync-url "invalid-url"})]
          (is (= "Failed to clone git repository: Invalid remote: origin" (:error response))))))))
