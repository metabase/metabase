(ns metabase-enterprise.remote-sync.impl-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each (fn [f] (mt/with-model-cleanup [:model/RemoteSyncChangeLog] (f))))

;; import! tests

(deftest import!-with-no-source-configured-test
  (testing "import! with no source configured"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}]
      (let [result (impl/import! nil task-id "test-branch")]
        (is (= :error (:status result)))
        (is (re-find #"Remote sync source is not enabled" (:message result)))))))

(deftest import!-successful-with-specific-collections-test
  (testing "import! successful with specific collections"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}
                   :model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
                   :model/Card {_card-id :id} {:name "Test Card" :collection_id coll-id :entity_id "test-card-1xxxxxxxxxx"}]
      (let [mock-source (test-helpers/create-mock-source)]
        (let [result (impl/import! mock-source task-id "test-branch" ["test-collection-1xxxx"])]
          (is (= :success (:status result)))
          (is (= "Successfully reloaded from git repository" (:message result))))))))

(deftest import!-successful-without-collections-test
  (testing "import! successful without collections (imports all remote-synced)"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}
                   :model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [result (impl/import! (test-helpers/create-mock-source) task-id "test-branch")]
        (is (= :success (:status result)))))))

(deftest import!-with-branch-parameter-test
  (testing "import! with branch parameter uses provided branch"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}]
      (let [custom-files {"custom-branch" {"collections/custom-collection.yaml"
                                           (test-helpers/generate-collection-yaml "custom-collection-idx" "Custom Collection")}}]
        (let [result (impl/import! (test-helpers/create-mock-source :initial-files custom-files) task-id "custom-branch")]
          (is (= :success (:status result))))))))

(deftest import!-falls-back-to-settings-branch-test
  (testing "import! falls back to settings branch when no branch provided"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}]
      (let [result (impl/import! (test-helpers/create-mock-source) task-id nil)]
        (is (= :success (:status result)))))))

(deftest import!-handles-network-errors-test
  (testing "import! handles network errors"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}]
      (let [result (impl/import! (test-helpers/create-mock-source :fail-mode :network-error)
                                 task-id
                                 "main"
                                 ["collection-1"])]
        (is (= :error (:status result)))
        (is (re-find #"Network error" (:message result)))))))

(deftest import!-handles-authentication-errors-test
  (testing "import! handles authentication errors"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}]
      (let [result (impl/import! (test-helpers/create-mock-source :fail-mode :auth-error) task-id "main")]
        (is (= :error (:status result)))
        (is (re-find #"Authentication failed" (:message result)))))))

(deftest import!-handles-repository-not-found-errors-test
  (testing "import! handles repository not found errors"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}]
      (let [result (impl/import! (test-helpers/create-mock-source :fail-mode :repo-not-found)
                                 task-id "main")]
        (is (= :error (:status result)))
        (is (re-find #"Repository not found" (:message result)))))))

(deftest import!-handles-branch-errors-test
  (testing "import! handles branch errors"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}]
      (let [result (impl/import! (test-helpers/create-mock-source :fail-mode :branch-error) task-id "nonexistent-branch")]
        (is (= :error (:status result)))
        (is (re-find #"Branch error:" (:message result)))))))

(deftest import!-handles-generic-errors-test
  (testing "import! handles generic errors"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}]
      (let [result (impl/import! (test-helpers/create-mock-source :fail-mode :list-files-error) task-id "main")]
        (is (= :error (:status result)))
        (is (re-find #"Failed to reload from git repository" (:message result)))))))

;; export! tests

(deftest export!-with-no-source-configured-test
  (testing "export! with no source configured"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export" :initiated_by (:id user)}]
      (let [result (impl/export! nil task-id "test-branch" "Test commit")]
        (is (= :error (:status result)))
        (is (re-find #"Remote sync source is not enabled" (:message result)))))))

(deftest export!-successful-with-specific-collections-test
  (testing "export! successful with specific collections"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export" :initiated_by (:id user)}
                   :model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (test-helpers/create-mock-source)]
        (let [result (impl/export! mock-source task-id "test-branch" "Test commit message" ["test-collection-1xxxx"])]
          (is (= :success (:status result))))))))

(deftest export!-successful-with-default-collections-test
  (testing "export! successful with default collections"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export" :initiated_by (:id user)}
                   :model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (test-helpers/create-mock-source)]
        (let [result (impl/export! mock-source task-id "test-branch" "Test commit message")]
          (is (= :success (:status result))))))))

(deftest export!-handles-extraction-failure-test
  (testing "export! handles extraction failure"
    ;; This test simulates when the serialization extraction fails
    ;; We can trigger this by having no valid collections to export
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export" :initiated_by (:id user)}]
      (let [mock-source (test-helpers/create-mock-source)]
        ;; Try to export a non-existent collection
        (let [result (impl/export! mock-source task-id "test-branch" "Test commit message" ["nonexistentcollection"])]
          ;; The export should still succeed but with no entities to export
          (is (= :success (:status result))))))))

(deftest export!-handles-store-failure-test
  (testing "export! handles store failure"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export" :initiated_by (:id user)}
                   :model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (test-helpers/create-mock-source :fail-mode :store-error)]
        (let [result (impl/export! mock-source task-id "test-branch" "Test commit message" ["test-collection-1xxxx"])]
          (is (= :error (:status result)))
          (is (re-find #"Failed to export to git repository" (:message result))))))))

(deftest export!-handles-network-errors-during-write-test
  (testing "export! handles network errors during write"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export" :initiated_by (:id user)}
                   :model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (test-helpers/create-mock-source :fail-mode :network-error)]
        (let [result (impl/export! mock-source task-id "test-branch" "Test commit message" ["test-collection-1xxxx"])]
          (is (= :error (:status result)))
          (is (re-find #"Failed to export to git repository" (:message result))))))))

;; Integration tests

(deftest complete-import-export-workflow-test
  (testing "complete import-export workflow"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
                   :model/Card {card-id :id} {:name "Test Card" :collection_id coll-id :entity_id "test-card-1xxxxxxxxxx"}]
      (let [mock-source (test-helpers/create-mock-source)]
        ;; First export - verify it succeeds and files are written to the mock source
        (let [export-task (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (:id (first (t2/select :model/User)))})
              export-result (impl/export! mock-source (:id export-task) "test-branch" "Test export" ["test-collection-1xxxx"])]
          (is (= :success (:status export-result)))

            ;; Verify files were written to the mock source atom
          (let [files-after-export (get @(:files-atom mock-source) "test-branch")]
            (is (map? files-after-export))
            (is (not-empty files-after-export))
              ;; Should have at least collection and card files
            (is (some #(str/includes? % "collection") (keys files-after-export)))
            (is (some #(str/includes? % "card") (keys files-after-export)))))

        ;; Then import - verify it succeeds and processes the exported files
        (let [import-task (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (:id (first (t2/select :model/User)))})
              import-result (impl/import! mock-source (:id import-task) "test-branch" ["test-collection-1xxxx"])]
          (is (= :success (:status import-result)))
          (is (= "Successfully reloaded from git repository" (:message import-result)))

          ;; Verify the entities still exist after import
          (is (t2/exists? :model/Collection :id coll-id))
          (is (t2/exists? :model/Card :id card-id))

          ;; Verify the collection and card still have the correct attributes
          (let [collection (t2/select-one :model/Collection :id coll-id)
                card (t2/select-one :model/Card :id card-id)]
            (is (= "Test Collection" (:name collection)))
            (is (= "remote-synced" (:type collection)))
            (is (= "test-collection-1xxxx" (:entity_id collection)))
            (is (= "Test Card" (:name card)))
            (is (= "test-card-1xxxxxxxxxx" (:entity_id card)))
            (is (= coll-id (:collection_id card)))))))))

(deftest collection-cleanup-during-import-test
  (testing "collection cleanup during import (tests clean-synced! private function)"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :type "remote-synced" :entity_id "test-collection-2xxxx" :location "/"}
                   :model/Card {card1-id :id} {:name "Card 1" :collection_id coll1-id :entity_id "test-card-1xxxxxxxxxx"}
                   :model/Card {card2-id :id} {:name "Card 2" :collection_id coll2-id :entity_id "test-card-2xxxxxxxxxx"}]
      (let [test-files {"test-branch" {"collections/test-collection-1.yaml"
                                       (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection 1")
                                       "cards/test-card-1.yaml"
                                       (test-helpers/generate-card-yaml "test-card-1xxxxxxxxxx" "Test Card 1" "test-collection-1xxxx")}}
            mock-source (test-helpers/create-mock-source :initial-files test-files)]
        ;; Import only collection 1 - this exercises the cleanup logic for collection 2
        (let [import-task (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (:id (first (t2/select :model/User)))})
              result (impl/import! mock-source (:id import-task) "test-branch")]
          (is (= :success (:status result)))

        ;; Verify the entities still exist (real cleanup would require more complex setup)
          (is (t2/exists? :model/Card :id card1-id))
          (is (not (t2/exists? :model/Collection :id coll2-id)))
          (is (not (t2/exists? :model/Card :id card2-id))))))))

(deftest error-handling-propagation-through-private-functions-test
  (testing "error handling propagation through private functions"
    (let [mock-source (test-helpers/create-mock-source :fail-mode :network-error)]
      (let [import-task (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (:id (first (t2/select :model/User)))})
            result (impl/import! mock-source (:id import-task) "test-branch" ["test-collection"])]
        (is (= :error (:status result)))
        (is (re-find #"Network error" (:message result)))))))

(deftest import!-calls-update-progress-with-expected-values-test
  (testing "import! calls update-progress! with expected progress values"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "import" :initiated_by (:id user)}
                   :model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (test-helpers/create-mock-source)
            progress-calls (atom [])]
        (with-redefs [remote-sync.task/update-progress!
                      (fn [task-id progress]
                        (swap! progress-calls conj {:task-id task-id :progress progress}))]
          (let [result (impl/import! mock-source task-id "test-branch")]
            (is (= :success (:status result)))
            ;; Verify progress was called with expected values
            (is (= 3 (count @progress-calls)))
            (is (= task-id (:task-id (first @progress-calls))))
            (is (= task-id (:task-id (second @progress-calls))))
            (is (= task-id (:task-id (nth @progress-calls 2))))
            ;; Check progress values are in expected sequence
            (is (= 0.7 (:progress (first @progress-calls))))
            (is (= 0.8 (:progress (second @progress-calls))))
            (is (= 0.9 (:progress (nth @progress-calls 2))))))))))

(deftest export!-calls-update-progress-with-expected-values-test
  (testing "export! calls update-progress! with expected progress values"
    (mt/with-temp [:model/User user {:first_name "Test" :last_name "User" :email "test@example.com"}
                   :model/RemoteSyncTask {task-id :id} {:sync_task_type "export" :initiated_by (:id user)}
                   :model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
      (let [mock-source (test-helpers/create-mock-source)
            progress-calls (atom [])]
        (with-redefs [remote-sync.task/update-progress!
                      (fn [task-id progress]
                        (swap! progress-calls conj {:task-id task-id :progress progress}))]
          (let [result (impl/export! mock-source task-id "test-branch" "Test commit" ["test-collection-1xxxx"])]
            (is (= :success (:status result)))
            ;; Verify progress was called with expected values
            (is (= 1 (count @progress-calls)))
            (is (= task-id (:task-id (first @progress-calls))))
            ;; Check progress value is expected
            (is (= 0.8 (:progress (first @progress-calls))))))))))
