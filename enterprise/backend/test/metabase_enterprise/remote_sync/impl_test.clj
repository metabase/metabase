(ns metabase-enterprise.remote-sync.impl-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
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
  (testing "import! with no source configured"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! nil task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Remote sync source is not enabled" (:message result))))))

(deftest import!-successful-without-collections-test
  (testing "import! successful without collections (imports all remote-synced)"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
        (let [result (impl/import! (test-helpers/create-mock-source) task-id)]
          (is (= :success (:status result))))))))

(deftest import!-with-branch-parameter-test
  (testing "import! with branch parameter uses provided branch"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          custom-files {"custom-branch" {"collections/custom-collection.yaml"
                                         (test-helpers/generate-collection-yaml "custom-collection-idx" "Custom Collection")}}
          result (impl/import! (test-helpers/create-mock-source :initial-files custom-files) task-id)]
      (is (= :success (:status result))))))

(deftest import!-handles-network-errors-test
  (testing "import! handles network errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (test-helpers/create-mock-source :fail-mode :network-error)
                               task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Network error" (:message result))))))

(deftest import!-handles-authentication-errors-test
  (testing "import! handles authentication errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (test-helpers/create-mock-source :fail-mode :auth-error) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Authentication failed" (:message result))))))

(deftest import!-handles-repository-not-found-errors-test
  (testing "import! handles repository not found errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (test-helpers/create-mock-source :fail-mode :repo-not-found) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Repository not found" (:message result))))))

(deftest import!-handles-branch-errors-test
  (testing "import! handles branch errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (test-helpers/create-mock-source :fail-mode :branch-error) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Branch error:" (:message result))))))

(deftest import!-handles-generic-errors-test
  (testing "import! handles generic errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (test-helpers/create-mock-source :fail-mode :list-files-error) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Failed to reload from git repository" (:message result))))))

;; We need to make sure the task-id we use to track the Remote Sync is not bound to a transactions because of the behavior of
;; update-sync-progress. So the follow two tests cannot use with-temp to create models
(deftest import!-skips-when-version-matches-without-force-test
  (testing "import! skips import when source version matches last imported version and force? is false"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [mock-source (test-helpers/create-mock-source)
            source-version (source.p/version mock-source)
            task-defaults (mt/with-temp-defaults :model/RemoteSyncTask)]
        (t2/insert! :model/RemoteSyncTask (merge task-defaults
                                                 {:sync_task_type "import"
                                                  :initiated_by (mt/user->id :rasta)
                                                  :ended_at :%now
                                                  :version source-version}))
        (let [task-id-2 (t2/insert-returning-pk! :model/RemoteSyncTask (merge task-defaults
                                                                              {:sync_task_type "import"
                                                                               :initiated_by (mt/user->id :rasta)}))
              result (impl/import! mock-source task-id-2 :force? false)]
          (is (= :success (:status result)))
          (is (= source-version (:version result)))
          (is (re-find #"Skipping import.*matches last imported version" (:message result))))))))

(deftest import!-proceeds-when-version-matches-with-force-test
  (testing "import! proceeds with import when source version matches last imported version but force? is true"
    (mt/with-model-cleanup [:model/Collection :model/RemoteSyncTask]
      (let [mock-source (test-helpers/create-mock-source)
            source-version (source.p/version mock-source)
            coll-defaults (mt/with-temp-defaults :model/Collection)
            task-defaults (mt/with-temp-defaults :model/RemoteSyncTask)]
        (t2/insert! :model/Collection (merge coll-defaults
                                             {:name "Test Collection"
                                              :type "remote-synced"
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
              result (impl/import! mock-source task-id-2 :force? true)]
          (is (= :success (:status result)))
          (is (= source-version (:version result)))
          (is (= "Successfully reloaded from git repository" (:message result))))))))

;; export! tests

(deftest export!-with-no-source-configured-test
  (testing "export! with no source configured"
    (mt/with-temporary-setting-values [remote-sync-type :development]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})
            result (impl/export! nil task-id "Test commit")]
        (is (= :error (:status result)))
        (is (re-find #"Remote sync source is not enabled" (:message result)))))))

(deftest export!-with-no-remote-synced-collections-test
  (testing "export! errors when there are no remote-synced collections"
    (mt/with-temporary-setting-values [remote-sync-type :development]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        ;; Create a regular collection (not remote-synced) to verify it's not included
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Regular Collection" :type nil :location "/"}]
          (let [mock-source (test-helpers/create-mock-source)
                result (impl/export! mock-source task-id "Test commit")]
            (is (= :error (:status result)))
            (is (= "No remote-synced collections available to sync." (:message result)))))))))

(deftest export!-successful-with-default-collections-test
  (testing "export! successful with default collections"
    (mt/with-temporary-setting-values [remote-sync-type :development]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
          (let [mock-source (test-helpers/create-mock-source)
                result (impl/export! mock-source task-id "Test commit message")]
            (is (= :success (:status result)))))))))

(deftest export!-handles-store-failure-test
  (testing "export! handles store failure"
    (mt/with-temporary-setting-values [remote-sync-type :development]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
          (let [mock-source (test-helpers/create-mock-source :fail-mode :store-error)
                result (impl/export! mock-source task-id "Test commit message")]
            (is (= :error (:status result)))
            (is (re-find #"Failed to export to git repository" (:message result)))))))))

(deftest export!-handles-network-errors-during-write-test
  (testing "export! handles network errors during write"
    (mt/with-temporary-setting-values [remote-sync-type :development]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
          (let [mock-source (test-helpers/create-mock-source :fail-mode :network-error)
                result (impl/export! mock-source task-id "Test commit message")]
            (is (= :error (:status result)))
            (is (re-find #"Failed to export to git repository" (:message result)))))))))

;; Integration tests

(deftest complete-import-export-workflow-test
  (testing "complete import-export workflow"
    (mt/with-temporary-setting-values [remote-sync-type :development]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
                     :model/Card {card-id :id} {:name "Test Card" :collection_id coll-id :entity_id "test-card-1xxxxxxxxxx"}]
        (let [mock-main (test-helpers/create-mock-source :branch "test-branch")
              export-task (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})
              export-result (impl/export! mock-main (:id export-task) "Test export")]
          (remote-sync.task/complete-sync-task! (:id export-task))
          (is (= :success (:status export-result)))

          ;; Verify files were written to the mock source atom
          (let [files-after-export (get @(:files-atom mock-main) "test-branch")]
            (is (map? files-after-export))
            (is (not-empty files-after-export))
            ;; Should have at least collection and card files
            (is (some #(str/includes? % "collection") (keys files-after-export)))
            (is (some #(str/includes? % "card") (keys files-after-export))))

          (t2/delete! :model/RemoteSyncTask :id (:id export-task))
          ;; Then import - verify it succeeds and processes the exported files
          (let [import-task (t2/with-connection [_conn (app-db/app-db) (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})])
                import-result (impl/import! mock-main (:id import-task))]
            (remote-sync.task/complete-sync-task! (:id import-task))
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
              (is (= coll-id (:collection_id card))))))))))

(deftest collection-cleanup-during-import-test
  (testing "collection cleanup during import (tests clean-synced! private function)"
    (let [import-task (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
                     :model/Collection {coll2-id :id} {:name "Collection 2" :type "remote-synced" :entity_id "test-collection-2xxxx" :location "/"}
                     :model/Card {card1-id :id} {:name "Card 1" :collection_id coll1-id :entity_id "test-card-1xxxxxxxxxx"}
                     :model/Card {card2-id :id} {:name "Card 2" :collection_id coll2-id :entity_id "test-card-2xxxxxxxxxx"}]
        (let [test-files {"test-branch" {"collections/test-collection-1xxxx-_/test-collection-1xxxx.yaml"
                                         (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection 1")
                                         "collections/test-collection-1xxxx-_/cards/test-card-1.yaml"
                                         (test-helpers/generate-card-yaml "test-card-1xxxxxxxxxx" "Test Card 1" "test-collection-1xxxx")}}
              mock-main (test-helpers/create-mock-source :initial-files test-files :branch "test-branch")
              result (impl/import! mock-main (:id import-task))]
          (is (= :success (:status result)))

          ;; Verify the entities still exist (real cleanup would require more complex setup)
          (is (t2/exists? :model/Card :id card1-id))
          (is (not (t2/exists? :model/Collection :id coll2-id)))
          (is (not (t2/exists? :model/Card :id card2-id))))))))

(deftest error-handling-propagation-through-private-functions-test
  (testing "error handling propagation through private functions"
    (let [mock-source (test-helpers/create-mock-source :fail-mode :network-error)
          task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! mock-source task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Network error" (:message result))))))

(deftest import!-calls-update-progress-with-expected-values-test
  (testing "import! calls update-progress! with expected progress values"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}]
        (let [mock-source (test-helpers/create-mock-source)
              progress-calls (atom [])]
          (with-redefs [remote-sync.task/update-progress!
                        (fn [task-id progress]
                          (swap! progress-calls conj {:task-id task-id :progress progress}))]
            (let [result (impl/import! mock-source task-id)]
              (is (= :success (:status result)))
              ;; Verify progress was called with expected values
              (is (= 5 (count @progress-calls)))
              (is (= task-id (:task-id (first @progress-calls))))
              (is (= task-id (:task-id (second @progress-calls))))
              (is (= task-id (:task-id (nth @progress-calls 2))))
              ;; Check progress values are in expected sequence
              (is (= 0.7 (:progress (nth @progress-calls 2))))
              (is (= 0.8 (:progress (nth @progress-calls 3))))
              (is (= 0.95 (:progress (nth @progress-calls 4)))))))))))

(deftest export!-calls-update-progress-with-expected-values-test
  (testing "export! calls update-progress! with expected progress values"
    (mt/dataset test-data
      (mt/with-temporary-setting-values [remote-sync-type :development]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
                         :model/Collection _ {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-2xxxx" :location "/"}
                         :model/Card _ {:collection_id coll-id}]
            (let [mock-source (test-helpers/create-mock-source)
                  progress-calls (atom [])]
              (with-redefs [remote-sync.task/update-progress!
                            (fn [task-id progress]
                              (swap! progress-calls conj {:task-id task-id :progress progress}))]
                (let [result (impl/export! mock-source task-id "Test commit")]
                  (is (= :success (:status result)))
                  ;; Verify progress was called with expected values
                  (is (= 4 (count @progress-calls)))
                  (is (= task-id (:task-id (first @progress-calls))))
                  ;; Check progress value is expected
                  (is (= 0.3 (:progress (first @progress-calls)))))))))))))

(deftest import!-resets-remote-sync-object-table-test
  (testing "import! deletes and recreates RemoteSyncObject table with synced status"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
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
                result (impl/import! mock-source task-id)]
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
      (mt/with-temporary-setting-values [remote-sync-type :development]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :type "remote-synced" :entity_id "test-collection-1xxxx" :location "/"}
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
                  result (impl/export! mock-source task-id "Test commit message")]
              (is (= :success (:status result)))
              (let [entries (t2/select :model/RemoteSyncObject)]
                (is (= 3 (count entries)))
                (is (every? #(= "synced" (:status %)) entries))
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))))
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id card-id))))
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id dash-id))))))))))))

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
                "Should set branch to default branch")
            (is @import-started?
                "Should start import when no collection exists")))))))

(deftest finish-remote-config!-starts-import-when-no-collection-exists-test
  (testing "finish-remote-config! starts import when no remote-synced collection exists"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [mock-source (test-helpers/create-mock-source)
            import-called? (atom false)
            import-args (atom nil)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-branch "main"
                                           remote-sync-type :development]
          (with-redefs [source/source-from-settings (constantly mock-source)
                        impl/async-import! (fn [branch force? args]
                                             (reset! import-called? true)
                                             (reset! import-args {:branch branch :force? force? :args args})
                                             {:id 123})
                        collection/remote-synced-collection (constantly nil)]
            (let [task-id (impl/finish-remote-config!)]
              (is (= 123 task-id)
                  "Should return task ID from async-import!")
              (is @import-called?
                  "Should call async-import!")
              (is (= {:branch "main" :force? true :args {}}
                     @import-args)
                  "Should call async-import! with correct arguments"))))))))

(deftest finish-remote-config!-starts-import-in-production-mode-test
  (testing "finish-remote-config! starts import in production mode even when collection exists"
    (mt/with-model-cleanup [:model/RemoteSyncTask :model/Collection]
      (let [mock-source (test-helpers/create-mock-source)
            import-called? (atom false)]
        (mt/with-temp [:model/Collection _ {:name "Remote Collection" :type "remote-synced" :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-branch "main"
                                             remote-sync-type :production]
            (with-redefs [source/source-from-settings (constantly mock-source)
                          impl/async-import! (fn [& _args] (reset! import-called? true) {:id 123})]
              (let [task-id (impl/finish-remote-config!)]
                (is (= 123 task-id)
                    "Should return task ID from async-import!")
                (is @import-called?
                    "Should call async-import! in production mode")))))))))

(deftest finish-remote-config!-does-nothing-when-collection-exists-in-dev-mode-test
  (testing "finish-remote-config! does nothing when collection exists in development mode"
    (mt/with-model-cleanup [:model/Collection]
      (let [mock-source (test-helpers/create-mock-source)
            import-called? (atom false)]
        (mt/with-temp [:model/Collection _ {:name "Remote Collection" :type "remote-synced" :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-branch "main"
                                             remote-sync-type :development]
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
        (mt/with-temp [:model/Collection _ {:name "Remote Collection" :type "remote-synced" :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-enabled false]
            (with-redefs [collection/clear-remote-synced-collection! (fn [] (reset! clear-called? true))]
              (let [result (impl/finish-remote-config!)]
                (is (nil? result)
                    "Should return nil when remote sync is disabled")
                (is @clear-called?
                    "Should call clear-remote-synced-collection!")))))))))

(deftest import!-v58-is-remote-synced-migration-test
  (testing "importing v58 export with is_remote_synced=true sets type=remote-synced"
    (let [v58-entity-id "v58-collection-xxxx"
          v58-files {"main" {(str "collections/" v58-entity-id "_v58_collection/" v58-entity-id "_v58_collection.yaml")
                             (test-helpers/generate-v58-collection-yaml v58-entity-id "V58 Collection" :is-remote-synced true)}}
          mock-source (test-helpers/create-mock-source :initial-files v58-files)]
      (mt/with-model-cleanup [:model/Collection :model/RemoteSyncTask]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
              result (impl/import! mock-source task-id)]
          (is (= :success (:status result)))
          (let [imported-collection (t2/select-one :model/Collection :entity_id v58-entity-id)]
            (is (some? imported-collection)
                "Collection should be imported")
            (is (= "remote-synced" (:type imported-collection))
                "type should be 'remote-synced' after migration from v58 is_remote_synced=true")))))))

(deftest import!-v58-nested-remote-synced-collections-test
  (testing "importing v58 export with nested is_remote_synced=true collections migrates all correctly"
    (let [parent-entity-id "v58-parent-collxxxxxx"
          child-entity-id  "v58-child-collxxxxxxx"
          v58-files {"main" {(str "collections/" parent-entity-id "_v58_parent/" parent-entity-id "_v58_parent.yaml")
                             (test-helpers/generate-v58-collection-yaml parent-entity-id "V58 Parent" :is-remote-synced true)

                             (str "collections/" parent-entity-id "_v58_parent/" child-entity-id "_v58_child/" child-entity-id "_v58_child.yaml")
                             (test-helpers/generate-v58-collection-yaml child-entity-id "V58 Child" :parent-id parent-entity-id :is-remote-synced true)}}
          mock-source (test-helpers/create-mock-source :initial-files v58-files)]
      (mt/with-model-cleanup [:model/Collection :model/RemoteSyncTask]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
              result (impl/import! mock-source task-id)]
          (is (= :success (:status result)))
          (let [parent-collection (t2/select-one :model/Collection :entity_id parent-entity-id)
                child-collection (t2/select-one :model/Collection :entity_id child-entity-id)]
            (testing "parent collection"
              (is (some? parent-collection) "Parent collection should be imported")
              (is (= "remote-synced" (:type parent-collection)) "Parent type should be 'remote-synced'"))
            (testing "child collection"
              (is (some? child-collection) "Child collection should be imported")
              (is (= "remote-synced" (:type child-collection)) "Child type should be 'remote-synced'"))))))))
