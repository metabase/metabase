(ns metabase-enterprise.remote-sync.snippets-test
  "Tests for snippet sync functionality in remote-sync.
   Snippets are synced globally when the Library collection is remote-synced."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.events :as rs-events]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as sync-object]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.events.core :as events]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- clean-remote-sync-state
  "Test fixture that cleans up remote sync state before and after each test."
  [f]
  (try
    (t2/delete! :model/RemoteSyncObject)
    (f)
    (finally
      (t2/delete! :model/RemoteSyncObject))))

#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each (fn [f]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
                        (clean-remote-sync-state f))))

;;; ------------------------------------------- Event Handler Tests -------------------------------------------

(deftest snippet-event-creates-sync-object-when-library-synced-test
  (testing "Creating a snippet creates a RemoteSyncObject entry when Library is remote-synced"
    (collections.tu/with-library-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/NativeQuerySnippet snippet {:name "Test Snippet" :content "SELECT 1"}]
          (events/publish-event! :event/snippet-create {:object snippet :user-id (mt/user->id :rasta)})
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "NativeQuerySnippet"
                          :model_id (:id snippet))
              "Snippet should be tracked when Library is remote-synced"))))))

(deftest snippet-event-ignored-when-library-not-synced-test
  (testing "Snippet events are ignored when Library is not remote-synced"
    (collections.tu/with-library-not-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/NativeQuerySnippet snippet {:name "Test Snippet" :content "SELECT 1"}]
          (events/publish-event! :event/snippet-create {:object snippet :user-id (mt/user->id :rasta)})
          (is (not (t2/exists? :model/RemoteSyncObject
                               :model_type "NativeQuerySnippet"
                               :model_id (:id snippet)))
              "Snippet should NOT be tracked when Library is not remote-synced"))))))

(deftest snippet-event-updates-sync-object-test
  (testing "Updating a snippet updates the RemoteSyncObject entry when Library is synced"
    (collections.tu/with-library-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/NativeQuerySnippet snippet {:name "Test Snippet" :content "SELECT 1"}]
          ;; Delete auto-created entry from snippet creation event and set up test state
          (t2/delete! :model/RemoteSyncObject :model_type "NativeQuerySnippet" :model_id (:id snippet))
          (mt/with-temp [:model/RemoteSyncObject _rso {:model_type "NativeQuerySnippet"
                                                       :model_id (:id snippet)
                                                       :model_name "Test Snippet"
                                                       :status "synced"
                                                       :status_changed_at (t/offset-date-time)}]
            (events/publish-event! :event/snippet-update {:object snippet :user-id (mt/user->id :rasta)})
            (let [entry (t2/select-one :model/RemoteSyncObject
                                       :model_type "NativeQuerySnippet"
                                       :model_id (:id snippet))]
              (is (= "update" (:status entry))
                  "Snippet should have 'update' status after modification"))))))))

(deftest archived-snippet-marked-for-deletion-test
  (testing "Archiving a snippet marks it for deletion when Library is synced"
    (collections.tu/with-library-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/NativeQuerySnippet snippet {:name "Test Snippet" :content "SELECT 1"}]
          ;; Delete auto-created entry from snippet creation event and set up test state
          (t2/delete! :model/RemoteSyncObject :model_type "NativeQuerySnippet" :model_id (:id snippet))
          (mt/with-temp [:model/RemoteSyncObject _rso {:model_type "NativeQuerySnippet"
                                                       :model_id (:id snippet)
                                                       :model_name "Test Snippet"
                                                       :status "synced"
                                                       :status_changed_at (t/offset-date-time)}]
            (let [archived-snippet (assoc snippet :archived true)]
              (events/publish-event! :event/snippet-update {:object archived-snippet :user-id (mt/user->id :rasta)})
              (let [entry (t2/select-one :model/RemoteSyncObject
                                         :model_type "NativeQuerySnippet"
                                         :model_id (:id snippet))]
                (is (= "delete" (:status entry))
                    "Archived snippet should be marked for deletion")))))))))

;;; ------------------------------------------- Snippets-Namespace Collection Tests -------------------------------------------

(deftest snippets-namespace-collection-tracked-when-library-synced-test
  (testing "Snippets-namespace collection creates RemoteSyncObject entry when Library is synced"
    (collections.tu/with-library-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/Collection coll {:name "Snippets Collection" :namespace :snippets :location "/"}]
          (events/publish-event! :event/collection-create {:object coll :user-id (mt/user->id :rasta)})
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "Collection"
                          :model_id (:id coll))
              "Snippets-namespace collection should be tracked when Library is synced"))))))

(deftest snippets-namespace-collection-ignored-when-library-not-synced-test
  (testing "Snippets-namespace collection is NOT tracked when Library is not synced"
    (collections.tu/with-library-not-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/Collection coll {:name "Snippets Collection" :namespace :snippets :location "/"}]
          (events/publish-event! :event/collection-create {:object coll :user-id (mt/user->id :rasta)})
          (is (not (t2/exists? :model/RemoteSyncObject
                               :model_type "Collection"
                               :model_id (:id coll)))
              "Snippets-namespace collection should NOT be tracked when Library is not synced"))))))

;;; ------------------------------------------- Sync Tracking Enable/Disable Tests -------------------------------------------

(deftest enable-snippet-sync-marks-all-snippets-test
  (testing "Enabling snippet sync (via Library becoming synced) marks all existing snippets for initial sync"
    (collections.tu/with-library-not-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Snippets Collection" :namespace :snippets}
                       :model/NativeQuerySnippet snippet {:name "Existing Snippet" :content "SELECT 1" :collection_id coll-id}]
          (is (zero? (t2/count :model/RemoteSyncObject :model_type "NativeQuerySnippet"))
              "Should have no snippet tracking entries initially")
          ;; Enable snippet sync
          (rs-events/sync-snippet-tracking! true)
          ;; Verify tracking entries created
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "Collection"
                          :model_id coll-id
                          :status "create")
              "Snippets-namespace collection should be marked for initial sync")
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "NativeQuerySnippet"
                          :model_id (:id snippet)
                          :status "create")
              "Snippet should be marked for initial sync"))))))

(deftest disable-snippet-sync-removes-all-tracking-test
  (testing "Disabling snippet sync removes all snippet-related tracking entries"
    (collections.tu/with-library-not-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Snippets Collection" :namespace :snippets}
                       :model/NativeQuerySnippet snippet {:name "Test Snippet" :content "SELECT 1" :collection_id coll-id}
                       :model/RemoteSyncObject _rso1 {:model_type "Collection"
                                                      :model_id coll-id
                                                      :model_name "Snippets Collection"
                                                      :status "synced"
                                                      :status_changed_at (t/offset-date-time)}
                       :model/RemoteSyncObject _rso2 {:model_type "NativeQuerySnippet"
                                                      :model_id (:id snippet)
                                                      :model_name "Test Snippet"
                                                      :model_collection_id coll-id
                                                      :status "synced"
                                                      :status_changed_at (t/offset-date-time)}]
          (is (= 2 (t2/count :model/RemoteSyncObject :model_type [:in ["Collection" "NativeQuerySnippet"]]
                             :model_id [:in [coll-id (:id snippet)]]))
              "Should have 2 tracking entries")
          ;; Disable snippet sync
          (rs-events/sync-snippet-tracking! false)
          ;; Verify tracking entries removed
          (is (zero? (t2/count :model/RemoteSyncObject :model_type "NativeQuerySnippet"))
              "Snippet tracking entries should be removed")
          (is (zero? (t2/count :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))
              "Snippets-namespace collection tracking entry should be removed"))))))

;;; ------------------------------------------- Dirty Check Tests -------------------------------------------

(deftest snippets-included-in-dirty-check-when-library-synced-test
  (testing "Snippets are included in dirty check when Library is synced"
    (collections.tu/with-library-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/NativeQuerySnippet snippet {:name "Dirty Snippet" :content "SELECT 1"}]
          ;; Delete auto-created entry and insert with specific status
          (t2/delete! :model/RemoteSyncObject :model_type "NativeQuerySnippet" :model_id (:id snippet))
          (mt/with-temp [:model/RemoteSyncObject _rso {:model_type "NativeQuerySnippet"
                                                       :model_id (:id snippet)
                                                       :model_name "Dirty Snippet"
                                                       :status "update"
                                                       :status_changed_at (t/offset-date-time)}]
            (is (sync-object/dirty?)
                "Should report dirty state when snippet has changes")))))))

(deftest snippets-excluded-from-dirty-check-when-library-not-synced-test
  (testing "Snippets are excluded from dirty check when Library is not synced"
    (collections.tu/with-library-not-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/NativeQuerySnippet snippet {:name "Dirty Snippet" :content "SELECT 1"}
                       :model/RemoteSyncObject _rso {:model_type "NativeQuerySnippet"
                                                     :model_id (:id snippet)
                                                     :model_name "Dirty Snippet"
                                                     :status "update"
                                                     :status_changed_at (t/offset-date-time)}]
          (is (not (sync-object/dirty?))
              "Should NOT report dirty state when Library is not synced"))))))

;;; ------------------------------------------- Library Sync Status Change Tests -------------------------------------------

(deftest library-sync-status-change-triggers-snippet-tracking-test
  (testing "When Library collection's is_remote_synced changes, snippet tracking is updated"
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-temp [:model/NativeQuerySnippet snippet {:name "Test Snippet" :content "SELECT 1"}]
        ;; Ensure library exists and is not synced initially
        (when-let [library (collection/library-collection)]
          (t2/update! :model/Collection (:id library) {:is_remote_synced false}))
        (t2/delete! :model/RemoteSyncObject :model_type "NativeQuerySnippet")
        (is (zero? (t2/count :model/RemoteSyncObject :model_type "NativeQuerySnippet"))
            "Should have no snippet tracking initially")
        ;; Enable Library sync and verify snippets get tracked
        (when-let [library (collection/library-collection)]
          (t2/update! :model/Collection (:id library) {:is_remote_synced true})
          (events/publish-event! :event/collection-update
                                 {:object (t2/select-one :model/Collection :id (:id library))
                                  :user-id (mt/user->id :rasta)})
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "NativeQuerySnippet"
                          :model_id (:id snippet))
              "Snippet should be tracked after Library becomes synced")
          ;; Disable Library sync and verify snippets get untracked
          (t2/update! :model/Collection (:id library) {:is_remote_synced false})
          (events/publish-event! :event/collection-update
                                 {:object (t2/select-one :model/Collection :id (:id library))
                                  :user-id (mt/user->id :rasta)})
          (is (not (t2/exists? :model/RemoteSyncObject
                               :model_type "NativeQuerySnippet"
                               :model_id (:id snippet)))
              "Snippet should be untracked after Library becomes un-synced"))))))

;;; ------------------------------------------- Helper Function Tests -------------------------------------------

(deftest library-is-remote-synced-helper-test
  (testing "library-is-remote-synced? returns correct value"
    (collections.tu/with-library-synced
      (is (true? (settings/library-is-remote-synced?))
          "Should return true when Library is synced"))
    (collections.tu/with-library-not-synced
      (is (false? (settings/library-is-remote-synced?))
          "Should return false when Library is not synced"))))

;;; ------------------------------------------- Import/Export Tests -------------------------------------------

(defn- generate-snippets-namespace-collection-yaml
  "Generates YAML content for a snippets-namespace collection."
  [entity-id name]
  (format "name: %s
description: null
entity_id: %s
slug: %s
created_at: '2024-08-28T09:46:18.671622Z'
archived: false
type: null
parent_id: null
personal_owner_id: null
namespace: snippets
authority_level: null
serdes/meta:
- id: %s
  label: %s
  model: Collection
archive_operation_id: null
archived_directly: null
is_sample: false
"
          name entity-id (str/replace (u/lower-case-en name) #"\s+" "_")
          entity-id (str/replace (u/lower-case-en name) #"\s+" "_")))

(deftest export-includes-snippets-when-library-synced-test
  (testing "Export includes snippets when Library is synced"
    (collections.tu/with-library-synced
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temporary-setting-values [remote-sync-type :read-write
                                           remote-sync-enabled true]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
            (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id}
                           {:name "Snippets Collection"
                            :namespace :snippets
                            :entity_id "snippets-coll-xxxxx"
                            :location "/"}
                           :model/NativeQuerySnippet {snippet-id :id snippet-eid :entity_id}
                           {:name "Test Snippet"
                            :content "SELECT 1"
                            :collection_id coll-id
                            :entity_id "test-snippet-xxxxxxxx"}
                           :model/RemoteSyncObject _rso1 {:model_type "Collection"
                                                          :model_id coll-id
                                                          :model_name "Snippets Collection"
                                                          :status "create"
                                                          :status_changed_at (t/offset-date-time)}
                           :model/RemoteSyncObject _rso2 {:model_type "NativeQuerySnippet"
                                                          :model_id snippet-id
                                                          :model_name "Test Snippet"
                                                          :model_collection_id coll-id
                                                          :status "create"
                                                          :status_changed_at (t/offset-date-time)}]
              (let [mock-source (test-helpers/create-mock-source)
                    result (impl/export! (source.p/snapshot mock-source) task-id "Test export")]
                (is (= :success (:status result))
                    (str "Export should succeed. Result: " result))
                (let [files-after-export (get @(:files-atom mock-source) "main")]
                  (is (some #(str/includes? % coll-eid) (keys files-after-export))
                      "Export should include the snippets-namespace collection")
                  (is (some #(str/includes? % snippet-eid) (keys files-after-export))
                      "Export should include the snippet"))))))))))

(deftest import-snippets-from-yaml-test
  (testing "Import brings in snippets from YAML files"
    (mt/with-model-cleanup [:model/NativeQuerySnippet :model/Collection :model/RemoteSyncTask]
      (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
        (collections.tu/with-library-synced
          (mt/with-temporary-setting-values [remote-sync-enabled true]
            (let [coll-entity-id "snippets-coll-importx"
                  snippet-entity-id "test-snippet-importxx"
                  test-files {"main" {(str "collections/" coll-entity-id "_snippets_collection/" coll-entity-id "_snippets_collection.yaml")
                                      (generate-snippets-namespace-collection-yaml coll-entity-id "Snippets Collection")
                                      (str "snippets/" coll-entity-id "_snippets_collection/" snippet-entity-id "_test_snippet.yaml")
                                      (test-helpers/generate-snippet-yaml snippet-entity-id "Test Snippet" "SELECT 42" :collection-id coll-entity-id)}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)
                  result (impl/import! (source.p/snapshot mock-source) task-id)]
              (is (= :success (:status result))
                  (str "Import should succeed. Result: " result))
              (is (t2/exists? :model/Collection :entity_id coll-entity-id :namespace "snippets")
                  "Snippets-namespace collection should be imported")
              (is (t2/exists? :model/NativeQuerySnippet :entity_id snippet-entity-id)
                  "Snippet should be imported")
              (when-let [snippet (t2/select-one :model/NativeQuerySnippet :entity_id snippet-entity-id)]
                (is (= "Test Snippet" (:name snippet)))
                (is (= "SELECT 42" (:content snippet)))))))))))

(deftest all-syncable-collection-ids-includes-all-namespace-types-test
  (testing "Snippet collections are included when Library is synced"
    (collections.tu/with-library-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/Collection {snippet-coll-id :id} {:name "Snippets Collection"
                                                                :namespace :snippets
                                                                :location "/"}]
          (is (contains? (set (spec/all-syncable-collection-ids)) snippet-coll-id))))))
  (testing "Snippet collections are NOT included when Library is not synced"
    (collections.tu/with-library-not-synced
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-temp [:model/Collection {snippet-coll-id :id} {:name "Snippets Collection"
                                                                :namespace :snippets
                                                                :location "/"}]
          (is (not (contains? (set (spec/all-syncable-collection-ids)) snippet-coll-id)))))))
  (testing "Transforms collections are included when setting is enabled"
    (mt/with-temporary-setting-values [remote-sync-transforms true
                                       remote-sync-enabled true]
      (mt/with-temp [:model/Collection {transforms-coll-id :id} {:name "Transforms Collection"
                                                                 :namespace :transforms
                                                                 :location "/"}]
        (is (contains? (set (spec/all-syncable-collection-ids)) transforms-coll-id)))))
  (testing "Transforms collections are NOT included when setting is disabled"
    (mt/with-temporary-setting-values [remote-sync-transforms false
                                       remote-sync-enabled true]
      (mt/with-temp [:model/Collection {transforms-coll-id :id} {:name "Transforms Collection"
                                                                 :namespace :transforms
                                                                 :location "/"}]
        (is (not (contains? (set (spec/all-syncable-collection-ids)) transforms-coll-id))))))
  (testing "Regular remote-synced collections are always included"
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-temp [:model/Collection {synced-coll-id :id} {:name "Synced Collection"
                                                             :is_remote_synced true
                                                             :location "/"}]
        (is (contains? (set (spec/all-syncable-collection-ids)) synced-coll-id))))))

(deftest export-deletes-archived-snippet-files-test
  (testing "export! deletes files from source for snippets with 'delete' status (archived snippets)"
    (collections.tu/with-library-synced
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temporary-setting-values [remote-sync-type :read-write
                                           remote-sync-enabled true]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})
                ;; Use valid 21-char NanoID format entity_ids
                coll-entity-id (u/generate-nano-id)
                snippet-entity-id (u/generate-nano-id)]
            (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id}
                           {:name "Snippets Collection"
                            :namespace :snippets
                            :entity_id coll-entity-id
                            :location "/"}
                           :model/NativeQuerySnippet {snippet-id :id snippet-eid :entity_id}
                           {:name "Archived Snippet"
                            :content "SELECT 1"
                            :collection_id coll-id
                            :entity_id snippet-entity-id
                            :archived true}
                           :model/RemoteSyncObject _rso1 {:model_type "Collection"
                                                          :model_id coll-id
                                                          :model_name "Snippets Collection"
                                                          :status "synced"
                                                          :status_changed_at (t/offset-date-time)}
                           :model/RemoteSyncObject _rso2 {:model_type "NativeQuerySnippet"
                                                          :model_id snippet-id
                                                          :model_name "Archived Snippet"
                                                          :model_collection_id coll-id
                                                          :status "delete"
                                                          :status_changed_at (t/offset-date-time)}]
              (let [removal-paths (spec/build-all-removal-paths)
                    snippet-removal-path (first (filter #(str/includes? % snippet-eid) removal-paths))
                    _ (is (some? snippet-removal-path) "Should have a removal path for the archived snippet")
                    initial-files {"main" {(str snippet-removal-path ".yaml")
                                           (test-helpers/generate-snippet-yaml snippet-eid "Archived Snippet" "SELECT 1" :collection-id coll-eid)}}
                    mock-source (test-helpers/create-mock-source :initial-files initial-files)
                    result (impl/export! (source.p/snapshot mock-source) task-id "Test export")]
                (is (= :success (:status result))
                    (str "Export should succeed. Result: " result))
                (let [files-after-export (get @(:files-atom mock-source) "main")]
                  (is (not (some #(str/includes? % snippet-eid) (keys files-after-export)))
                      "Archived snippet file should be deleted after export")))
              (testing "RemoteSyncObject entry is updated to synced after export"
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "NativeQuerySnippet" :model_id snippet-id)))
                    "RemoteSyncObject entry for archived snippet should have synced status")))))))))
