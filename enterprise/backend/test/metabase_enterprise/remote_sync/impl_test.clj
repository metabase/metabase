(ns metabase-enterprise.remote-sync.impl-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.remote-sync.impl-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
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

(deftest import!-successful-without-collections-test
  (testing "import! successful without collections (imports all remote-synced)"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
      (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}]
        (let [result (impl/import! (source.p/snapshot (test-helpers/create-mock-source)) task-id)]
          (is (= :success (:status result))))))))

(deftest import!-with-branch-parameter-test
  (testing "import! with branch parameter uses provided branch"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          custom-files {"custom-branch" {"collections/main/custom_collection/custom_collection.yaml"
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

(deftest import!-unparseable-yaml-should-not-silently-succeed-test
  (testing "import! should fail when a YAML file in the snapshot is unparseable, not silently skip it"
    (let [task-id   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          ;; A valid collection + a card with unparseable YAML (malformed syntax)
          bad-yaml  "name: Bad Card\nentity_id: bad-card-entity0001\ndataset_query: [invalid\n"
          files     {"main" {"collections/main/test/test.yaml"
                             (test-helpers/generate-collection-yaml "coll01xxxxxxxxxxxxx" "Test")
                             "collections/main/test/bad_card.yaml"
                             bad-yaml}}
          result    (impl/import! (source.p/snapshot (test-helpers/create-mock-source :initial-files files)) task-id)]
      (is (= :error (:status result))
          "Import should fail when a YAML file cannot be parsed, not silently skip it")
      (testing "the error message names the offending file and the parse reason"
        (is (str/includes? (:message result) "collections/main/test/bad_card.yaml"))
        (is (str/includes? (:message result) "expected ',' or ']'"))))))

(deftest import!-handles-generic-errors-test
  (testing "import! handles generic errors"
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          result (impl/import! (source.p/snapshot (test-helpers/create-mock-source :fail-mode :list-files-error)) task-id)]
      (is (= :error (:status result)))
      (is (re-find #"Failed to reload from git repository" (:message result))))))

(deftest source-error-message-entity-not-found-test
  (testing "source-error-message produces helpful message for missing entity errors"
    (let [e (ex-info "Database 'clickhouse' was not found"
                     {:path  "Database clickhouse"
                      :model "Database"
                      :id    "clickhouse"
                      :error :metabase-enterprise.serialization.v2.load/not-found})]
      (is (= "Import failed: Database 'clickhouse' does not exist on this instance. Make sure all referenced databases and other dependencies are set up before importing."
             (impl/source-error-message e)))))
  (testing "source-error-message produces helpful message for FK database-not-found errors"
    (let [cause (ex-info "table id present, but database not found: [clickhouse nil some_table]"
                         {:table-id ["clickhouse" nil "some_table"]})
          e     (ex-info "Failed to load into database for Card abc123"
                         {:path "Card abc123"}
                         cause)]
      (is (str/includes? (impl/source-error-message e) "A referenced database does not exist on this instance"))))
  (testing "source-error-message lists each unreadable file with its parse reason (GHY-3887)"
    (let [ingest-err (ex-info "Failed to parse file: collections/transforms/a.yaml"
                              {:file "collections/transforms/a.yaml"
                               :reason "found character '@' that cannot start any token. (Do not use @ for indentation) (line 1, column 1)"})
          e          (ex-info "Failed to read 1 file(s) during ingestion: collections/transforms/a.yaml"
                              {:ingest-errors [ingest-err]
                               :files         ["collections/transforms/a.yaml"]}
                              ingest-err)
          msg        (impl/source-error-message e)]
      (is (str/includes? msg "Failed to read 1 file(s)"))
      (is (str/includes? msg "collections/transforms/a.yaml"))
      (is (str/includes? msg "found character '@'")))))

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
          (is (= {:kind "pull-skipped"} (:outcome result))))))))

(deftest handle-task-result!-stores-outcome-test
  (testing "handle-task-result! records the success result's :outcome on the task (GHY-3747)"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask
                                             {:sync_task_type "import"
                                              :initiated_by (mt/user->id :rasta)})]
        (impl/handle-task-result! {:status :success
                                   :outcome {:kind "pulled" :count 3 :branch "main"}}
                                  task-id)
        (let [task (t2/select-one :model/RemoteSyncTask :id task-id)]
          (is (some? (:ended_at task)))
          (is (= {:kind "pulled" :count 3 :branch "main"} (:outcome task)))
          (is (= :successful (:status (t2/hydrate task :status)))))))))

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
          (is (= "pulled" (get-in result [:outcome :kind])))
          (is (number? (get-in result [:outcome :count]))))))))

;; export! tests

(deftest export!-with-no-source-configured-test
  (testing "export! with no source configured throws"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Remote sync source is not enabled"
                              (impl/export! nil task-id "Test commit")))))))

(deftest export!-with-no-remote-synced-collections-test
  (testing "export! is a no-op success when nothing is dirty (no remote-synced content to export)"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Regular Collection" :type nil :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-transforms false]
            (let [mock-source (test-helpers/create-mock-source)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result))))))))))

(deftest full-export!-errors-with-no-content-test
  (testing "full-export! throws when there is no remote-syncable content"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Regular Collection" :type nil :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-transforms false]
            (let [mock-source (test-helpers/create-mock-source)]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                    #"No remote-syncable content available"
                                    (#'impl/full-export! (source.p/snapshot mock-source) task-id "Test commit" (t/instant)))))))))))

(deftest export!-successful-with-default-collections-test
  (testing "export! successful with default collections"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}]
          (let [mock-source (test-helpers/create-mock-source)
                result (impl/export! (source.p/snapshot mock-source) task-id "Test commit message")]
            (is (= :success (:status result)))))))))

(deftest export!-handles-store-failure-test
  (testing "full-export! surfaces a store failure"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {_coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}]
          (let [mock-source (test-helpers/create-mock-source :fail-mode :store-error)]
            (is (thrown-with-msg? Exception #"Store failed"
                                  (#'impl/full-export! (source.p/snapshot mock-source) task-id "Test commit message" (t/instant))))))))))

(deftest export!-handles-network-errors-during-write-test
  (testing "export! catches a write failure and returns an :error result"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}]
          ;; A pending create makes the export take the incremental write path; the network error there
          ;; must surface as an :error result.
          (t2/insert! :model/RemoteSyncObject {:model_type "Collection" :model_id coll-id :model_name "Test Collection"
                                               :status "create" :status_changed_at (t/offset-date-time)})
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
        ;; Pending creates so the export writes the entities (in production these come from events).
        (t2/insert! :model/RemoteSyncObject
                    [{:model_type "Collection" :model_id coll-id :model_name "Test Collection"
                      :status "create" :status_changed_at (t/offset-date-time)}
                     {:model_type "Card" :model_id card-id :model_name "Test Card"
                      :status "create" :status_changed_at (t/offset-date-time)}])
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
            (is (= "pulled" (get-in import-result [:outcome :kind])))
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
        (let [test-files {"test-branch" {"collections/main/test_collection_1/test_collection_1.yaml"
                                         (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection 1")
                                         "collections/main/test_collection_1/test_card_1.yaml"
                                         (test-helpers/generate-card-yaml "test-card-1xxxxxxxxxx" "Test Card 1" "test-collection-1xxxx")}}
              mock-main (test-helpers/create-mock-source :initial-files test-files :branch "test-branch")
              result (impl/import! (source.p/snapshot mock-main) (:id import-task))]
          (is (= :success (:status result)))
          (is (t2/exists? :model/Card :id card1-id))
          (is (not (t2/exists? :model/Collection :id coll2-id)))
          (is (not (t2/exists? :model/Card :id card2-id))))))))

(deftest import!-records-file-path-test
  (testing "import! records each entity's actual repo file_path on its RemoteSyncObject row, so later
            renames/deletes resolve the real file and stay on the incremental export fast-path"
    (let [import-task (t2/insert-returning-instance! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          coll-path   "collections/main/test_collection_1/test_collection_1.yaml"
          card-path   "collections/main/test_collection_1/test_card_1.yaml"]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection 1" :is_remote_synced true :entity_id "test-collection-1xxxx" :location "/"}
                     :model/Card {card-id :id} {:name "Test Card 1" :collection_id coll-id :entity_id "test-card-1xxxxxxxxxx"}]
        (let [test-files {"test-branch" {coll-path (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection 1")
                                         card-path (test-helpers/generate-card-yaml "test-card-1xxxxxxxxxx" "Test Card 1" "test-collection-1xxxx")}}
              mock-main (test-helpers/create-mock-source :initial-files test-files :branch "test-branch")
              result    (impl/import! (source.p/snapshot mock-main) (:id import-task))]
          (is (= :success (:status result)))
          (is (= coll-path (t2/select-one-fn :file_path :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))
              "the collection's row records the file it was imported from")
          (is (= card-path (t2/select-one-fn :file_path :model/RemoteSyncObject :model_type "Card" :model_id card-id))
              "the card's row records the file it was imported from"))))))

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
          (mt/with-dynamic-fn-redefs [remote-sync.task/update-progress!
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
              (mt/with-dynamic-fn-redefs [remote-sync.task/update-progress!
                                          (fn [task-id progress]
                                            (swap! progress-calls conj {:task-id task-id :progress progress}))]
                (let [result (#'impl/full-export! (source.p/snapshot mock-source) task-id "Test commit" (t/instant))]
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
          (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "collections/main/test_collection/test_card.yaml"
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
            (let [initial-files {"main" {"collections/main/active_collection/active_collection.yaml"
                                         (test-helpers/generate-collection-yaml "active-collection-xxx" "Active Collection")
                                         "collections/main/active_collection/active_card.yaml"
                                         (test-helpers/generate-card-yaml "active-card-xxxxxxxxx" "Active Card" "active-collection-xxx")
                                         "collections/main/removed_collection/removed_collection.yaml"
                                         (test-helpers/generate-collection-yaml "removed-collection-xx" "Removed Collection")
                                         "collections/main/removed_collection/removed_card.yaml"
                                         (test-helpers/generate-card-yaml "removed-card-xxxxxxxx" "Removed Card" "removed-collection-xx")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (some #(str/includes? % "active_collection") (keys files-after-export))
                    "Active collection files should exist after export")
                (is (not (some #(str/includes? % "removed_collection") (keys files-after-export)))
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
            (let [initial-files {"main" {"collections/main/parent_collection/parent_collection.yaml"
                                         (test-helpers/generate-collection-yaml "parent-collection-xx" "Parent Collection")
                                         "collections/main/parent_collection/nested_removed_collection/nested_removed_collection.yaml"
                                         (test-helpers/generate-collection-yaml "nested-removed-collxx" "Nested Removed Collection"
                                                                                :parent-id "parent-collection-xx")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (some #(str/includes? % "parent_collection") (keys files-after-export))
                    "Parent collection files should exist after export")
                (is (some #(str/includes? % "nested_removed_collection") (keys files-after-export))
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
            (let [initial-files {"main" {"collections/main/removed_collection_1/removed_collection_1.yaml"
                                         (test-helpers/generate-collection-yaml "removed-coll-1xxxxxxx" "Removed Collection 1")
                                         "collections/main/removed_collection_1/card_1.yaml"
                                         (test-helpers/generate-card-yaml "card-1-entity-idxxxxx" "Card 1" "removed-coll-1xxxxxxx")
                                         "collections/main/removed_collection_2/removed_collection_2.yaml"
                                         (test-helpers/generate-collection-yaml "removed-coll-2xxxxxxx" "Removed Collection 2")
                                         "collections/main/removed_collection_2/dashboard_1.yaml"
                                         (test-helpers/generate-dashboard-yaml "dash-1-entity-idxxxxx" "Dashboard 1" "removed-coll-2xxxxxxx")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (some #(str/includes? % "active_collection") (keys files-after-export))
                    "Active collection files should exist after export")
                (is (not (some #(str/includes? % "removed_collection_1") (keys files-after-export)))
                    "First removed collection files should be deleted")
                (is (not (some #(str/includes? % "removed_collection_2") (keys files-after-export)))
                    "Second removed collection files should be deleted")))))))))

(deftest finish-remote-config!-sets-default-branch-when-blank-test
  (testing "finish-remote-config! sets default branch when branch setting is blank"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [mock-source (test-helpers/create-mock-source)
            import-started? (atom false)]
        (mt/with-temporary-setting-values [remote-sync-enabled true
                                           remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-branch ""]
          (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)
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
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)
                                        impl/async-import! (fn [& _args] (reset! import-called? true) {:id 123})]
              (let [task-id (impl/finish-remote-config!)]
                (is (= 123 task-id)
                    "Should return task ID from async-import!")
                (is @import-called?
                    "Should call async-import! in read-only mode")))))))))

(deftest finish-remote-config!-does-not-force-transform-deletion-test
  (testing "GHY-3900: the enable-triggered import must not force transform deletion (passes :force-deletion? false)"
    (mt/with-model-cleanup [:model/RemoteSyncTask :model/Collection]
      (let [mock-source    (test-helpers/create-mock-source)
            captured-args  (atom nil)]
        (mt/with-temp [:model/Collection _ {:name "Remote Collection" :is_remote_synced true :location "/"}]
          (mt/with-temporary-setting-values [remote-sync-enabled true
                                             remote-sync-url "https://github.com/test/repo.git"
                                             remote-sync-branch "main"
                                             remote-sync-type :read-only]
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)
                                        impl/async-import! (fn [& args] (reset! captured-args args) {:id 123})]
              (impl/finish-remote-config!)
              (let [[_branch _force? _import-args & kvs] @captured-args]
                (is (false? (:force-deletion? (apply hash-map kvs)))
                    "finish-remote-config! should pass :force-deletion? false so deletions surface as conflicts")))))))))

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
            (mt/with-dynamic-fn-redefs [source/source-from-settings (constantly mock-source)
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
            (mt/with-dynamic-fn-redefs [collection/clear-remote-synced-collection! (fn [] (reset! clear-called? true))]
              (let [result (impl/finish-remote-config!)]
                (is (nil? result)
                    "Should return nil when remote sync is disabled")
                (is @clear-called?
                    "Should call clear-remote-synced-collection!")))))))))

(deftest import!-v57-type-remote-synced-migration-test
  (testing "importing v57 export with type=remote-synced sets is_remote_synced=true and clears type"
    (let [v57-entity-id "v57-collection-xxxx"
          v57-files {"main" {"collections/main/v57_collection/v57_collection.yaml"
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
          v57-files {"main" {"collections/main/v57_parent/v57_parent.yaml"
                             (test-helpers/generate-v57-collection-yaml parent-entity-id "V57 Parent" :type "remote-synced")

                             "collections/main/v57_parent/v57_child/v57_child.yaml"
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
            (let [initial-files {"main" {"databases/test_db/tables/test_table/test_table.yaml"
                                         (test-helpers/generate-table-yaml "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "test_table") (keys files-after-export)))
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
                                         "databases/test_db/tables/test_table/segments/test_segment.yaml"
                                         (test-helpers/generate-segment-yaml "Test Segment" "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "test_segment") (keys files-after-export)))
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
            (let [initial-files {"main" {"databases/test_db/schemas/public/tables/test_table/test_table.yaml"
                                         (test-helpers/generate-table-yaml "test-table" "test-db" :schema "PUBLIC")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "test_table") (keys files-after-export)))
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
                          :type      "library-data"
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
            (let [mock-source (test-helpers/create-mock-source)
                  result (#'impl/full-export! (source.p/snapshot mock-source) task-id "Test commit" (t/instant))]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")
                    file-keys (keys files-after-export)]
                (is (some #(str/includes? % "active_segment") file-keys)
                    "Active segment should be exported")
                (is (not (some #(str/includes? % "archived_segment") file-keys))
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
            (let [initial-files {"main" {"databases/test_db/tables/test_table/segments/archived_segment.yaml"
                                         (test-helpers/generate-segment-yaml "Archived Segment" "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "archived_segment") (keys files-after-export)))
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
          (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test_db/tables/test_table/test_table.yaml"
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
          (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test_db/tables/test_table/fields/test_field.yaml"
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
          (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test_db/tables/test_table/test_table.yaml"
                                    (test-helpers/generate-table-yaml "test-table" "test-db")
                                    "databases/test_db/tables/test_table/fields/test_field.yaml"
                                    (test-helpers/generate-field-yaml "test-field" "test-table" "test-db" :base-type "type/Integer" :database-type "INTEGER")
                                    "databases/test_db/tables/test_table/segments/test_segment.yaml"
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
          (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test_db/schemas/PUBLIC/tables/test_table/test_table.yaml"
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
          (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "collections/main/test_collection/test_model.yaml"
                                    (test-helpers/generate-card-yaml "test-model-xxxxxxxxxx" "Test Model" "test-collection-1xxxx" "model")
                                    "actions/test_action.yaml"
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
          (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
                                    (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                    "databases/test_db/tables/test_table/measures/test_measure.yaml"
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
                                         "databases/test_db/tables/test_table/measures/test_measure.yaml"
                                         (test-helpers/generate-measure-yaml "Test Measure" "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "test_measure") (keys files-after-export)))
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
            (let [mock-source (test-helpers/create-mock-source)
                  result (#'impl/full-export! (source.p/snapshot mock-source) task-id "Test commit" (t/instant))]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")
                    file-keys (keys files-after-export)]
                (is (some #(str/includes? % "active_measure") file-keys)
                    (str "Active measure should be exported. Keys: " (pr-str file-keys)))
                (is (not (some #(str/includes? % "archived_measure") file-keys))
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
            (let [initial-files {"main" {"databases/test_db/tables/test_table/measures/archived_measure.yaml"
                                         (test-helpers/generate-measure-yaml "Archived Measure" "test-table" "test-db")}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)
                  result (impl/export! (source.p/snapshot mock-source) task-id "Test commit")]
              (is (= :success (:status result)))
              (let [files-after-export (get @(:files-atom mock-source) "main")]
                (is (not (some #(str/includes? % "archived_measure") (keys files-after-export)))
                    "Archived measure files should be deleted after export"))
              (testing "RemoteSyncObject entry is cleaned up after export"
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Measure" :model_id measure-id)))
                    "RemoteSyncObject entry for archived measure should have synced status")))))))))

;; Auto-enable transforms tests

(deftest import!-auto-enables-transforms-setting-when-transforms-detected-test
  (testing "import! auto-enables remote-sync-transforms setting only after successful import with transforms"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform :model/RemoteSyncObject]
        (mt/with-temporary-setting-values [remote-sync-transforms false
                                           remote-sync-enabled true]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                transform-entity-id "auto-enable-trans-xxx"
                test-files {"main" {"transforms/test_transform.yaml"
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
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-model-cleanup [:model/RemoteSyncTask :model/PythonLibrary :model/RemoteSyncObject]
        (mt/with-temporary-setting-values [remote-sync-transforms false
                                           remote-sync-enabled true]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                lib-entity-id "auto-enable-lib-xxxxx"
                test-files {"main" {"python-libraries/uncommon.yaml"
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
            (let [test-files {"main" {"collections/main/no_transforms_coll/no_transforms_coll.yaml"
                                      (test-helpers/generate-collection-yaml "no-transforms-coll-xx" "No Transforms Coll")}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)]
              (is (false? (remote-sync.settings/remote-sync-transforms))
                  "remote-sync-transforms should be initially disabled")
              (let [result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result)))
                (is (false? (remote-sync.settings/remote-sync-transforms))
                    "remote-sync-transforms should remain disabled when no transforms in remote")))))))))

(deftest import!-disables-transforms-setting-when-no-transforms-in-branch-test
  (testing "import! disables remote-sync-transforms setting when importing a branch without transforms"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temporary-setting-values [remote-sync-transforms true]
          (mt/with-temp [:model/Collection {_coll-id :id} {:name "Already Enabled Coll" :is_remote_synced true :entity_id "already-enabled-collx" :location "/"}]
            (let [test-files {"main" {"collections/main/already_enabled_coll/already_enabled_coll.yaml"
                                      (test-helpers/generate-collection-yaml "already-enabled-collx" "Already Enabled Coll")}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)]
              (is (true? (remote-sync.settings/remote-sync-transforms))
                  "remote-sync-transforms should be initially enabled")
              (let [result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result)))
                (is (false? (remote-sync.settings/remote-sync-transforms))
                    "remote-sync-transforms should be disabled when no transforms in remote")))))))))

(deftest import!-includes-all-optional-paths-regardless-of-settings-test
  (testing "import! always includes all optional paths (transforms, python-libraries, snippets)"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temporary-setting-values [remote-sync-transforms false]
          (mt/with-temp [:model/Collection {_coll-id :id} {:name "All Paths Coll" :is_remote_synced true :entity_id "all-paths-coll-xxxxxx" :location "/"}]
            (let [test-files {"main" {"collections/main/all_paths_coll/all_paths_coll.yaml"
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
                      (is (some #(str/includes? % "python") filter-strs)
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
      (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
                                (test-helpers/generate-collection-yaml collection/library-entity-id "Another Library")}}
            mock-source (test-helpers/create-mock-source :initial-files test-files)
            result (impl/import! (source.p/snapshot mock-source) task-id)]
        (is (= :conflict (:status result)))
        (is (= #{"Library"} (:conflicts result)))))))

(deftest import!-blocks-if-it-encounters-snippet-conflicts
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
    (mt/with-temp [:model/NativeQuerySnippet _ {:name "Test Snippet"}]
      (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
                                (test-helpers/generate-snippet-yaml "blahblahblah" "A Snippet" "select 123")}}
            mock-source (test-helpers/create-mock-source :initial-files test-files)
            result (impl/import! (source.p/snapshot mock-source) task-id)]
        (is (= :conflict (:status result)))
        (is (= #{"Snippets"} (:conflicts result)))))))

(deftest import!-blocks-if-it-encounters-transform-conflicts
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
    (mt/with-temp [:model/Transform _ {:name "Test Transform"}]
      (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
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
        (let [test-files {"main" {"collections/main/lib/lib.yaml"
                                  (test-helpers/generate-collection-yaml collection/library-entity-id "Remote Library")
                                  "collections/main/snip/snip.yaml"
                                  (test-helpers/generate-snippet-yaml "snip-entity-id" "Remote Snippet" "select 1")
                                  "collections/main/trans/trans.yaml"
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
        (let [test-files {"main" {"collections/main/lib/lib.yaml"
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
        (mt/with-dynamic-fn-redefs [remote-sync.task/last-version (constantly "previous-version")]
          (let [test-files {"main" {"collections/main/lib/lib.yaml"
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
        (let [test-files {"main" {"collections/main/lib/lib.yaml"
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
        (let [test-files {"main" {"collections/main/test_collection/test_collection.yaml"
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
        (let [test-files {"main" {"collections/main/test_coll/test_coll.yaml"
                                  (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                  "transforms/remote_transform.yaml"
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
        (let [test-files {"main" {"collections/main/test_coll/test_coll.yaml"
                                  (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                  "snippets/remote_snippet.yaml"
                                  (test-helpers/generate-snippet-yaml "test-snippet-xxxxxxx" "Remote Snippet" "SELECT 1")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :conflict (:status result)))
          (is (contains? (:conflicts result) "Snippets"))
          (is (some #(= :snippets-conflict (:type %)) (:conflict-details result))))))))

(deftest transforms-namespace-collection-conflict-test
  (testing "import with transforms-namespace Collection + local unsynced transforms-namespace Collection = conflict"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection _ {:name "Local Transforms" :namespace "transforms"}]
          (let [test-files {"main" {"collections/main/txns_coll/txns_coll.yaml"
                                    (test-helpers/generate-collection-yaml "txns-coll-xxxxxxxxx" "Txns Coll")
                                    "collections/transforms/remote_transforms/remote_transforms.yaml"
                                    (test-helpers/generate-collection-yaml "txns-ns-coll-xxxxxxx" "Remote Transforms"
                                                                           :namespace "transforms")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :conflict (:status result)))
            (is (contains? (:conflicts result) "Transforms"))
            (is (some #(= :transforms-conflict (:type %)) (:conflict-details result)))))))))

(deftest snippets-namespace-collection-conflict-test
  (testing "import with snippets-namespace Collection + local unsynced snippets-namespace Collection = conflict"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection _ {:name "Local Snippets" :namespace "snippets"}]
          (let [test-files {"main" {"collections/main/snip_coll/snip_coll.yaml"
                                    (test-helpers/generate-collection-yaml "snip-coll-xxxxxxxxx" "Snip Coll")
                                    "collections/snippets/remote_snippets/remote_snippets.yaml"
                                    (test-helpers/generate-collection-yaml "snip-ns-coll-xxxxxxx" "Remote Snippets"
                                                                           :namespace "snippets")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :conflict (:status result)))
            (is (contains? (:conflicts result) "Snippets"))
            (is (some #(= :snippets-conflict (:type %)) (:conflict-details result)))))))))

(deftest no-conflict-when-namespace-collections-synced-test
  (testing "no conflict when local namespace collections are fully tracked in RemoteSyncObject"
    (mt/with-model-cleanup [:model/Collection :model/RemoteSyncObject :model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (mt/with-temp [:model/Collection coll {:name "Local Transforms" :namespace "transforms"
                                               :entity_id "syncd-ns-coll-xxxxxxx"}
                       :model/RemoteSyncObject _ {:model_type "Collection"
                                                  :model_id (:id coll)
                                                  :model_name "Local Transforms"
                                                  :status "synced"
                                                  :status_changed_at (t/offset-date-time)}]
          (doseq [coll-id (t2/select-pks-vec :model/Collection :namespace [:in ["transforms" "snippets"]])
                  :when (not= coll-id (:id coll))]
            (when-not (t2/exists? :model/RemoteSyncObject :model_type "Collection" :model_id coll-id)
              (t2/insert! :model/RemoteSyncObject {:model_type "Collection"
                                                   :model_id coll-id
                                                   :model_name "synced"
                                                   :status "synced"
                                                   :status_changed_at (t/offset-date-time)})))
          (let [test-files {"main" {"collections/main/syncd_coll/syncd_coll.yaml"
                                    (test-helpers/generate-collection-yaml "syncd-coll-xxxxxxxxx" "Syncd Coll")
                                    "collections/transforms/remote_transforms/remote_transforms.yaml"
                                    (test-helpers/generate-collection-yaml "syncd-ns-coll-xxxxxxx" "Remote Transforms"
                                                                           :namespace "transforms")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (not= :conflict (:status result))
                "Should not detect a conflict when all local namespace collections are synced")
            (is (nil? (seq (:conflict-details result))))))))))

(deftest no-conflict-when-no-local-namespace-collections-test
  (testing "no conflict when import has namespace collections but local has none (or all are synced)"
    (mt/with-model-cleanup [:model/Collection :model/RemoteSyncObject :model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (doseq [coll-id (t2/select-pks-vec :model/Collection :namespace [:in ["transforms" "snippets"]])]
          (when-not (t2/exists? :model/RemoteSyncObject :model_type "Collection" :model_id coll-id)
            (t2/insert! :model/RemoteSyncObject {:model_type "Collection"
                                                 :model_id coll-id
                                                 :model_name "pre-existing"
                                                 :status "synced"
                                                 :status_changed_at (t/offset-date-time)})))
        (let [test-files {"main" {"collections/main/noloc_coll/noloc_coll.yaml"
                                  (test-helpers/generate-collection-yaml "noloc-coll-xxxxxxxxx" "Noloc Coll")
                                  "collections/transforms/remote_transforms/remote_transforms.yaml"
                                  (test-helpers/generate-collection-yaml "noloc-tx-coll-xxxxxx" "Remote Transforms"
                                                                         :namespace "transforms")
                                  "collections/snippets/remote_snippets/remote_snippets.yaml"
                                  (test-helpers/generate-collection-yaml "noloc-sn-coll-xxxxxx" "Remote Snippets"
                                                                         :namespace "snippets")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (not= :conflict (:status result))
              "Should not detect a conflict when local has no unsynced namespace collections")
          (is (nil? (seq (:conflict-details result)))))))))

(deftest import!-old-format-paths-test
  (testing "import! can load content stored at old-format paths (entity_id in name)"
    (mt/with-model-cleanup [:model/RemoteSyncTask]
      (let [task-id     (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
            coll-eid    "old-fmt-coll-xxxxxxxx"
            ;; Old-format paths: entity_id in filename
            test-files  {"main" {(str "collections/" coll-eid "_test_collection/" coll-eid "_test_collection.yaml")
                                 (test-helpers/generate-collection-yaml coll-eid "Test Collection")}}
            mock-source (test-helpers/create-mock-source :initial-files test-files)
            result      (impl/import! (source.p/snapshot mock-source) task-id)]
        (is (= :success (:status result))
            "import should succeed with old-format paths")
        (is (t2/exists? :model/Collection :entity_id coll-eid)
            "collection should have been imported from old-format path")))))

;; ---------- GHY-3505: captured-branch race ---------------------------------------------------------
;;
;; The original repros for GHY-3505 demonstrated the captured-branch race by writing the setting
;; directly via `setting/set!`, simulating a path that bypassed all coordination. With the
;; operation-level guards in place (see *-refuses-while-task-running-test below and the
;; corresponding API-level tests in api_test.clj), the race is no longer reachable through any
;; user-facing path: every code that mutates remote-sync state now calls `guards/ensure-no-active-task!`
;; first and refuses with 400 if a RemoteSyncTask is in flight.
;;
;; Coverage of the fix is split across:
;;   - guards-test (the predicate itself: catches stalled tasks too)
;;   - operation-level guard tests in this file, core_test, settings_test
;;   - API-level guard tests in api_test
;;
;; As a defense-in-depth measure for any future code path that bypasses the guards, async-import!
;; and async-export! capture the setting at scheduling time and the work function aborts if it
;; observes a different setting at start. This is not separately tested because the window in
;; which the setting could change between scheduling and start is sub-millisecond.

;; ---------- Guard contract: mutating operations must refuse while a task is running ----------------
;;
;; Every mutating remote-sync operation consults `guards/task-running?` and refuses if it returns
;; true. The tests use `with-redefs` to flip it to `(constantly true)` so they don't depend on
;; actually inserting a RemoteSyncTask row.

(deftest async-import!-refuses-while-task-running-test
  (testing "async-import! must refuse when guards/task-running? returns true,
            without creating a RemoteSyncTask row"
    (mt/with-temporary-setting-values [remote-sync-enabled true
                                       remote-sync-url     "https://github.com/test/repo.git"
                                       remote-sync-token   "token"
                                       remote-sync-branch  "main"
                                       remote-sync-type    :read-write]
      (with-redefs [guards/task-running?        (constantly true)
                    source/source-from-settings (fn [& _] (test-helpers/create-mock-source))]
        (is (thrown-with-msg? Exception #"Remote sync task in progress"
                              (impl/async-import! "main" true {})))
        (is (zero? (t2/count :model/RemoteSyncTask))
            "no RemoteSyncTask row should be created when the guard fires")))))

(deftest async-export!-refuses-while-task-running-test
  (testing "async-export! must refuse when guards/task-running? returns true,
            without creating a RemoteSyncTask row"
    (mt/with-temporary-setting-values [remote-sync-enabled true
                                       remote-sync-url     "https://github.com/test/repo.git"
                                       remote-sync-token   "token"
                                       remote-sync-branch  "main"
                                       remote-sync-type    :read-write]
      (with-redefs [guards/task-running?        (constantly true)
                    source/source-from-settings (fn [& _] (test-helpers/create-mock-source))]
        (is (thrown-with-msg? Exception #"Remote sync task in progress"
                              (impl/async-export! "main" true "msg")))
        (is (zero? (t2/count :model/RemoteSyncTask))
            "no RemoteSyncTask row should be created when the guard fires")))))

(deftest create-branch!-refuses-while-task-running-test
  (testing "create-branch! must refuse when guards/task-running? returns true,
            without pushing a branch to the source or changing the setting"
    (mt/with-temporary-setting-values [remote-sync-enabled true
                                       remote-sync-url     "https://github.com/test/repo.git"
                                       remote-sync-token   "token"
                                       remote-sync-branch  "main"
                                       remote-sync-type    :read-write]
      (let [mock-source      (test-helpers/create-mock-source)
            initial-branches @(:branches-atom mock-source)]
        (with-redefs [guards/task-running?        (constantly true)
                      source/source-from-settings (fn [& _] mock-source)]
          (is (thrown-with-msg? Exception #"Remote sync task in progress"
                                (impl/create-branch! "feature-x" "main")))
          (is (= "main" (remote-sync.settings/remote-sync-branch))
              "remote-sync-branch must remain unchanged when the guard fires")
          (is (= initial-branches @(:branches-atom mock-source))
              "no new branch should be pushed to the source when the guard fires"))))))

(deftest stash!-refuses-while-task-running-test
  (testing "stash! must refuse when guards/task-running? returns true,
            without pushing a branch to the source, creating a task, or changing the setting"
    (mt/with-temporary-setting-values [remote-sync-enabled true
                                       remote-sync-url     "https://github.com/test/repo.git"
                                       remote-sync-token   "token"
                                       remote-sync-branch  "main"
                                       remote-sync-type    :read-write]
      (let [mock-source      (test-helpers/create-mock-source)
            initial-branches @(:branches-atom mock-source)]
        (with-redefs [guards/task-running?        (constantly true)
                      source/source-from-settings (fn [& _] mock-source)]
          (is (thrown-with-msg? Exception #"Remote sync task in progress"
                                (impl/stash! "stash-branch" "stash message")))
          (is (= "main" (remote-sync.settings/remote-sync-branch))
              "remote-sync-branch must remain unchanged when the guard fires")
          (is (= initial-branches @(:branches-atom mock-source))
              "no new branch should be pushed to the source when the guard fires")
          (is (zero? (t2/count :model/RemoteSyncTask))
              "no RemoteSyncTask row should be created when the guard fires"))))))

;; ---------- handle-task-result! is robust against double-handling -----------------------------
;;
;; If an admin cancels a task via POST /current-task/cancel while its virtual thread is still
;; running, the thread will eventually reach handle-task-result!. Without protection, the :success
;; path would write the captured branch (stomping any setting change since cancellation) and
;; complete-sync-task! would overwrite the cancellation bookkeeping. The check at the top of
;; handle-task-result! short-circuits when the task is already terminated.

(deftest handle-task-result!-skips-already-terminated-task-test
  (testing "handle-task-result! must not write the setting or update the task row when the task
            is already terminated (e.g., cancelled by admin while the virtual thread was running)"
    (mt/with-temporary-setting-values [remote-sync-branch "dev"]
      (let [task-id (t2/insert-returning-pk!
                     :model/RemoteSyncTask
                     {:sync_task_type "import"
                      :initiated_by   (mt/user->id :rasta)
                      :started_at     (t/offset-date-time)
                      :ended_at       (t/offset-date-time)
                      :cancelled      true
                      :error_message  "Cancelled by admin"
                      :progress       0.5})]
        (impl/handle-task-result! {:status :success :version "abc"} task-id "feature-x")
        (is (= "dev" (remote-sync.settings/remote-sync-branch))
            "setting must remain unchanged — already-terminated task must not write it")
        (let [task-after (t2/select-one :model/RemoteSyncTask :id task-id)]
          (is (true? (:cancelled task-after))
              "cancellation bookkeeping must be preserved")
          (is (= "Cancelled by admin" (:error_message task-after))
              "error message must be preserved")
          (is (= 0.5 (double (:progress task-after)))
              "progress must not be overwritten to 1.0"))))))

;; ---------- create-task-with-lock! integrates supersession ------------------------------------
;;
;; The auto-import path (task/import.clj) calls create-task-with-lock! directly, without going
;; through the strict ensure-no-active-task! guard. So when an auto-import runs and finds the
;; previous task to be stale, supersede-stale-tasks! cleans up the stale row before inserting
;; the new one. This is the self-healing behavior we want for automatic operations.

(deftest create-task-with-lock!-supersedes-stale-tasks-test
  (testing "create-task-with-lock! marks stale tasks superseded before creating a new task,
            so auto-imports recover after a JVM/thread death"
    (let [old-time (t/minus (t/offset-date-time) (t/hours 1))
          stale-task (t2/insert-returning-instance!
                      :model/RemoteSyncTask
                      {:sync_task_type          "import"
                       :initiated_by            (mt/user->id :rasta)
                       :started_at              old-time
                       :last_progress_report_at old-time
                       :progress                0.5})
          new-task (impl/create-task-with-lock! "import")]
      (let [stale-after (t2/select-one :model/RemoteSyncTask :id (:id stale-task))]
        (is (true? (:cancelled stale-after))
            "stale task must be marked cancelled")
        (is (some? (:ended_at stale-after))
            "stale task must be terminated"))
      (is (some? (:id new-task))
          "new task must be created")
      (is (nil? (:ended_at new-task))
          "new task must be active")
      (is (not (:existing? new-task))
          "new task must not be marked as existing"))))

;;; ------------------------------------- export! divergence / merge tests -------------------------------------

(defn- export-test-snapshot
  "A minimal SourceSnapshot reporting a fixed `version`."
  [version]
  (reify source.p/SourceSnapshot
    (version [_] version)
    (list-files [_] [])
    (read-file [_ _] nil)
    (write-files! [_ _ _] version)
    (apply-changes! [_ _ _ _] version)))

(defn- export-test-source
  "A minimal Source whose snapshot-at returns a snapshot at the requested version."
  []
  (reify source.p/Source
    (branches [_] ["main"])
    (create-branch [_ _ _] nil)
    (default-branch [_] "main")
    (snapshot [_] (export-test-snapshot "remote-R"))
    (snapshot-at [_ v] (export-test-snapshot v))))

(deftest export!-merges-non-conflicting-remote-changes-test
  (testing "when the remote advanced and the merge is clean, export! merges, advances the version, and reconciles local"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (let [reconciled (atom nil)]
        (with-redefs [remote-sync.task/last-version    (constantly "base-B")
                      spec/extract-entities-for-export (constantly [{:dummy true}])
                      source/merge-and-store!          (fn [_ _ _ _ _]
                                                         {:status :success :version "merged-M"
                                                          :summary {:added 2 :updated 1 :removed 0}})
                      impl/load-snapshot!              (fn [snap _ _ & {:keys [finalize!]}]
                                                         (reset! reconciled (source.p/version snap))
                                                         (when finalize! (finalize!)))]
          (let [result (impl/export! (export-test-snapshot "remote-R") task-id "msg"
                                     :merge? true
                                     :source (export-test-source)
                                     :base-snapshot (export-test-snapshot "base-B"))]
            (is (= :success (:status result)))
            (is (= {:added 2 :updated 1 :removed 0} (:merge-summary result)))
            (is (= "merged-M" @reconciled)
                "the merged result is loaded back into the local app DB (the pull half)")
            (is (= "merged-M" (:version (t2/select-one :model/RemoteSyncTask :id task-id))))))))))

(deftest export!-blocks-on-genuine-conflict-test
  (testing "when the same entity changed on both sides, export! returns :conflict without advancing the version or reconciling"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (let [reconciled? (atom false)]
        (with-redefs [remote-sync.task/last-version    (constantly "base-B")
                      spec/extract-entities-for-export (constantly [{:dummy true}])
                      source/merge-and-store!          (fn [_ _ _ _ _]
                                                         {:status :conflict
                                                          :conflicts [{:key [["Card" "A"]]
                                                                       :ours {:path "collections/a.yaml" :content "x"}
                                                                       :theirs {:path "collections/a.yaml" :content "y"}}]
                                                          :summary {:added 0 :updated 0 :removed 0}})
                      impl/load-snapshot!              (fn [_ _ _] (reset! reconciled? true))]
          (let [result (impl/export! (export-test-snapshot "remote-R") task-id "msg"
                                     :merge? true
                                     :source (export-test-source)
                                     :base-snapshot (export-test-snapshot "base-B"))]
            (is (= :conflict (:status result)))
            (is (= ["Card A (collections/a.yaml)"] (:conflicts result)))
            (is (false? @reconciled?) "no reconcile happens on conflict")
            (is (nil? (:version (t2/select-one :model/RemoteSyncTask :id task-id)))
                "the task version is not advanced on conflict")))))))

(deftest export!-merge-fails-when-merged-commit-unresolvable-test
  (testing "if the pushed merge commit can't be resolved locally, export! fails loudly without advancing the version or reconciling"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export" :version "base-B"}]
      (let [reconciled?       (atom false)
            no-resolve-source (reify source.p/Source
                                (branches [_] ["main"])
                                (create-branch [_ _ _] nil)
                                (default-branch [_] "main")
                                (snapshot [_] (export-test-snapshot "remote-R"))
                                (snapshot-at [_ _] nil))]
        (with-redefs [remote-sync.task/last-version    (constantly "base-B")
                      spec/extract-entities-for-export (constantly [{:dummy true}])
                      source/merge-and-store!          (fn [_ _ _ _ _]
                                                         {:status :success :version "merged-M"
                                                          :summary {:added 1 :updated 0 :removed 0}})
                      impl/load-snapshot!              (fn [_ _ _ & _] (reset! reconciled? true))]
          (let [result (impl/export! (export-test-snapshot "remote-R") task-id "msg"
                                     :merge? true
                                     :source no-resolve-source
                                     :base-snapshot (export-test-snapshot "base-B"))]
            (is (= :error (:status result)))
            (is (false? @reconciled?) "no reconcile load happens when the merged commit can't be resolved")
            (is (= "base-B" (:version (t2/select-one :model/RemoteSyncTask :id task-id)))
                "the version is not advanced past the un-reconciled state, so a retry re-merges")))))))

(deftest export!-conflict-when-merge-base-unreachable-test
  (testing "when merge is requested but the merge base is gone (force-push/rebase), export! returns :conflict"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (with-redefs [remote-sync.task/last-version    (constantly "base-B")
                    spec/extract-entities-for-export (constantly [{:dummy true}])]
        (let [result (impl/export! (export-test-snapshot "remote-R") task-id "msg"
                                   :merge? true
                                   :source (export-test-source)
                                   :base-snapshot nil)]
          (is (= :conflict (:status result)))
          (is (str/includes? (:message result) "rewritten")))))))

(deftest export!-refuses-when-diverged-without-merge-flag-test
  (testing "when the remote advanced and neither force? nor merge? is set, export! refuses without writing or merging"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (let [merged? (atom false)
            stored? (atom false)]
        (with-redefs [remote-sync.task/last-version    (constantly "base-B")
                      spec/extract-entities-for-export (constantly [{:dummy true}])
                      source/merge-and-store!          (fn [_ _ _ _ _] (reset! merged? true) {:status :success})
                      source/store!                    (fn [_ _ _ _] (reset! stored? true) "v")]
          (let [result (impl/export! (export-test-snapshot "remote-R") task-id "msg"
                                     :source (export-test-source)
                                     :base-snapshot (export-test-snapshot "base-B"))]
            (is (= :conflict (:status result)))
            (is (false? @merged?) "no merge without the merge flag")
            (is (false? @stored?) "nothing written")
            (is (nil? (:version (t2/select-one :model/RemoteSyncTask :id task-id))))))))))

(deftest export!-force-overwrites-without-merging-test
  (testing "force? overwrites the remote wholesale (full export) even when it advanced — no merge"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (let [merged? (atom false)]
        (with-redefs [remote-sync.task/last-version    (constantly "base-B")
                      spec/extract-entities-for-export (constantly [{:dummy true}])
                      source/merge-and-store!          (fn [& _] (reset! merged? true) {:status :success})
                      ;; force? routes through full-export!, which uses store!'s {:version :entries} result.
                      source/store!                    (fn [& _] {:version "forced-version" :entries []})]
          (let [result (impl/export! (export-test-snapshot "remote-R") task-id "msg"
                                     :force? true
                                     :source (export-test-source)
                                     :base-snapshot (export-test-snapshot "base-B"))]
            (is (= :success (:status result)))
            (is (false? @merged?) "force? skips the merge path")
            (is (= "forced-version" (:version (t2/select-one :model/RemoteSyncTask :id task-id))))))))))

(deftest export!-no-merge-when-not-diverged-test
  (testing "when the remote has not advanced, export! takes the normal (non-merge) export path"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "export"}]
      (let [merged? (atom false)]
        ;; remote-sync.task/last-version equals the snapshot version, so not diverged. No dirty RemoteSyncObject
        ;; rows and the snapshot lists no files, so the normal export path is a no-op success — and crucially
        ;; never reaches the merge path.
        (with-redefs [remote-sync.task/last-version    (constantly "remote-R")
                      spec/extract-entities-for-export (constantly [{:dummy true}])
                      source/merge-and-store!          (fn [& _] (reset! merged? true) {:status :success})]
          (let [result (impl/export! (export-test-snapshot "remote-R") task-id "msg"
                                     :source (export-test-source)
                                     :base-snapshot (export-test-snapshot "remote-R"))]
            (is (= :success (:status result)))
            (is (false? @merged?) "no merge when not diverged")))))))

;;; ------------------------------------- export preflight tests -------------------------------------

(deftest preview-export-merge-not-diverged-test
  (testing "preview reports no changes when the remote has not advanced"
    (with-redefs [remote-sync.task/last-version (constantly "remote-R") ; == snapshot version
                  source/source-from-settings   (constantly (export-test-source))]
      (is (= {:diverged? false :clean? true :conflicts [] :summary {:added 0 :updated 0 :removed 0}
              :force-push-casualties {:deleted [] :overwritten []}}
             (impl/preview-export-merge "main"))))))

(deftest preview-export-merge-clean-test
  (testing "preview reports a clean merge with a summary when changes don't conflict"
    (with-redefs [remote-sync.task/last-version    (constantly "base-B")
                  source/source-from-settings      (constantly (export-test-source))
                  spec/extract-entities-for-export (constantly [{:dummy true}])
                  source/preview-merge             (fn [_ _ _ _]
                                                     {:clean? true :conflicts []
                                                      :summary {:added 1 :updated 0 :removed 0}})]
      (is (= {:diverged? true :clean? true :conflicts [] :summary {:added 1 :updated 0 :removed 0}}
             (impl/preview-export-merge "main"))))))

(deftest preview-export-merge-conflict-test
  (testing "preview reports conflicts when the same entity changed on both sides"
    (with-redefs [remote-sync.task/last-version    (constantly "base-B")
                  source/source-from-settings      (constantly (export-test-source))
                  spec/extract-entities-for-export (constantly [{:dummy true}])
                  source/preview-merge             (fn [_ _ _ _]
                                                     {:clean? false :conflicts ["Card A (collections/a.yaml)"]
                                                      :summary {:added 0 :updated 0 :removed 0}})]
      (is (= {:diverged? true :clean? false
              :conflicts ["Card A (collections/a.yaml)"]
              :summary {:added 0 :updated 0 :removed 0}}
             (impl/preview-export-merge "main"))))))

(deftest preview-export-merge-history-rewritten-test
  (testing "preview reports :history-rewritten when the merge base is gone"
    (let [no-base-source (reify source.p/Source
                           (branches [_] ["main"])
                           (create-branch [_ _ _] nil)
                           (default-branch [_] "main")
                           (snapshot [_] (export-test-snapshot "remote-R"))
                           (snapshot-at [_ _] nil))]
      (with-redefs [remote-sync.task/last-version        (constantly "gone-base")
                    source/source-from-settings          (constantly no-base-source)
                    spec/extract-entities-for-export     (constantly [{:dummy true}])
                    source/force-push-casualties-no-base (fn [_ _] {:deleted ["Audit Logs"] :overwritten []})]
        (let [result (impl/preview-export-merge "main")]
          (is (true? (:diverged? result)))
          (is (false? (:clean? result)))
          (is (= :history-rewritten (:reason result)))
          (testing "force-push casualties are still computed without a merge base"
            (is (= {:deleted ["Audit Logs"] :overwritten []}
                   (:force-push-casualties result)))))))))

;;; ------------------------------------- local-only pull merge tests -------------------------------------

(deftest import!-merge-keeps-local-changes-test
  (testing "a local-only merge loads remote changes, preserves un-pushed local changes as dirty, and sets version to remote"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "import"}
                   ;; a pending local change (un-pushed) and an already-synced object
                   :model/RemoteSyncObject _ {:model_type "Card" :model_id 9991 :status "update"
                                              :model_name "Local Card" :status_changed_at :%now}
                   :model/RemoteSyncObject _ {:model_type "Card" :model_id 9992 :status "synced"
                                              :model_name "Remote Card" :status_changed_at :%now}]
      (with-redefs [source/compute-merge (fn [_ _ _ _]
                                           {:merged   [{:path "collections/x.yaml" :content "y"}]
                                            :conflicts []
                                            :summary  {:added 1 :updated 0 :removed 0}})
                    ;; simulate the load marking everything synced (what sync-objects! does), then running
                    ;; the in-transaction finalize (restore-dirty + set-version)
                    impl/load-snapshot!  (fn [_ _ _ & {:keys [finalize!]}]
                                           (t2/update! :model/RemoteSyncObject
                                                       :model_id [:in [9991 9992]]
                                                       {:status "synced"})
                                           (when finalize! (finalize!)))]
        (let [result (impl/import! (export-test-snapshot "remote-R") task-id
                                   :merge? true
                                   :base-snapshot (export-test-snapshot "base-B"))]
          (is (= :success (:status result)))
          (is (= {:added 1 :updated 0 :removed 0} (:merge-summary result)))
          (is (= "remote-R" (:version (t2/select-one :model/RemoteSyncTask :id task-id)))
              "version advances to the remote tip; local changes remain to be pushed")
          (testing "the un-pushed local change is restored to dirty after the merge"
            (is (= "update" (t2/select-one-fn :status :model/RemoteSyncObject :model_id 9991))))
          (testing "remote-originated content stays synced"
            (is (= "synced" (t2/select-one-fn :status :model/RemoteSyncObject :model_id 9992)))))))))

(deftest import!-merge-restores-pending-deletion-test
  (testing "a pending local deletion (no app-db row) is re-inserted as dirty after a merge"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "import"}
                   :model/RemoteSyncObject _ {:model_type "Card" :model_id 8881 :status "delete"
                                              :model_name "Deleted Card" :status_changed_at :%now}]
      (with-redefs [source/compute-merge (fn [_ _ _ _]
                                           {:merged [] :conflicts [] :summary {:added 0 :updated 0 :removed 0}})
                    ;; simulate the load wiping and not re-inserting the deleted entity's row, then the
                    ;; in-transaction finalize (restore-dirty + set-version)
                    impl/load-snapshot!  (fn [_ _ _ & {:keys [finalize!]}]
                                           (t2/delete! :model/RemoteSyncObject :model_id 8881)
                                           (when finalize! (finalize!)))]
        (let [result (impl/import! (export-test-snapshot "remote-R") task-id
                                   :merge? true
                                   :base-snapshot (export-test-snapshot "base-B"))]
          (is (= :success (:status result)))
          (is (= "delete" (t2/select-one-fn :status :model/RemoteSyncObject :model_id 8881))
              "the pending deletion is preserved so it can be pushed later"))))))

(deftest import!-merge-folds-remote-change-and-keeps-local-deletion-test
  (testing "a single pull merge folds in an unrelated remote change while preserving a pending local deletion as dirty"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "import"}
                   ;; a pending local deletion (no app-db row) and a synced remote-origin card
                   :model/RemoteSyncObject _ {:model_type "Card" :model_id 8881 :status "delete"
                                              :model_name "Locally Deleted" :status_changed_at :%now}
                   :model/RemoteSyncObject _ {:model_type "Card" :model_id 9992 :status "synced"
                                              :model_name "Remote Card" :status_changed_at :%now}]
      (with-redefs [source/compute-merge (fn [_ _ _ _]
                                           {:merged   [{:path "collections/remote.yaml" :content "y"}]
                                            :conflicts []
                                            :summary  {:added 0 :updated 1 :removed 0}})
                    ;; simulate the load: the remote change is applied (9992 stays synced), the deleted
                    ;; entity's row is wiped (the load doesn't re-create it), then the finalize runs.
                    impl/load-snapshot! (fn [_ _ _ & {:keys [finalize!]}]
                                          (t2/delete! :model/RemoteSyncObject :model_id 8881)
                                          (t2/update! :model/RemoteSyncObject :model_id 9992 {:status "synced"})
                                          (when finalize! (finalize!)))]
        (let [result (impl/import! (export-test-snapshot "remote-R") task-id
                                   :merge? true
                                   :base-snapshot (export-test-snapshot "base-B"))]
          (is (= :success (:status result)))
          (is (= {:added 0 :updated 1 :removed 0} (:merge-summary result)))
          (testing "the unrelated remote change is folded in (stays synced)"
            (is (= "synced" (t2/select-one-fn :status :model/RemoteSyncObject :model_id 9992))))
          (testing "the pending local deletion is preserved as dirty (re-inserted by restore-dirty-objects!)"
            (is (= "delete" (t2/select-one-fn :status :model/RemoteSyncObject :model_id 8881))))
          (is (= "remote-R" (:version (t2/select-one :model/RemoteSyncTask :id task-id)))
              "the version advances to the remote tip"))))))

(deftest import!-merge-conflict-test
  (testing "a local-only merge with a genuine conflict returns :conflict and does not load"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "import"}]
      (with-redefs [source/compute-merge (fn [_ _ _ _]
                                           {:merged []
                                            :conflicts [{:key [["Card" "A"]]
                                                         :ours {:path "collections/a.yaml" :content "x"}
                                                         :theirs {:path "collections/a.yaml" :content "z"}}]
                                            :summary {:added 0 :updated 0 :removed 0}})
                    impl/load-snapshot!  (fn [_ _ _] (throw (ex-info "should not load on conflict" {})))]
        (let [result (impl/import! (export-test-snapshot "remote-R") task-id
                                   :merge? true
                                   :base-snapshot (export-test-snapshot "base-B"))]
          (is (= :conflict (:status result)))
          (is (= ["Card A (collections/a.yaml)"] (:conflicts result)))
          (is (nil? (:version (t2/select-one :model/RemoteSyncTask :id task-id)))))))))

(deftest import!-merge-history-rewritten-test
  (testing "a local-only merge with no reachable base returns :conflict"
    (mt/with-temp [:model/RemoteSyncTask {task-id :id} {:sync_task_type "import"}]
      (let [result (impl/import! (export-test-snapshot "remote-R") task-id
                                 :merge? true
                                 :base-snapshot nil)]
        (is (= :conflict (:status result)))
        (is (str/includes? (:message result) "rewritten"))))))
