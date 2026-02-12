(ns metabase-enterprise.remote-sync.impl-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.app-db.core :as app-db]
   [metabase.collections.models.collection :as collection]
   [metabase.search.core :as search]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;; `reindex!` below is ok in a parallel test since it's not actually executing anything
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each (fn [f]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
                        (test-helpers/clean-remote-sync-state f))))

;; import! tests

(deftest import!-with-no-source-configured-test
  (testing "import! with no snapshot configured"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! nil task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Remote sync source is not enabled" (:message result))))))

(deftest import!-successful-without-collections-test
  (testing "import! successful without collections (imports all remote-synced)"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}]
        (let [result (impl/import! (source.p/snapshot (test-helpers/create-mock-source)) task-id)]
          (is (= :success (:status result))))))))

(deftest import!-with-branch-parameter-test
  (testing "import! with branch parameter uses provided branch"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          custom-files {"custom-branch" {"collections/custom-collection.yaml"
                                         (test-helpers/generate-collection-yaml "custom-collection-idx" "Custom Collection")}}
          result (impl/import! (source.p/snapshot (test-helpers/create-mock-source :initial-files custom-files)) task-id)]
      (is (= :success (:status result))))))

(deftest import!-handles-network-errors-test
  (testing "import! handles network errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (source.p/snapshot (test-helpers/create-mock-source :fail-mode :network-error))
                               task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Network error" (:message result))))))

(deftest import!-handles-authentication-errors-test
  (testing "import! handles authentication errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (source.p/snapshot (test-helpers/create-mock-source :fail-mode :auth-error)) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Authentication failed" (:message result))))))

(deftest import!-handles-repository-not-found-errors-test
  (testing "import! handles repository not found errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (source.p/snapshot (test-helpers/create-mock-source :fail-mode :repo-not-found)) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Repository not found" (:message result))))))

(deftest import!-handles-branch-errors-test
  (testing "import! handles branch errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (source.p/snapshot (test-helpers/create-mock-source :fail-mode :branch-error)) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Branch error:" (:message result))))))

(deftest import!-handles-generic-errors-test
  (testing "import! handles generic errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (source.p/snapshot (test-helpers/create-mock-source :fail-mode :list-files-error)) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Failed to reload from git repository" (:message result))))))

;; We need to make sure the task-id we use to track the Remote Sync is not bound to a transactions because of the behavior of
;; update-sync-progress. So the follow two tests cannot use with-temp to create models
(deftest import!-skips-when-version-matches-without-force-test
  (testing "import! skips import when source version matches last imported version and force? is false"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [mock-source (test-helpers/create-mock-source)
            source-version (source.p/version (source.p/snapshot mock-source))
            task-defaults (mt/with-temp-defaults :model/RemoteSyncTask)]
        (t2/insert! :model/RemoteSyncTask (merge task-defaults
                                                 {:sync_task_type "import"
                                                  :initiated_by (mt/user->id :rasta)
                                                  :ended_at :%now
                                                  :version source-version}))
        (let [task-id-2 (t2/insert-returning-pk! :model/RemoteSyncTask (merge task-defaults
                                                                              {:sync_task_type "import"
                                                                               :initiated_by (mt/user->id :rasta)}))
              result (impl/import! (source.p/snapshot mock-source) task-id-2 :force? false)]
          (is (= :success (:status result)))
          (is (= source-version (:version result)))
          (is (re-find #"Skipping import.*matches last imported version" (:message result))))))))

(deftest import!-proceeds-when-version-matches-with-force-test
  (testing "import! proceeds with import when source version matches last imported version but force? is true"
    (mt/with-model-cleanup [:model/Collection :model/RemoteSyncTask]
      (let [mock-source (test-helpers/create-mock-source)
            source-version (source.p/version (source.p/snapshot mock-source))
            coll-defaults (mt/with-temp-defaults :model/Collection)
            task-defaults (mt/with-temp-defaults :model/RemoteSyncTask)]
        (t2/insert! :model/Collection (merge coll-defaults
                                             {:name "Test Collection"
                                              :is_remote_synced true
                                              :entity_id "test-collection-1xxxx"
                                              :location "/"}))
        (t2/insert! :model/RemoteSyncTask (merge task-defaults
                                                 {:sync_task_type "import"
                                                  :initiated_by (mt/user->id :rasta)
                                                  :ended_at :%now
                                                  :version source-version}))
        (let [task-id-2 (t2/insert-returning-pk! :model/RemoteSyncTask (merge task-defaults
                                                                              {:sync_task_type "import"
                                                                               :initiated_by (mt/user->id :rasta)}))
              result (impl/import! (source.p/snapshot mock-source) task-id-2 :force? true)]
          (is (= :success (:status result)))
          (is (= source-version (:version result)))
          (is (= "Successfully reloaded from git repository" (:message result))))))))

;; export! tests

(deftest export!-with-no-source-configured-test
  (testing "export! with no source configured"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})
            result (impl/export! nil task-id "Test commit")]
        (is (= :error (:status result)))
        (is (re-find #"Remote sync source is not enabled" (:message result)))))))

(deftest export!-with-no-remote-synced-collections-test
  (testing "export! errors when there are no remote-synced collections"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Regular Collection" :type nil :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-transforms false]
            (let [mock-source (test-helpers/create-mock-source)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :error (:status result)))
              (is (= "No remote-syncable content available." (:message result))))))))))

(deftest export!-successful-with-default-collections-test
  (testing "export! successful with default collections"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}]
          (let [mock-source (test-helpers/create-mock-source)
                result (impl/export! (source.p/snapshot mock-source) task-id "Test commit message")]
            (is (= :success (:status result)))))))))

(deftest export!-handles-store-failure-test
  (testing "export! handles store failure"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}]
          (let [mock-source (test-helpers/create-mock-source :fail-mode :store-error)
                result (impl/export! (source.p/snapshot mock-source) task-id "Test commit message")]
            (is (= :error (:status result)))
            (is (re-find #"Failed to export to git repository" (:message result)))))))))

(deftest export!-handles-network-errors-during-write-test
  (testing "export! handles network errors during write"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}]
          (let [mock-source (test-helpers/create-mock-source :fail-mode :network-error)
                result (impl/export! (source.p/snapshot mock-source) task-id "Test commit message")]
            (is (= :error (:status result)))
            (is (re-find #"Failed to export to git repository" (:message result)))))))))

;; Integration tests

(deftest complete-import-export-workflow-test
  (testing "complete import-export workflow"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}
                     :model/Card {card-id :id} {:name "Test Card" :collection_id coll-id :entity_id "test-card-1xxxxxxxxxx"}]
        (let [mock-main (test-helpers/create-mock-source :branch "test-branch")
              export-task (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})
              export-result (impl/export! (source.p/snapshot mock-main) (:id export-task) "Test export")]
          (remote-sync.task/complete-sync-task! (:id export-task))
          (is (= :success (:status export-result)))

          (let [files-after-export (get @(:files-atom mock-main) "test-branch")]
            (is (map? files-after-export))
            (is (not-empty files-after-export))
            (is (some #(str/includes? % "collection") (keys files-after-export)))
            (is (some #(str/includes? % "card") (keys files-after-export))))

          (t2/delete! :model/RemoteSyncTask :id (:id export-task))
          (let [import-task (t2/with-connection [_conn (app-db/app-db) (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})])
                import-result (impl/import! (source.p/snapshot mock-main) (:id import-task))]
            (remote-sync.task/complete-sync-task! (:id import-task))
            (is (= :success (:status import-result)))
            (is (= "Successfully reloaded from git repository" (:message import-result)))

            (is (t2/exists? :model/Collection :id coll-id))
            (is (t2/exists? :model/Card :id card-id))

            (let [collection (t2/select-one :model/Collection :id coll-id)
                  card (t2/select-one :model/Card :id card-id)]
              (is (= "Test Collection" (:name collection)))
              (is (true? (:is_remote_synced collection)))
              (is (= "test-collection-1xxxx" (:entity_id collection)))
              (is (= "Test Card" (:name card)))
              (is (= "test-card-1xxxxxxxxxx" (:entity_id card)))
              (is (= coll-id (:collection_id card))))))))))

(deftest collection-cleanup-during-import-test
  (testing "collection cleanup during import (tests clean-synced! private function)"
    (let [import-task (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}
                     :model/Collection {coll2-id :id} {:name "Collection 2" :is_remote_synced true :entity_id "test-collection-2xxxx" :location "/"}
                     :model/Card {card1-id :id} {:name "Card 1" :collection_id coll1-id :entity_id "test-card-1xxxxxxxxxx"}
                     :model/Card {card2-id :id} {:name "Card 2" :collection_id coll2-id :entity_id "test-card-2xxxxxxxxxx"}]
        (let [test-files {"test-branch" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                         (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection 1")
                                         "collections/test-collection-1xxxx-_/cards/test-card-1.yaml"
                                         (test-helpers/generate-card-yaml "test-card-1xxxxxxxxxx" "Test Card 1" "test-collection-1xxxx")}}
              mock-main (test-helpers/create-mock-source :initial-files test-files :branch "test-branch")
              result (impl/import! (source.p/snapshot mock-main) (:id import-task))]
          (is (= :success (:status result)))

          (is (t2/exists? :model/Card :id card1-id))
          (is (not (t2/exists? :model/Collection :id coll2-id)))
          (is (not (t2/exists? :model/Card :id card2-id))))))))

(deftest error-handling-propagation-through-private-functions-test
  (testing "error handling propagation through private functions"
    (let [mock-source (test-helpers/create-mock-source :fail-mode :network-error)
          task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (source.p/snapshot mock-source) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Network error" (:message result))))))

(deftest import!-calls-update-progress-with-expected-values-test
  (testing "import! calls update-progress! with expected progress values"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}]
        (let [mock-source (test-helpers/create-mock-source)
              progress-calls (atom [])]
          (with-redefs [remote-sync.task/update-progress!
                        (fn [task-id progress]
                          (swap! progress-calls conj {:task-id task-id :progress progress}))]
            (let [result (impl/import! (source.p/snapshot mock-source) task-id)]
              (is (= :success (:status result)))
              (is (= 5 (count @progress-calls)))
              (is (= task-id (:task-id (first @progress-calls))))
              (is (= task-id (:task-id (second @progress-calls))))
              (is (= task-id (:task-id (nth @progress-calls 2))))
              (is (= 0.7 (:progress (nth @progress-calls 2))))
              (is (= 0.8 (:progress (nth @progress-calls 3))))
              (is (= 0.95 (:progress (nth @progress-calls 4)))))))))))

(deftest export!-calls-update-progress-with-expected-values-test
  (testing "export! calls update-progress! with expected progress values"
    (mt/dataset test-data
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}
                         :model/Collection _ {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-2xxxx" :location "/"}
                         :model/Card _ {:collection_id coll-id}]
            (let [mock-source (test-helpers/create-mock-source)
                  progress-calls (atom [])]
              (with-redefs [remote-sync.task/update-progress!
                            (fn [task-id progress]
                              (swap! progress-calls conj {:task-id task-id :progress progress}))]
                (let [result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
                  (is (= :success (:status result)))
                  (is (pos? (count @progress-calls)))
                  (is (= task-id (:task-id (first @progress-calls))))
                  (is (= 0.3 (:progress (first @progress-calls)))))))))))))

(deftest import!-resets-remote-sync-object-table-test
  (testing "import! deletes and recreates RemoteSyncObject table with synced status"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}
                       :model/Card {card-id :id} {:name "Test Card" :collection_id coll-id :entity_id "test-card-1xxxxxxxxxx"}]
          (t2/insert! :model/RemoteSyncObject
                      [{:model_type "Collection" :model_id coll-id :model_name "Test Collection" :status "created" :status_changed_at (t/offset-date-time)}
                       {:model_type "Card" :model_id card-id :model_name "Test Card" :status "updated" :status_changed_at (t/offset-date-time)}
                       {:model_type "Card" :model_id 999 :model_name "Test Card2" :status "deleted" :status_changed_at (t/offset-date-time)}])
          (is (= 3 (t2/count :model/RemoteSyncObject)))
          (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "collections/test-collection-1xxxx-_/cards/test-card-1.yaml"
                                    (test-helpers/generate-card-yaml "test-card-1xxxxxxxxxx" "Test Card" "test-collection-1xxxx")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result)))
            (let [entries (t2/select :model/RemoteSyncObject)]
              (is (= 2 (count entries)))
              (is (every? #(= "synced" (:status %)) entries))
              (is (some #(and (= "Collection" (:model_type %))
                              (= coll-id (:model_id %))) entries))
              (is (some #(and (= "Card" (:model_type %))
                              (= card-id (:model_id %))) entries))
              (is (not (some #(= 999 (:model_id %)) entries))))))))))

(deftest export!-updates-all-statuses-to-synced-test
  (testing "export! updates all RemoteSyncObject entries to synced status"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}
                         :model/Card {card-id :id} {:name "Test Card" :collection_id coll-id :entity_id "test-card-1xxxxxxxxxx"}
                         :model/Dashboard {dash-id :id} {:name "Test Dashboard" :collection_id coll-id :entity_id "test-dashboard-1xxxxx"}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Test Collection" :status "updated" :status_changed_at (t/offset-date-time)}
                         {:model_type "Card" :model_id card-id :model_name "Test Card" :status "created" :status_changed_at (t/offset-date-time)}
                         {:model_type "Dashboard" :model_id dash-id :model_name "Test Dashboard" :status "removed" :status_changed_at (t/offset-date-time)}])
            (is (= "updated" (:status (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))))
            (is (= "created" (:status (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id card-id))))
            (is (= "removed" (:status (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id dash-id))))
            (let [mock-source (test-helpers/create-mock-source)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit message")]
              (is (= :success (:status result)))
              (let [entries (t2/select :model/RemoteSyncObject)]
                (is (= 3 (count entries)))
                (is (every? #(= "synced" (:status %)) entries))
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))))
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id card-id))))
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id dash-id))))))))))))

(deftest export!-deletes-files-for-removed-top-level-collections-test
  (testing "export! deletes files from git source for collections with location '/' that have been removed"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Collection {active-coll-id :id} {:name "Active Collection"
                                                                 :is_remote_synced true
                                                                 :entity_id "active-collection-xxx"
                                                                 :location "/"}
                         :model/Card _ {:name "Active Card"
                                        :collection_id active-coll-id
                                        :entity_id "active-card-xxxxxxxxx"}
                         :model/Collection {removed-coll-id :id} {:name "Removed Collection"
                                                                  :is_remote_synced false
                                                                  :entity_id "removed-collection-xx"
                                                                  :location "/"}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id active-coll-id :model_name "Active Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Collection" :model_id removed-coll-id :model_name "Removed Collection" :status "removed" :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {"collections/active-collection-xxx_active_collection/active-collection-xxx.yaml"
                                         (test-helpers/generate-collection-yaml "active-collection-xxx" "Active Collection")
                                         "collections/active-collection-xxx_active_collection/cards/active-card.yaml"
                                         (test-helpers/generate-card-yaml "active-card-xxxxxxxxx" "Active Card" "active-collection-xxx")
                                         "collections/removed-collection-xx_removed_collection/removed-collection-xx.yaml"
                                         (test-helpers/generate-collection-yaml "removed-collection-xx" "Removed Collection")
                                         "collections/removed-collection-xx_removed_collection/cards/removed-card.yaml"
                                         (test-helpers/generate-card-yaml "removed-card-xxxxxxxx" "Removed Card" "removed-collection-xx")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (some #(str/includes? % "active-collection-xxx") (keys files-after-export))
                    "Active collection files should exist after export")
                (is (not (some #(str/includes? % "removed-collection-xx") (keys files-after-export)))
                    "Removed collection files should be deleted after export")))))))))

(deftest export!-only-deletes-top-level-removed-collections-test
  (testing "export! only deletes files for removed collections at location '/', not nested ones"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Collection {parent-coll-id :id}
                         {:name "Parent Collection"
                          :is_remote_synced true
                          :entity_id "parent-collection-xx"
                          :location "/"}
                         :model/Collection {nested-coll-id :id}
                         {:name "Nested Removed Collection"
                          :is_remote_synced true
                          :entity_id "nested-removed-collxx"
                          :location (format "/%d/" parent-coll-id)}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id parent-coll-id :model_name "Parent Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Collection" :model_id nested-coll-id :model_name "Nested Collection" :status "removed" :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {"collections/parent-collection-xx_parent_collection/parent-collection-xx.yaml"
                                         (test-helpers/generate-collection-yaml "parent-collection-xx" "Parent Collection")
                                         "collections/parent-collection-xx_parent_collection/nested-removed-collxx_nested_removed_collection/nested-removed-collxx.yaml"
                                         (test-helpers/generate-collection-yaml "nested-removed-collxx" "Nested Removed Collection"
                                                                                :parent-id "parent-collection-xx")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (some #(str/includes? % "parent-collection-xx") (keys files-after-export))
                    "Parent collection files should exist after export")
                (is (some #(str/includes? % "nested-removed-collxx") (keys files-after-export))
                    "Nested removed collection files should NOT be deleted (only top-level removals are processed)")))))))))

(deftest export!-handles-multiple-removed-top-level-collections-test
  (testing "export! correctly handles multiple removed top-level collections"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          ;; Note: entity_id must be exactly 21 characters
          (mt/with-temp [:model/Collection {active-coll-id :id}
                         {:name "Active Collection"
                          :is_remote_synced true
                          :entity_id "active-coll-xxxxxxxxx" ;; 21 chars
                          :location "/"}
                         :model/Collection {removed-coll-1-id :id}
                         {:name "Removed Collection 1"
                          :is_remote_synced false
                          :entity_id "removed-coll-1xxxxxxx" ;; 21 chars
                          :location "/"}
                         :model/Collection {removed-coll-2-id :id}
                         {:name "Removed Collection 2"
                          :is_remote_synced false
                          :entity_id "removed-coll-2xxxxxxx" ;; 21 chars
                          :location "/"}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id active-coll-id :model_name "Active Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Collection" :model_id removed-coll-1-id :model_name "Removed Col 1" :status "removed" :status_changed_at (t/offset-date-time)}
                         {:model_type "Collection" :model_id removed-coll-2-id :model_name "Removed Col 2" :status "removed" :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {"collections/removed-coll-1xxxxxxx_removed_collection_1/removed-coll-1xxxxxxx.yaml"
                                         (test-helpers/generate-collection-yaml "removed-coll-1xxxxxxx" "Removed Collection 1")
                                         "collections/removed-coll-1xxxxxxx_removed_collection_1/cards/card-1.yaml"
                                         (test-helpers/generate-card-yaml "card-1-entity-idxxxxx" "Card 1" "removed-coll-1xxxxxxx")
                                         "collections/removed-coll-2xxxxxxx_removed_collection_2/removed-coll-2xxxxxxx.yaml"
                                         (test-helpers/generate-collection-yaml "removed-coll-2xxxxxxx" "Removed Collection 2")
                                         "collections/removed-coll-2xxxxxxx_removed_collection_2/dashboards/dash-1.yaml"
                                         (test-helpers/generate-dashboard-yaml "dash-1-entity-idxxxxx" "Dashboard 1" "removed-coll-2xxxxxxx")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (some #(str/includes? % "active-coll-xxxxxxxxx") (keys files-after-export))
                    "Active collection files should exist after export")
                (is (not (some #(str/includes? % "removed-coll-1xxxxxxx") (keys files-after-export)))
                    "First removed collection files should be deleted")
                (is (not (some #(str/includes? % "removed-coll-2xxxxxxx") (keys files-after-export)))
                    "Second removed collection files should be deleted")))))))))

(deftest finish-remote-config!-sets-default-branch-when-blank-test
  (testing "finish-remote-config! sets default branch when branch setting is blank"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [mock-source (test-helpers/create-mock-source)
            import-started? (atom false)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-branch ""]
          (with-redefs [source/source-from-settings (constantly mock-source)
                        impl/async-import! (fn [& _args] (reset! import-started? true) 123)]
            (impl/finish-remote-config!)
            (is (= "main" (setting/get :remote-sync-branch))
                "Should set branch to default branch")))))))

(deftest finish-remote-config!-starts-import-in-read-only-mode-test
  (testing "finish-remote-config! starts import in read-only mode even when collection exists"
    (mt/with-model-cleanup [:model/RemoteSyncTask :model/Collection]
      (let [mock-source (test-helpers/create-mock-source)
            import-called? (atom false)]
        (mt/with-temp [:model/Collection _ {:name "Remote Collection" :is_remote_synced true :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-branch "main"
                                             remote-sync-type :read-only]
            (with-redefs [source/source-from-settings (constantly mock-source)
                          impl/async-import! (fn [& _args] (reset! import-called? true) {:id 123})]
              (let [task-id (impl/finish-remote-config!)]
                (is (= 123 task-id)
                    "Should return task ID from async-import!")
                (is @import-called?
                    "Should call async-import! in read-only mode")))))))))

(deftest finish-remote-config!-does-nothing-when-collection-exists-in-dev-mode-test
  (testing "finish-remote-config! does nothing when collection exists in read-write mode"
    (mt/with-model-cleanup [:model/Collection]
      (let [mock-source (test-helpers/create-mock-source)
            import-called? (atom false)]
        (mt/with-temp [:model/Collection _ {:name "Remote Collection" :is_remote_synced true :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-branch "main"
                                             remote-sync-type :read-write]
            (with-redefs [source/source-from-settings (constantly mock-source)
                          impl/async-import! (fn [& _args] (reset! import-called? true) 123)]
              (let [result (impl/finish-remote-config!)]
                (is (nil? result)
                    "Should return nil when nothing is done")
                (is (not @import-called?)
                    "Should not call async-import! when collection exists in dev mode")))))))))

(deftest finish-remote-config!-clears-collection-when-disabled-test
  (testing "finish-remote-config! clears remote-synced collection when remote sync is disabled"
    (mt/with-model-cleanup [:model/Collection]
      (let [clear-called? (atom false)]
        (mt/with-temp [:model/Collection _ {:name "Remote Collection" :is_remote_synced true :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-url     nil
                                             remote-sync-enabled false]
            (with-redefs [collection/clear-remote-synced-collection! (fn [] (reset! clear-called? true))]
              (let [result (impl/finish-remote-config!)]
                (is (nil? result)
                    "Should return nil when remote sync is disabled")
                (is @clear-called?
                    "Should call clear-remote-synced-collection!")))))))))

(deftest import!-v57-type-remote-synced-migration-test
  (testing "importing v57 export with type=remote-synced sets is_remote_synced=true and clears type"
    (let [v57-entity-id "v57-collection-xxxx"
          v57-files {"main" {(str "collections/" v57-entity-id "_v57_collection/" v57-entity-id "_v57_collection.yaml")
                             (test-helpers/generate-v57-collection-yaml v57-entity-id "V57 Collection" :type "remote-synced")}}
          mock-source (test-helpers/create-mock-source :initial-files v57-files)]
      (mt/with-model-cleanup [:model/Collection :model/RemoteSyncTask]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
              result (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :success (:status result)))
          (let [imported-collection (t2/select-one :model/Collection :entity_id v57-entity-id)]
            (is (some? imported-collection)
                "Collection should be imported")
            (is (true? (:is_remote_synced imported-collection))
                "is_remote_synced should be true after import")
            (is (nil? (:type imported-collection))
                "type should be nil (not 'remote-synced') after migration")))))))

(deftest import!-v57-nested-remote-synced-collections-test
  (testing "importing v57 export with nested type=remote-synced collections migrates all correctly"
    (let [parent-entity-id "v57-parent-collxxxxxx"
          child-entity-id  "v57-child-collxxxxxxx"
          v57-files {"main" {(str "collections/" parent-entity-id "_v57_parent/" parent-entity-id "_v57_parent.yaml")
                             (test-helpers/generate-v57-collection-yaml parent-entity-id "V57 Parent" :type "remote-synced")

                             (str "collections/" parent-entity-id "_v57_parent/" child-entity-id "_v57_child/" child-entity-id "_v57_child.yaml")
                             (test-helpers/generate-v57-collection-yaml child-entity-id "V57 Child" :parent-id parent-entity-id :type "remote-synced")}}
          mock-source (test-helpers/create-mock-source :initial-files v57-files)]
      (mt/with-model-cleanup [:model/Collection :model/RemoteSyncTask]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
              result (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :success (:status result)))
          (let [parent-collection (t2/select-one :model/Collection :entity_id parent-entity-id)
                child-collection (t2/select-one :model/Collection :entity_id child-entity-id)]
            (testing "parent collection"
              (is (some? parent-collection) "Parent collection should be imported")
              (is (true? (:is_remote_synced parent-collection)) "Parent is_remote_synced should be true")
              (is (nil? (:type parent-collection)) "Parent type should be nil"))
            (testing "child collection"
              (is (some? child-collection) "Child collection should be imported")
              (is (true? (:is_remote_synced child-collection)) "Child is_remote_synced should be true")
              (is (nil? (:type child-collection)) "Child type should be nil"))))))))

;; Table/Field/Segment tracking tests

(deftest export!-deletes-files-for-removed-tables-test
  (testing "export! deletes files from git source for tables with 'removed' status"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                         :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                         :model/Collection {coll-id :id}
                         {:name "Active Collection"
                          :is_remote_synced true
                          :entity_id "active-coll-xxxxxxxxx"
                          :location "/"}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Active Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Table" :model_id table-id :model_name "test-table" :model_table_id table-id :model_table_name "test-table" :status "removed" :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {"databases/test-db/tables/test-table/test-table.yaml"
                                         (test-helpers/generate-table-yaml "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "test-table") (keys files-after-export)))
                    "Removed table files should be deleted after export")))))))))

(deftest export!-deletes-files-for-removed-segments-test
  (testing "export! deletes files from git source for segments with 'removed' status"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Segment]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                         :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                         :model/Collection {coll-id :id}
                         {:name "Active Collection"
                          :is_remote_synced true
                          :entity_id "active-coll-xxxxxxxxx"
                          :location "/"}
                         :model/Segment {segment-id :id}
                         {:name "Test Segment"
                          :table_id table-id
                          :definition {:source-table table-id
                                       :filter [:> [:field 1 nil] 0]}
                          :entity_id "test-segment-xxxxxxxx"}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Active Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Segment" :model_id segment-id :model_name "Test Segment" :model_table_id table-id :model_table_name "test-table" :status "removed" :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {;; File path uses slugified name to match what serdes/storage-path generates
                                         "databases/test-db/tables/test-table/segments/test-segment-xxxxxxxx_test_segment.yaml"
                                         (test-helpers/generate-segment-yaml "Test Segment" "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "test-segment-xxxxxxxx") (keys files-after-export)))
                    "Removed segment files should be deleted after export")))))))))

(deftest export!-updates-removed-table-entries-to-synced-test
  (testing "export! updates RemoteSyncObject entries for 'removed' Tables/Fields/Segments to 'synced' status after successful export"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Segment]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                         :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                         :model/Field {field-id :id} {:name "test-field" :table_id table-id :base_type :type/Text}
                         :model/Collection {coll-id :id}
                         {:name "Active Collection"
                          :is_remote_synced true
                          :entity_id "active-coll-xxxxxxxxx"
                          :location "/"}
                         :model/Segment {segment-id :id}
                         {:name "Test Segment"
                          :table_id table-id
                          :definition {:source-table table-id
                                       :filter [:> [:field 1 nil] 0]}
                          :entity_id "test-segment-xxxxxxxx"}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Active Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Table" :model_id table-id :model_name "test-table" :model_table_id table-id :model_table_name "test-table" :status "removed" :status_changed_at (t/offset-date-time)}
                         {:model_type "Field" :model_id field-id :model_name "test-field" :model_table_id table-id :model_table_name "test-table" :status "removed" :status_changed_at (t/offset-date-time)}
                         {:model_type "Segment" :model_id segment-id :model_name "Test Segment" :model_table_id table-id :model_table_name "test-table" :status "removed" :status_changed_at (t/offset-date-time)}])
            (is (= 4 (t2/count :model/RemoteSyncObject)))
            (let [mock-source (test-helpers/create-mock-source)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (is (= 4 (t2/count :model/RemoteSyncObject))
                  "All RemoteSyncObject entries should remain after export")
              (let [table-entry (t2/select-one :model/RemoteSyncObject :model_type "Table" :model_id table-id)
                    field-entry (t2/select-one :model/RemoteSyncObject :model_type "Field" :model_id field-id)
                    segment-entry (t2/select-one :model/RemoteSyncObject :model_type "Segment" :model_id segment-id)
                    coll-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id coll-id)]
                (is (= "synced" (:status table-entry))
                    "Table entry should be updated to synced after export")
                (is (= "synced" (:status field-entry))
                    "Field entry should be updated to synced after export")
                (is (= "synced" (:status segment-entry))
                    "Segment entry should be updated to synced after export")
                (is (= "synced" (:status coll-entry))
                    "Collection should remain marked as synced")))))))))

(deftest export!-generates-correct-delete-paths-for-tables-with-schema-test
  (testing "export! generates correct delete paths for tables with schema"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                         :model/Table {table-id :id} {:name "test-table" :db_id db-id :schema "PUBLIC"}
                         :model/Collection {coll-id :id}
                         {:name "Active Collection"
                          :is_remote_synced true
                          :entity_id "active-coll-xxxxxxxxx"
                          :location "/"}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Active Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Table" :model_id table-id :model_name "test-table" :model_table_id table-id :model_table_name "test-table" :status "removed" :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {"databases/test-db/schemas/PUBLIC/tables/test-table/test-table.yaml"
                                         (test-helpers/generate-table-yaml "test-table" "test-db" :schema "PUBLIC")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "test-table") (keys files-after-export)))
                    "Removed table files should be deleted after export (including schema path)")))))))))

(deftest export!-excludes-archived-segments-test
  (testing "export! excludes archived segments from export (via skip-archived flag)"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Segment]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                         :model/Collection {coll-id :id}
                         {:name "Test Collection"
                          :is_remote_synced true
                          :entity_id "test-collection-1xxxx"
                          :location "/"}
                         ;; Table must have collection_id and is_published to be included as Collection descendant
                         :model/Table {table-id :id} {:name "test-table"
                                                      :db_id db-id
                                                      :collection_id coll-id
                                                      :is_published true}
                         :model/Segment {_active-seg-id :id}
                         {:name "Active Segment"
                          :table_id table-id
                          :definition {:source-table table-id
                                       :filter [:> [:field 1 nil] 0]}
                          :entity_id "active-segment-xxxxxx"
                          :archived false}
                         :model/Segment {_archived-seg-id :id}
                         {:name "Archived Segment"
                          :table_id table-id
                          :definition {:source-table table-id
                                       :filter [:> [:field 2 nil] 0]}
                          :entity_id "archived-segment-xxxx"
                          :archived true}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Test Collection" :status "synced" :status_changed_at (t/offset-date-time)}])
            (let [mock-source (test-helpers/create-mock-source)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")
                    file-keys (keys files-after-export)]
                (is (some #(str/includes? % "active-segment-xxxxxx") file-keys)
                    "Active segment should be exported")
                (is (not (some #(str/includes? % "archived-segment-xxxx") file-keys))
                    "Archived segment should NOT be exported")))))))))

(deftest export!-deletes-files-for-archived-segments-test
  (testing "export! deletes files from git source for segments with 'delete' status (archived segments)"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Segment]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                         :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                         :model/Collection {coll-id :id}
                         {:name "Active Collection"
                          :is_remote_synced true
                          :entity_id "active-coll-xxxxxxxxx"
                          :location "/"}
                         :model/Segment {segment-id :id}
                         {:name "Archived Segment"
                          :table_id table-id
                          :definition {:source-table table-id
                                       :filter [:> [:field 1 nil] 0]}
                          :entity_id "archived-seg-xxxxxxxx"
                          :archived true}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Active Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Segment" :model_id segment-id :model_name "Archived Segment" :model_table_id table-id :model_table_name "test-table" :status "delete" :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {"databases/test-db/tables/test-table/segments/archived-seg-xxxxxxxx_archived_segment.yaml"
                                         (test-helpers/generate-segment-yaml "Archived Segment" "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "archived-seg-xxxxxxxx") (keys files-after-export)))
                    "Archived segment files should be deleted after export"))
              (testing "RemoteSyncObject entry is cleaned up after export"
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Segment" :model_id segment-id)))
                    "RemoteSyncObject entry for archived segment should have synced status")))))))))

;; Import Table/Field/Segment tracking tests

(deftest import!-tracks-tables-in-remote-sync-object-test
  (testing "import! creates RemoteSyncObject entries for imported Tables"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                       :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                       :model/Collection {coll-id :id}
                       {:name "Test Collection"
                        :is_remote_synced true
                        :entity_id "test-collection-1xxxx"
                        :location "/"}]
          (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test-db/tables/test-table/test-table.yaml"
                                    (test-helpers/generate-table-yaml "test-table" "test-db")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result)))
            (is (t2/exists? :model/RemoteSyncObject
                            :model_type "Collection"
                            :model_id coll-id
                            :status "synced")
                "Collection should be tracked in RemoteSyncObject")
            (is (t2/exists? :model/RemoteSyncObject
                            :model_type "Table"
                            :model_id table-id
                            :status "synced")
                "Table should be tracked in RemoteSyncObject")))))))

(deftest import!-tracks-fields-in-remote-sync-object-test
  (testing "import! creates RemoteSyncObject entries for imported Fields"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                       :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                       :model/Field {field-id :id} {:name "test-field" :table_id table-id :base_type :type/Text}
                       :model/Collection _ {:name "Test Collection"
                                            :is_remote_synced true
                                            :entity_id "test-collection-1xxxx"
                                            :location "/"}]
          (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test-db/tables/test-table/fields/test-field.yaml"
                                    (test-helpers/generate-field-yaml "test-field" "test-table" "test-db")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result)))
            (is (t2/exists? :model/RemoteSyncObject
                            :model_type "Field"
                            :model_id field-id
                            :status "synced")
                "Field should be tracked in RemoteSyncObject")))))))

(deftest import!-tracks-segments-in-remote-sync-object-test
  (testing "import! creates RemoteSyncObject entries for imported Segments"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Segment]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                       :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                       :model/Field {field-id :id} {:name "test-field" :table_id table-id :base_type :type/Integer}
                       :model/Collection _ {:name "Test Collection"
                                            :is_remote_synced true
                                            :entity_id "test-collection-1xxxx"
                                            :location "/"}
                       :model/Segment {segment-id :id}
                       {:name "Test Segment"
                        :table_id table-id
                        :definition {:source-table table-id
                                     :filter [:> [:field field-id nil] 0]}
                        :entity_id "TNdMrOCMHrQc_UtvCbTC5"}]
          (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test-db/tables/test-table/test-table.yaml"
                                    (test-helpers/generate-table-yaml "test-table" "test-db")
                                    "databases/test-db/tables/test-table/fields/test-field.yaml"
                                    (test-helpers/generate-field-yaml "test-field" "test-table" "test-db" :base-type "type/Integer" :database-type "INTEGER")
                                    "databases/test-db/tables/test-table/segments/TNdMrOCMHrQc_UtvCbTC5_test_segment.yaml"
                                    (test-helpers/generate-segment-yaml "Test Segment" "test-table" "test-db"
                                                                        :entity-id "TNdMrOCMHrQc_UtvCbTC5"
                                                                        :filter-field-name "test-field")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result)))
            (is (t2/exists? :model/RemoteSyncObject
                            :model_type "Segment"
                            :model_id segment-id
                            :status "synced")
                "Segment should be tracked in RemoteSyncObject")))))))

(deftest import!-tracks-tables-with-schema-in-remote-sync-object-test
  (testing "import! creates RemoteSyncObject entries for imported Tables with schema"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                       :model/Table {table-id :id} {:name "test-table" :db_id db-id :schema "PUBLIC"}
                       :model/Collection _ {:name "Test Collection"
                                            :is_remote_synced true
                                            :entity_id "test-collection-1xxxx"
                                            :location "/"}]
          (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test-db/schemas/PUBLIC/tables/test-table/test-table.yaml"
                                    (test-helpers/generate-table-yaml "test-table" "test-db" :schema "PUBLIC")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result)))
            (is (t2/exists? :model/RemoteSyncObject
                            :model_type "Table"
                            :model_id table-id
                            :status "synced")
                "Table with schema should be tracked in RemoteSyncObject")))))))

(deftest import!-includes-actions-attached-to-models-test
  (testing "import! successfully imports Actions attached to Models in synced collections"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Action]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                        :is_remote_synced true
                                                        :entity_id "test-collection-1xxxx"
                                                        :location "/"}
                       :model/Card {model-id :id} {:name "Test Model"
                                                   :entity_id "test-model-xxxxxxxxxx"
                                                   :collection_id coll-id
                                                   :type :model
                                                   :dataset_query (mt/mbql-query venues)}]
          (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "collections/test-collection-1xxxx-_/cards/test-model.yaml"
                                    (test-helpers/generate-card-yaml "test-model-xxxxxxxxxx" "Test Model" "test-collection-1xxxx" "model")
                                    "actions/test-action-xxxxxxxxx_test_action.yaml"
                                    (test-helpers/generate-action-yaml "test-action-xxxxxxxxx" "Test Action" "test-model-xxxxxxxxxx")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result))
                "Import should succeed when actions/ directory is included in path filters")
            (let [imported-action (t2/select-one :model/Action :entity_id "test-action-xxxxxxxxx")]
              (is (some? imported-action)
                  "Action should be imported successfully")
              (is (= "Test Action" (:name imported-action))
                  "Action should have correct name")
              (is (= model-id (:model_id imported-action))
                  "Action should be attached to the correct model"))))))))

;; Measure tracking tests

(deftest import!-tracks-measures-in-remote-sync-object-test
  (testing "import! creates RemoteSyncObject entries for imported Measures"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Measure]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                       :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                       :model/Field {_field-id :id} {:name "test-field" :table_id table-id :base_type :type/Integer}
                       :model/Collection _ {:name "Test Collection"
                                            :is_remote_synced true
                                            :entity_id "test-collection-1xxxx"
                                            :location "/"}
                       :model/Measure {measure-id :id}
                       {:name "Test Measure"
                        :table_id table-id
                        :entity_id "TNdMrOCMHrQc_UtvCbTC6"}]
          (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test-db/tables/test-table/measures/TNdMrOCMHrQc_UtvCbTC6_test_measure.yaml"
                                    (test-helpers/generate-measure-yaml "Test Measure" "test-table" "test-db"
                                                                        :entity-id "TNdMrOCMHrQc_UtvCbTC6"
                                                                        :agg-field-name "test-field")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result)))
            (is (t2/exists? :model/RemoteSyncObject
                            :model_type "Measure"
                            :model_id measure-id
                            :status "synced")
                "Measure should be tracked in RemoteSyncObject")))))))

(deftest export!-deletes-files-for-removed-measures-test
  (testing "export! deletes files from git source for measures with 'removed' status"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Measure]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                         :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                         :model/Collection {coll-id :id}
                         {:name "Active Collection"
                          :is_remote_synced true
                          :entity_id "active-coll-xxxxxxxxx"
                          :location "/"}
                         :model/Measure {measure-id :id}
                         {:name "Test Measure"
                          :table_id table-id
                          :entity_id "test-measure-xxxxxxxx"}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Active Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Measure" :model_id measure-id :model_name "Test Measure" :model_table_id table-id :model_table_name "test-table" :status "removed" :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {;; File path uses slugified name to match what serdes/storage-path generates
                                         "databases/test-db/tables/test-table/measures/test-measure-xxxxxxxx_test_measure.yaml"
                                         (test-helpers/generate-measure-yaml "Test Measure" "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "test-measure-xxxxxxxx") (keys files-after-export)))
                    "Removed measure files should be deleted after export")))))))))

(deftest export!-excludes-archived-measures-test
  (testing "export! excludes archived measures from export (via skip-archived flag)"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Measure]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                         :model/Collection {coll-id :id}
                         {:name "Test Collection"
                          :is_remote_synced true
                          :entity_id "test-collection-1xxxx"
                          :location "/"}
                         ;; Table must have collection_id and is_published to be included as Collection descendant
                         :model/Table {table-id :id} {:name "test-table"
                                                      :db_id db-id
                                                      :collection_id coll-id
                                                      :is_published true}
                         :model/Measure {_active-measure-id :id}
                         {:name "Active Measure"
                          :table_id table-id
                          :entity_id "active-measure-xxxxxx"
                          :archived false}
                         :model/Measure {_archived-measure-id :id}
                         {:name "Archived Measure"
                          :table_id table-id
                          :entity_id "archived-measure-xxxx"
                          :archived true}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Test Collection" :status "synced" :status_changed_at (t/offset-date-time)}])
            (let [mock-source (test-helpers/create-mock-source)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")
                    file-keys (keys files-after-export)]
                (is (some #(str/includes? % "active-measure-xxxxxx") file-keys)
                    (str "Active measure should be exported. Keys: " (pr-str file-keys)))
                (is (not (some #(str/includes? % "archived-measure-xxxx") file-keys))
                    "Archived measure should NOT be exported")))))))))

(deftest export!-deletes-files-for-archived-measures-test
  (testing "export! deletes files from git source for measures with 'delete' status (archived measures)"
    (mt/with-model-cleanup [:model/RemoteSyncObject :model/Measure]
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Database {db-id :id} {:name "test-db"}
                         :model/Table {table-id :id} {:name "test-table" :db_id db-id}
                         :model/Collection {coll-id :id}
                         {:name "Active Collection"
                          :is_remote_synced true
                          :entity_id "active-coll-xxxxxxxxx"
                          :location "/"}
                         :model/Measure {measure-id :id}
                         {:name "Archived Measure"
                          :table_id table-id
                          :entity_id "archived-meas-xxxxxxx"
                          :archived true}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection" :model_id coll-id :model_name "Active Collection" :status "synced" :status_changed_at (t/offset-date-time)}
                         {:model_type "Measure" :model_id measure-id :model_name "Archived Measure" :model_table_id table-id :model_table_name "test-table" :status "delete" :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {"databases/test-db/tables/test-table/measures/archived-meas-xxxxxxx_archived_measure.yaml"
                                         (test-helpers/generate-measure-yaml "Archived Measure" "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "archived-meas-xxxxxxx") (keys files-after-export)))
                    "Archived measure files should be deleted after export"))
              (testing "RemoteSyncObject entry is cleaned up after export"
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Measure" :model_id measure-id)))
                    "RemoteSyncObject entry for archived measure should have synced status")))))))))

;; Auto-enable transforms tests

(deftest import!-auto-enables-transforms-setting-when-transforms-detected-test
  (testing "import! auto-enables remote-sync-transforms setting only after successful import with transforms"
    (mt/with-premium-features #{:transforms}
      (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform :model/RemoteSyncObject]
        (mt/with-temporary-setting-values [remote-sync-transforms false
                                           remote-sync-enabled true]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                transform-entity-id "auto-enable-trans-xxx"
                test-files {"main" {(str "transforms/" transform-entity-id "_test_transform.yaml")
                                    (test-helpers/generate-transform-yaml transform-entity-id "Test Transform")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)]
            (is (false? (remote-sync.settings/remote-sync-transforms))
                "remote-sync-transforms should be initially disabled")
            (let [result (impl/import! (source.p/snapshot mock-source) task-id)]
              (is (= :success (:status result))
                  "Import should succeed")
              (is (true? (remote-sync.settings/remote-sync-transforms))
                  "remote-sync-transforms should be auto-enabled after successful import with transforms"))))))))

(deftest import!-auto-enables-transforms-setting-when-python-libraries-detected-test
  (testing "import! auto-enables remote-sync-transforms setting only after successful import with python-libraries"
    (mt/with-premium-features #{:transforms}
      (mt/with-model-cleanup [:model/RemoteSyncTask :model/PythonLibrary :model/RemoteSyncObject]
        (mt/with-temporary-setting-values [remote-sync-transforms false
                                           remote-sync-enabled true]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                lib-entity-id "auto-enable-lib-xxxxx"
                test-files {"main" {(str "python-libraries/" lib-entity-id ".yaml")
                                    (format "path: uncommon.py
source: |
  # shared code
  def shared_func():
      return 42
entity_id: %s
created_at: '2024-08-28T09:46:18.671622Z'
serdes/meta:
- id: %s
  model: PythonLibrary
" lib-entity-id lib-entity-id)}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)]
            (is (false? (remote-sync.settings/remote-sync-transforms))
                "remote-sync-transforms should be initially disabled")
            (let [result (impl/import! (source.p/snapshot mock-source) task-id)]
              (is (= :success (:status result))
                  "Import should succeed")
              (is (true? (remote-sync.settings/remote-sync-transforms))
                  "remote-sync-transforms should be auto-enabled after successful import with python-libraries"))))))))

(deftest import!-keeps-transforms-setting-disabled-when-no-transforms-present-test
  (testing "import! keeps remote-sync-transforms setting disabled when no transforms are present"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temporary-setting-values [remote-sync-transforms false]
          (mt/with-temp [:model/Collection {_coll-id :id} {:name "No Transforms Coll" :is_remote_synced true :entity_id "no-transforms-coll-xx" :location "/"}]
            (let [test-files {"main" {"collections/no-transforms-coll-xx-_/no-transforms-coll-xx.yaml"
                                      (test-helpers/generate-collection-yaml "no-transforms-coll-xx" "No Transforms Coll")}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)]
              (is (false? (remote-sync.settings/remote-sync-transforms))
                  "remote-sync-transforms should be initially disabled")
              (let [result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result)))
                (is (false? (remote-sync.settings/remote-sync-transforms))
                    "remote-sync-transforms should remain disabled when no transforms in remote")))))))))

(deftest import!-does-not-disable-transforms-setting-when-already-enabled-test
  (testing "import! does not modify remote-sync-transforms setting when it's already enabled"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temporary-setting-values [remote-sync-transforms true]
          (mt/with-temp [:model/Collection {_coll-id :id} {:name "Already Enabled Coll" :is_remote_synced true :entity_id "already-enabled-collx" :location "/"}]
            (let [test-files {"main" {"collections/already-enabled-collx-_/already-enabled-collx.yaml"
                                      (test-helpers/generate-collection-yaml "already-enabled-collx" "Already Enabled Coll")}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)]
              (is (true? (remote-sync.settings/remote-sync-transforms))
                  "remote-sync-transforms should be initially enabled")
              (let [result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result)))
                (is (true? (remote-sync.settings/remote-sync-transforms))
                    "remote-sync-transforms should remain enabled even when no transforms in remote")))))))))

(deftest import!-includes-all-optional-paths-regardless-of-settings-test
  (testing "import! always includes all optional paths (transforms, python-libraries, snippets)"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temporary-setting-values [remote-sync-transforms false]
          (mt/with-temp [:model/Collection {_coll-id :id} {:name "All Paths Coll" :is_remote_synced true :entity_id "all-paths-coll-xxxxxx" :location "/"}]
            (let [test-files {"main" {"collections/all-paths-coll-xxxxxx-_/all-paths-coll-xxxxxx.yaml"
                                      (test-helpers/generate-collection-yaml "all-paths-coll-xxxxxx" "All Paths Coll")}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)
                  paths-passed (atom nil)
                  original-fn source.p/->ingestable]
              (with-redefs [source.p/->ingestable (fn [snapshot opts]
                                                    (reset! paths-passed (:path-filters opts))
                                                    (original-fn snapshot opts))]
                (let [result (impl/import! (source.p/snapshot mock-source) task-id)]
                  (is (= :success (:status result)))
                  (when @paths-passed
                    (let [filter-strs (map str @paths-passed)]
                      (is (some #(str/includes? % "transforms") filter-strs)
                          "transforms path should be included in filters")
                      (is (some #(str/includes? % "python-libraries") filter-strs)
                          "python-libraries path should be included in filters")
                      (is (some #(str/includes? % "snippets") filter-strs)
                          "snippets path should be included in filters"))))))))))))

(deftest import!-blocks-if-it-encounters-library-conflicts
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
    (t2/delete! :model/Collection :entity_id collection/library-entity-id)
    (mt/with-temp [:model/Collection _ {:name "Test Library Collection"
                                        :type "library"
                                        :entity_id collection/library-entity-id
                                        :location "/"}]
      (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                (test-helpers/generate-collection-yaml collection/library-entity-id "Another Library")}}
            mock-source (test-helpers/create-mock-source :initial-files test-files)
            result (impl/import! (source.p/snapshot mock-source) task-id)]
        (is (= :conflict (:status result)))
        (is (= #{"Library"} (:conflicts result)))))))

(deftest import!-blocks-if-it-encounters-snippet-conflicts
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
    (mt/with-temp [:model/NativeQuerySnippet _ {:name "Test Snippet"}]
      (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                (test-helpers/generate-snippet-yaml "blahblahblah" "A Snippet" "select 123")}}
            mock-source (test-helpers/create-mock-source :initial-files test-files)
            result (impl/import! (source.p/snapshot mock-source) task-id)]
        (is (= :conflict (:status result)))
        (is (= #{"Snippets"} (:conflicts result)))))))

(deftest import!-blocks-if-it-encounters-transform-conflicts
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
    (mt/with-temp [:model/Transform _ {:name "Test Transform"}]
      (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                (test-helpers/generate-transform-yaml "blahblahblah" "A Transform")}}
            mock-source (test-helpers/create-mock-source :initial-files test-files)
            result (impl/import! (source.p/snapshot mock-source) task-id)]
        (is (= :conflict (:status result)))
        (is (= #{"Transforms"} (:conflicts result)))))))

(deftest import!-reports-multiple-conflicts
  (testing "when multiple conflict types exist, all are reported in the :conflicts set"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (t2/delete! :model/Collection :entity_id collection/library-entity-id)
      (mt/with-temp [:model/Collection _ {:name "Test Library Collection"
                                          :type "library"
                                          :entity_id collection/library-entity-id
                                          :location "/"}
                     :model/NativeQuerySnippet _ {:name "Test Snippet"}
                     :model/Transform _ {:name "Test Transform"}]
        (let [test-files {"main" {"collections/lib-_/lib.yaml"
                                  (test-helpers/generate-collection-yaml collection/library-entity-id "Remote Library")
                                  "collections/snip-_/snip.yaml"
                                  (test-helpers/generate-snippet-yaml "snip-entity-id" "Remote Snippet" "select 1")
                                  "collections/trans-_/trans.yaml"
                                  (test-helpers/generate-transform-yaml "trans-entity-id" "Remote Transform")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :conflict (:status result)))
          (is (= #{"Library" "Transforms" "Snippets"} (:conflicts result))))))))

(deftest import!-force-bypasses-conflicts
  (testing "force?: true allows import to proceed despite conflicts"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (t2/delete! :model/Collection :entity_id collection/library-entity-id)
      (mt/with-temp [:model/Collection _ {:name "Test Library Collection"
                                          :type "library"
                                          :entity_id collection/library-entity-id
                                          :location "/"}]
        (let [test-files {"main" {"collections/lib-_/lib.yaml"
                                  (test-helpers/generate-collection-yaml collection/library-entity-id "Remote Library")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result (impl/import! (source.p/snapshot mock-source) task-id :force? true)]
          (is (= :success (:status result))))))))

(deftest import!-conflicts-only-block-initial-import
  (testing "when last-imported-version is set, conflicts do not block subsequent imports"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (t2/delete! :model/Collection :entity_id collection/library-entity-id)
      (mt/with-temp [:model/Collection _ {:name "Local Library"
                                          :type "library"
                                          :entity_id collection/library-entity-id
                                          :location "/"}]
        (with-redefs [remote-sync.task/last-version (constantly "previous-version")]
          (let [test-files {"main" {"collections/lib-_/lib.yaml"
                                    (test-helpers/generate-collection-yaml collection/library-entity-id "Remote Library")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result))
                "Conflicts should not block when last-imported-version is set")))))))

(deftest import!-no-conflict-when-local-only
  (testing "having local entities but no matching remote entities is not a conflict"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/NativeQuerySnippet _ {:name "Local Snippet Only"}]
        (let [result (impl/import! (source.p/snapshot (test-helpers/create-mock-source)) task-id)]
          (is (= :success (:status result))))))))

(deftest import!-no-conflict-when-remote-only
  (testing "having remote entities but no matching local entities is not a conflict"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result  (impl/import! (source.p/snapshot (test-helpers/create-mock-source)) task-id)]
      (is (= :success (:status result))
          "Should not trigger conflict when only remote has entities"))))

(deftest import!-library-conflict-requires-correct-type
  (testing "a Collection with library entity_id but type!=library does not trigger conflict"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (t2/delete! :model/Collection :entity_id collection/library-entity-id)
      (mt/with-temp [:model/Collection _ {:name "Not A Library"
                                          :type nil
                                          :entity_id collection/library-entity-id
                                          :location "/"}]
        (let [test-files {"main" {"collections/lib-_/lib.yaml"
                                  (test-helpers/generate-collection-yaml collection/library-entity-id "Remote Library")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :success (:status result))))))))

;; --- Spec-driven conflict detection tests ---

(deftest import!-returns-conflict-details-test
  (testing "import! returns detailed conflict information in :conflict-details"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (t2/delete! :model/Collection :entity_id collection/library-entity-id)
      (mt/with-temp [:model/Collection _ {:name "Test Library Collection"
                                          :type "library"
                                          :entity_id collection/library-entity-id
                                          :location "/"}]
        (let [test-files {"main" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                  (test-helpers/generate-collection-yaml collection/library-entity-id "Another Library")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :conflict (:status result)))
          (is (= #{"Library"} (:conflicts result))
              "Should return backward-compatible :conflicts set")
          (is (seq (:conflict-details result))
              "Should include detailed conflict information")
          (is (some #(= :library-conflict (:type %)) (:conflict-details result))
              "Should have library-conflict type in details"))))))

(deftest import!-transforms-conflict-test
  (testing "import! detects transforms conflict when local has transforms and import has transforms"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/Transform _ {:name "Local Transform"}]
        (let [test-files {"main" {"collections/test-coll-_/test-coll.yaml"
                                  (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                  "transforms/test-transform-_/test-transform.yaml"
                                  (test-helpers/generate-transform-yaml "test-transform-xxxxx" "Remote Transform")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :conflict (:status result)))
          (is (contains? (:conflicts result) "Transforms"))
          (is (some #(= :transforms-conflict (:type %)) (:conflict-details result))))))))

(deftest import!-snippets-conflict-test
  (testing "import! detects snippets conflict when local has snippets and import has snippets"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/NativeQuerySnippet _ {:name "Local Snippet"}]
        (let [test-files {"main" {"collections/test-coll-_/test-coll.yaml"
                                  (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                  "snippets/test-snippet-_/test-snippet.yaml"
                                  (test-helpers/generate-snippet-yaml "test-snippet-xxxxxxx" "Remote Snippet" "SELECT 1")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :conflict (:status result)))
          (is (contains? (:conflicts result) "Snippets"))
          (is (some #(= :snippets-conflict (:type %)) (:conflict-details result))))))))
