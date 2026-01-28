(ns metabase-enterprise.remote-sync.transforms-test
  "Tests for transform sync functionality in remote-sync."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as sync-object]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each (fn [f]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
                        (test-helpers/clean-remote-sync-state f))))

(deftest transform-event-creates-sync-object-when-setting-enabled-test
  (testing "Creating a transform creates a RemoteSyncObject entry when remote-sync-transforms is enabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform transform {:name "Test Transform" :collection_id coll-id}]
          (events/publish-event! :event/transform-create {:object transform})
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "Transform"
                          :model_id (:id transform))
              "Transform should be tracked when remote-sync-transforms is enabled"))))))

(deftest transform-event-ignored-when-setting-disabled-test
  (testing "Transform events are ignored when remote-sync-transforms is disabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform transform {:name "Test Transform" :collection_id coll-id}]
          (events/publish-event! :event/transform-create {:object transform})
          (is (not (t2/exists? :model/RemoteSyncObject
                               :model_type "Transform"
                               :model_id (:id transform)))
              "Transform should NOT be tracked when remote-sync-transforms is disabled"))))))

(deftest transform-event-updates-sync-object-test
  (testing "Updating a transform updates the RemoteSyncObject entry when setting is enabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform transform {:name "Test Transform" :collection_id coll-id}
                       :model/RemoteSyncObject _rso {:model_type "Transform"
                                                     :model_id (:id transform)
                                                     :model_name "Test Transform"
                                                     :model_collection_id coll-id
                                                     :status "synced"
                                                     :status_changed_at (t/offset-date-time)}]
          (events/publish-event! :event/transform-update {:object transform})
          (let [entry (t2/select-one :model/RemoteSyncObject
                                     :model_type "Transform"
                                     :model_id (:id transform))]
            (is (= "update" (:status entry))
                "Transform should have 'update' status after modification")))))))

(deftest transform-tag-event-creates-sync-object-test
  (testing "Creating a transform tag creates a RemoteSyncObject entry when transform sync is enabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/TransformTag tag {:name "Test Tag"}]
          (events/publish-event! :event/transform-tag-create {:object tag})
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "TransformTag"
                          :model_id (:id tag))
              "TransformTag should be tracked in RemoteSyncObject"))))))

(deftest transform-tag-event-ignored-when-disabled-test
  (testing "TransformTag events are ignored when transform sync is disabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/TransformTag tag {:name "Test Tag"}]
          (events/publish-event! :event/transform-tag-create {:object tag})
          (is (not (t2/exists? :model/RemoteSyncObject
                               :model_type "TransformTag"
                               :model_id (:id tag)))
              "TransformTag should NOT be tracked when sync is disabled"))))))

(deftest transforms-namespace-collection-tracked-when-setting-enabled-test
  (testing "Transforms-namespace collection creates RemoteSyncObject entry when setting is enabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection coll {:name "Transforms Collection" :namespace collection/transforms-ns :location "/"}]
          (events/publish-event! :event/collection-create {:object coll :user-id (mt/user->id :rasta)})
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "Collection"
                          :model_id (:id coll))
              "Transforms-namespace collection should be tracked when setting is enabled"))))))

(deftest transforms-namespace-collection-ignored-when-setting-disabled-test
  (testing "Transforms-namespace collection is NOT tracked when setting is disabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection coll {:name "Transforms Collection" :namespace collection/transforms-ns :location "/"}]
          (events/publish-event! :event/collection-create {:object coll :user-id (mt/user->id :rasta)})
          (is (not (t2/exists? :model/RemoteSyncObject
                               :model_type "Collection"
                               :model_id (:id coll)))
              "Transforms-namespace collection should NOT be tracked when setting is disabled"))))))

(deftest enable-transform-sync-marks-all-transforms-test
  (testing "Enabling transform sync marks all existing transforms, tags, and collections for initial sync"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform transform {:name "Existing Transform" :collection_id coll-id}
                       :model/TransformTag tag {:name "Existing Tag"}]
          (is (zero? (t2/count :model/RemoteSyncObject :model_type [:in ["Transform" "TransformTag"]]))
              "Should have no transform tracking entries initially")
          (settings/sync-transform-tracking! true)
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "Collection"
                          :model_id coll-id
                          :status "create")
              "Transforms-namespace collection should be marked for initial sync")
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "Transform"
                          :model_id (:id transform)
                          :status "create")
              "Transform should be marked for initial sync")
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "TransformTag"
                          :model_id (:id tag)
                          :status "create")
              "TransformTag should be marked for initial sync"))))))

(deftest disable-transform-sync-removes-all-tracking-test
  (testing "Disabling transform sync removes all transform-related tracking entries"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform transform {:name "Test Transform" :collection_id coll-id}
                       :model/TransformTag tag {:name "Test Tag"}]
          (mt/with-temporary-setting-values [remote-sync-transforms true]
            (is (= 3 (t2/count :model/RemoteSyncObject :model_type [:in ["Collection" "Transform" "TransformTag"]]
                               :model_id [:in [coll-id (:id transform) (:id tag)]]))
                "Should have 3 tracking entries")
            (settings/sync-transform-tracking! false)
            (is (zero? (t2/count :model/RemoteSyncObject :model_type [:in ["Transform" "TransformTag"]]))
                "Transform and TransformTag tracking entries should be removed")
            (is (zero? (t2/count :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))
                "Transforms-namespace collection tracking entry should be removed")))))))

(deftest transforms-included-in-dirty-check-when-enabled-test
  (testing "Transforms are included in dirty check when setting is enabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform transform {:name "Dirty Transform" :collection_id coll-id}
                       :model/RemoteSyncObject _rso {:model_type "Transform"
                                                     :model_id (:id transform)
                                                     :model_name "Dirty Transform"
                                                     :status "update"
                                                     :status_changed_at (t/offset-date-time)}]
          (is (sync-object/dirty?)
              "Should report dirty state when transform has changes"))))))

(deftest transforms-excluded-from-dirty-check-when-disabled-test
  (testing "Transforms are excluded from dirty check when setting is disabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform transform {:name "Dirty Transform" :collection_id coll-id}
                       :model/RemoteSyncObject _rso {:model_type "Transform"
                                                     :model_id (:id transform)
                                                     :model_name "Dirty Transform"
                                                     :status "update"
                                                     :status_changed_at (t/offset-date-time)}]
          (is (not (sync-object/dirty?))
              "Should NOT report dirty state when transform sync is disabled"))))))

(deftest transform-tags-included-in-dirty-check-when-enabled-test
  (testing "TransformTags are included in dirty check when transform sync is enabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/TransformTag tag {:name "Dirty Tag"}
                       :model/RemoteSyncObject _rso {:model_type "TransformTag"
                                                     :model_id (:id tag)
                                                     :model_name "Dirty Tag"
                                                     :status "update"
                                                     :status_changed_at (t/offset-date-time)}]
          (is (sync-object/dirty?)
              "Should report dirty state when transform tag has changes"))))))

(deftest transform-tags-excluded-from-dirty-check-when-disabled-test
  (testing "TransformTags are excluded from dirty check when transform sync is disabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/TransformTag tag {:name "Dirty Tag"}
                       :model/RemoteSyncObject _rso {:model_type "TransformTag"
                                                     :model_id (:id tag)
                                                     :model_name "Dirty Tag"
                                                     :status "update"
                                                     :status_changed_at (t/offset-date-time)}]
          (is (not (sync-object/dirty?))
              "Should NOT report dirty state when transform sync is disabled"))))))

(deftest export-includes-transforms-namespace-collections-test
  (testing "Export includes transforms-namespace collections when setting is enabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-type :read-write
                                         remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
            (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Transforms Collection" :namespace collection/transforms-ns :entity_id "transforms-coll-xxx" :location "/"}
                           :model/Transform transform {:name "Export Transform" :collection_id coll-id}
                           :model/RemoteSyncObject _rso1 {:model_type "Collection" :model_id coll-id :model_name "Transforms Collection" :status "create" :status_changed_at (t/offset-date-time)}
                           :model/RemoteSyncObject _rso2 {:model_type "Transform" :model_id (:id transform) :model_name "Export Transform" :model_collection_id coll-id :status "create" :status_changed_at (t/offset-date-time)}]
              (let [saved-coll (t2/select-one :model/Collection :id coll-id)]
                (is (= :transforms (:namespace saved-coll))
                    (str "Collection should have transforms namespace, got: " (:namespace saved-coll)))
                (is (= "/" (:location saved-coll))
                    (str "Collection should have root location, got: " (:location saved-coll))))
              (let [found-colls (t2/select-fn-set :entity_id :model/Collection :namespace (name collection/transforms-ns))]
                (is (contains? found-colls coll-eid)
                    (str "Query should find the collection. Found: " found-colls ", expected to contain: " coll-eid)))
              (let [mock-source (test-helpers/create-mock-source)
                    result (impl/export! (source.p/snapshot mock-source) task-id "Test export")]
                (is (= :success (:status result))
                    (str "Export should succeed. Result: " result))
                (let [files-after-export (get @(:files-atom mock-source) "main")]
                  (is (some #(str/includes? % coll-eid)
                            (keys files-after-export))
                      "Export should include the transforms-namespace collection itself"))))))))))

(deftest export-excludes-transforms-when-setting-disabled-test
  (testing "Export excludes transforms when setting is disabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-type :read-write
                                         remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
            (mt/with-temp [:model/Collection {rs-coll-id :id rs-coll-eid :entity_id} {:name "Remote Synced" :is_remote_synced true :entity_id "remote-synced-xxxx" :location "/"}
                           :model/RemoteSyncObject _rso {:model_type "Collection" :model_id rs-coll-id :model_name "Remote Synced" :status "create" :status_changed_at (t/offset-date-time)}]
              (let [saved-coll (t2/select-one :model/Collection :id rs-coll-id)]
                (is (true? (:is_remote_synced saved-coll))
                    (str "Collection should have is_remote_synced true, got: " (:is_remote_synced saved-coll)))
                (is (= "/" (:location saved-coll))
                    (str "Collection should have root location, got: " (:location saved-coll))))
              (let [found-colls (t2/select-fn-set :entity_id :model/Collection :is_remote_synced true :location "/")]
                (is (contains? found-colls rs-coll-eid)
                    (str "Query should find the collection. Found: " found-colls ", expected to contain: " rs-coll-eid)))
              (let [mock-source (test-helpers/create-mock-source)
                    result (impl/export! (source.p/snapshot mock-source) task-id "Test export")]
                (is (= :success (:status result))
                    (str "Export should succeed. Result: " result))
                (let [files-after-export (get @(:files-atom mock-source) "main")]
                  (is (not (some #(str/includes? % "transforms/") (keys files-after-export)))
                      "Export should NOT include transform files when setting is disabled"))))))))))

(defn- generate-transform-yaml
  "Generates YAML content for a transform."
  [entity-id name database-id table-id]
  (format "name: %s
description: null
entity_id: %s
collection_id: null
created_at: '2024-08-28T09:46:18.671622Z'
creator_id: rasta@metabase.com
source:
  type: query
  query:
    database: %d
    type: query
    query:
      source-table: %d
target:
  type: table
  name: test_output
  schema: PUBLIC
serdes/meta:
- id: %s
  label: %s
  model: Transform
"
          name entity-id database-id table-id entity-id (str/replace (u/lower-case-en name) #"\s+" "_")))

(defn- generate-transforms-namespace-collection-yaml
  "Generates YAML content for a transforms-namespace collection."
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
namespace: transforms
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

(deftest import-transforms-from-transforms-namespace-collection-test
  (testing "Import brings in transforms located inside a transforms-namespace collection"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-model-cleanup [:model/Transform :model/Collection]
          (let [task-id             (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                coll-entity-id      "transforms-coll-xxx"
                transform-entity-id "test-transform-xxxxx"
                test-files          {"main" {(str "collections/" coll-entity-id "_transforms/" coll-entity-id "_transforms.yaml")
                                             (generate-transforms-namespace-collection-yaml coll-entity-id "Transforms")
                                             (str "collections/" coll-entity-id "_transforms/transforms/" transform-entity-id "_test_transform.yaml")
                                             (generate-transform-yaml transform-entity-id "Test Transform" (mt/id) (mt/id :venues))}}
                mock-source         (test-helpers/create-mock-source :initial-files test-files)
                result              (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result)))
            (is (t2/exists? :model/Collection :entity_id coll-entity-id :namespace "transforms")
                "Transforms-namespace collection should be imported")
            (is (t2/exists? :model/Transform :entity_id transform-entity-id)
                "Transform should be imported from transforms-namespace collection")))))))

(deftest archived-transforms-namespace-collection-excluded-from-export-test
  (testing "When a transforms-namespace collection is archived, it and its children are excluded from export"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-type :read-write
                                         remote-sync-transforms true
                                         remote-sync-enabled true]
<<<<<<< HEAD
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id}
                         {:name "Transforms Collection"
                          :namespace collection/transforms-ns
                          :entity_id "arch-transforms-collx"
                          :location "/"}
                         :model/Transform {transform-id :id transform-eid :entity_id}
                         {:name "Child Transform"
                          :collection_id coll-id
                          :entity_id "child-transform-xxxxx"}
                         :model/Transform {root-transform-id :id root-transform-eid :entity_id}
                         {:name "Root Transform"
                          :collection_id nil
                          :entity_id "root-transform-xxxxxx"}]
            (t2/insert! :model/RemoteSyncObject
                        [{:model_type "Collection"
                          :model_id coll-id
                          :model_name "Transforms Collection"
                          :status "synced"
                          :status_changed_at (t/offset-date-time)}
                         {:model_type "Transform"
                          :model_id transform-id
                          :model_name "Child Transform"
                          :model_collection_id coll-id
                          :status "synced"
                          :status_changed_at (t/offset-date-time)}
                         {:model_type "Transform"
                          :model_id root-transform-id
                          :model_name "Root Transform"
                          :model_collection_id nil
                          :status "create"
                          :status_changed_at (t/offset-date-time)}])
            (let [initial-files {"main" {(str "collections/" coll-eid "_transforms_collection/" coll-eid "_transforms_collection.yaml")
                                         (generate-transforms-namespace-collection-yaml coll-eid "Transforms Collection")
                                         (str "collections/" coll-eid "_transforms_collection/transforms/" transform-eid "_child_transform.yaml")
                                         (generate-transform-yaml transform-eid "Child Transform" (mt/id) (mt/id :venues))}}
                  mock-source (test-helpers/create-mock-source :initial-files initial-files)]
              (is (some #(str/includes? % coll-eid) (keys (get @(:files-atom mock-source) "main"))))
              (is (some #(str/includes? % transform-eid) (keys (get @(:files-atom mock-source) "main"))))
              (t2/update! :model/Collection coll-id {:archived true})
              (events/publish-event! :event/collection-update
                                     {:object (t2/select-one :model/Collection :id coll-id)
                                      :user-id (mt/user->id :rasta)})
              (is (= "delete" (:status (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))))
              (is (= "delete" (:status (t2/select-one :model/RemoteSyncObject :model_type "Transform" :model_id transform-id))))
              (let [result (impl/export! (source.p/snapshot mock-source) task-id "Test export")]
                (is (= :success (:status result)))
                (let [files-after-export (get @(:files-atom mock-source) "main")]
                  (is (not (some #(str/includes? % coll-eid) (keys files-after-export))))
                  (is (not (some #(str/includes? % transform-eid) (keys files-after-export))))
                  ;; Root transform should still be exported
                  (is (some #(str/includes? % root-transform-eid) (keys files-after-export))
                      "Root transform should be exported"))))))))))
=======
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
            (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id}
                           {:name "Transforms Collection"
                            :namespace collection/transforms-ns
                            :entity_id "arch-transforms-collx"
                            :location "/"}
                           :model/Transform {transform-id :id transform-eid :entity_id}
                           {:name "Child Transform"
                            :collection_id coll-id
                            :entity_id "child-transform-xxxxx"}
                           :model/Transform {root-transform-id :id root-transform-eid :entity_id}
                           {:name "Root Transform"
                            :collection_id nil
                            :entity_id "root-transform-xxxxxx"}
                           :model/RemoteSyncObject _rso1 {:model_type "Collection"
                                                          :model_id coll-id
                                                          :model_name "Transforms Collection"
                                                          :status "synced"
                                                          :status_changed_at (t/offset-date-time)}
                           :model/RemoteSyncObject _rso2 {:model_type "Transform"
                                                          :model_id transform-id
                                                          :model_name "Child Transform"
                                                          :model_collection_id coll-id
                                                          :status "synced"
                                                          :status_changed_at (t/offset-date-time)}
                           :model/RemoteSyncObject _rso3 {:model_type "Transform"
                                                          :model_id root-transform-id
                                                          :model_name "Root Transform"
                                                          :model_collection_id nil
                                                          :status "create"
                                                          :status_changed_at (t/offset-date-time)}]
              (let [initial-files {"main" {(str "collections/" coll-eid "_transforms_collection/" coll-eid "_transforms_collection.yaml")
                                           (generate-transforms-namespace-collection-yaml coll-eid "Transforms Collection")
                                           (str "collections/" coll-eid "_transforms_collection/transforms/" transform-eid "_child_transform.yaml")
                                           (generate-transform-yaml transform-eid "Child Transform")}}
                    mock-source (test-helpers/create-mock-source :initial-files initial-files)]
                (is (some #(str/includes? % coll-eid) (keys (get @(:files-atom mock-source) "main"))))
                (is (some #(str/includes? % transform-eid) (keys (get @(:files-atom mock-source) "main"))))
                (t2/update! :model/Collection coll-id {:archived true})
                (events/publish-event! :event/collection-update
                                       {:object (t2/select-one :model/Collection :id coll-id)
                                        :user-id (mt/user->id :rasta)})
                (is (= "delete" (:status (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))))
                (let [result (impl/export! (source.p/snapshot mock-source) task-id "Test export")]
                  (is (= :success (:status result)))
                  (let [files-after-export (get @(:files-atom mock-source) "main")]
                    (is (not (some #(str/includes? % coll-eid) (keys files-after-export))))
                    (is (not (some #(str/includes? % transform-eid) (keys files-after-export))))
                    ;; Root transform should still be exported
                    (is (some #(str/includes? % root-transform-eid) (keys files-after-export))
                        "Root transform should be exported")))))))))))

;;; ------------------------------------------- Collection Cleanup Tests -------------------------------------------

(deftest transforms-collections-included-in-all-syncable-collection-ids-test
  (testing "Transforms collections are included in all-syncable-collection-ids when setting is enabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {transforms-coll-id :id} {:name "Transforms Collection"
                                                                   :namespace collection/transforms-ns
                                                                   :location "/"}]
          (is (contains? (set (spec/all-syncable-collection-ids)) transforms-coll-id)
              "Transforms-namespace collection should be included when setting is enabled")))))

  (testing "Transforms collections are NOT included when setting is disabled"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {transforms-coll-id :id} {:name "Transforms Collection"
                                                                   :namespace collection/transforms-ns
                                                                   :location "/"}]
          (is (not (contains? (set (spec/all-syncable-collection-ids)) transforms-coll-id))
              "Transforms-namespace collection should NOT be included when setting is disabled"))))))

(deftest import-removes-empty-transforms-collection-not-on-remote-test
  (testing "Import removes empty transforms-namespace collections that don't exist on the remote"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Collection]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                local-coll-entity-id (u/generate-nano-id)
                remote-coll-entity-id (u/generate-nano-id)]
            (mt/with-temp [:model/Collection {local-coll-id :id} {:name "Local Transforms Collection"
                                                                  :namespace collection/transforms-ns
                                                                  :entity_id local-coll-entity-id
                                                                  :location "/"}]
              (is (t2/exists? :model/Collection :id local-coll-id))
              (let [test-files {"main" {(str "collections/" remote-coll-entity-id "_remote_transforms/" remote-coll-entity-id "_remote_transforms.yaml")
                                        (generate-transforms-namespace-collection-yaml remote-coll-entity-id "Remote Transforms")}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result))
                    (str "Import should succeed. Result: " result))
                (is (not (t2/exists? :model/Collection :id local-coll-id))
                    "Local transforms collection should be deleted after import since it wasn't on remote")
                (is (t2/exists? :model/Collection :entity_id remote-coll-entity-id :namespace "transforms")
                    "Remote transforms collection should be imported")))))))))

(deftest import-removes-transform-not-on-remote-test
  (testing "Import removes transforms that don't exist on the remote but keeps the collection"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                coll-entity-id (u/generate-nano-id)
                local-transform-entity-id (u/generate-nano-id)
                remote-transform-entity-id (u/generate-nano-id)]
            (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                            :namespace collection/transforms-ns
                                                            :entity_id coll-entity-id
                                                            :location "/"}
                           :model/Transform {local-transform-id :id} {:name "Local Transform"
                                                                      :entity_id local-transform-entity-id
                                                                      :collection_id coll-id}]
              (is (t2/exists? :model/Collection :id coll-id))
              (is (t2/exists? :model/Transform :id local-transform-id))
              (let [test-files {"main" {(str "collections/" coll-entity-id "_transforms/" coll-entity-id "_transforms.yaml")
                                        (generate-transforms-namespace-collection-yaml coll-entity-id "Transforms Collection")
                                        (str "collections/" coll-entity-id "_transforms/transforms/" remote-transform-entity-id "_remote_transform.yaml")
                                        (generate-transform-yaml remote-transform-entity-id "Remote Transform")}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result))
                    (str "Import should succeed. Result: " result))
                (is (t2/exists? :model/Collection :id coll-id)
                    "Transforms collection should still exist")
                (is (not (t2/exists? :model/Transform :id local-transform-id))
                    "Local transform should be deleted after import since it wasn't on remote")
                (is (t2/exists? :model/Transform :entity_id remote-transform-entity-id)
                    "Remote transform should be imported")))))))))

(deftest import-removes-transforms-and-collection-not-on-remote-test
  (testing "Import removes transforms and their collection when neither exist on remote"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Collection]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                local-coll-entity-id (u/generate-nano-id)
                local-transform-entity-id (u/generate-nano-id)
                remote-coll-entity-id (u/generate-nano-id)]
            (mt/with-temp [:model/Collection {local-coll-id :id} {:name "Local Transforms Collection"
                                                                  :namespace collection/transforms-ns
                                                                  :entity_id local-coll-entity-id
                                                                  :location "/"}
                           :model/Transform {local-transform-id :id} {:name "Local Transform"
                                                                      :entity_id local-transform-entity-id
                                                                      :collection_id local-coll-id}]
              (is (t2/exists? :model/Collection :id local-coll-id))
              (is (t2/exists? :model/Transform :id local-transform-id))
              (let [test-files {"main" {(str "collections/" remote-coll-entity-id "_remote_transforms/" remote-coll-entity-id "_remote_transforms.yaml")
                                        (generate-transforms-namespace-collection-yaml remote-coll-entity-id "Remote Transforms")}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result))
                    (str "Import should succeed. Result: " result))
                (is (not (t2/exists? :model/Transform :id local-transform-id))
                    "Local transform should be deleted after import")
                (is (not (t2/exists? :model/Collection :id local-coll-id))
                    "Local transforms collection should be deleted after import")
                (is (t2/exists? :model/Collection :entity_id remote-coll-entity-id :namespace "transforms")
                    "Remote transforms collection should be imported")))))))))

;;; ------------------------------------------- PythonLibrary Tests -------------------------------------------

(defn- generate-python-library-yaml
  "Generates YAML content for a PythonLibrary."
  [entity-id path source]
  (format "path: %s
source: |
%s
entity_id: %s
created_at: '2024-08-28T09:46:18.671622Z'
serdes/meta:
- id: %s
  model: PythonLibrary
"
          path
          (str/join "\n" (map #(str "  " %) (str/split-lines source)))
          entity-id
          entity-id))

(defn- with-clean-python-library
  "Ensures PythonLibrary table is clean before and after running the test function.
   Saves and restores any existing entries."
  [f]
  (let [existing (t2/select :model/PythonLibrary)]
    (try
      (t2/delete! :model/PythonLibrary)
      (f)
      (finally
        (t2/delete! :model/PythonLibrary)
        (when (seq existing)
          (t2/insert! :model/PythonLibrary existing))))))

(deftest python-library-event-creates-sync-object-when-setting-enabled-test
  (testing "Creating a PythonLibrary creates a RemoteSyncObject entry when remote-sync-transforms is enabled"
    (with-clean-python-library
      (fn []
        (mt/with-premium-features #{:transforms}
          (mt/with-temporary-setting-values [remote-sync-transforms true
                                             remote-sync-enabled true]
            (let [library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# test"})]
              (is (t2/exists? :model/RemoteSyncObject
                              :model_type "PythonLibrary"
                              :model_id (:id library))
                  "PythonLibrary should be tracked when remote-sync-transforms is enabled"))))))))

(deftest python-library-event-ignored-when-setting-disabled-test
  (testing "PythonLibrary events are ignored when remote-sync-transforms is disabled"
    (with-clean-python-library
      (fn []
        (mt/with-premium-features #{:transforms}
          (mt/with-temporary-setting-values [remote-sync-transforms false
                                             remote-sync-enabled true]
            (let [library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# test"})]
              (is (not (t2/exists? :model/RemoteSyncObject
                                   :model_type "PythonLibrary"
                                   :model_id (:id library)))
                  "PythonLibrary should NOT be tracked when remote-sync-transforms is disabled"))))))))

(deftest python-library-event-updates-sync-object-test
  (testing "Updating a PythonLibrary updates the RemoteSyncObject entry when setting is enabled"
    (with-clean-python-library
      (fn []
        (mt/with-premium-features #{:transforms}
          (mt/with-temporary-setting-values [remote-sync-transforms true
                                             remote-sync-enabled true]
            (let [library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# test"})]
              (t2/update! :model/RemoteSyncObject {:model_type "PythonLibrary" :model_id (:id library)}
                          {:status "synced"})
              (t2/update! :model/PythonLibrary (:id library) {:source "# updated"})
              (let [entry (t2/select-one :model/RemoteSyncObject
                                         :model_type "PythonLibrary"
                                         :model_id (:id library))]
                (is (= "update" (:status entry))
                    "PythonLibrary should have 'update' status after modification")))))))))

(deftest export-includes-python-library-when-setting-enabled-test
  (testing "Export includes PythonLibrary when remote-sync-transforms is enabled"
    (with-clean-python-library
      (fn []
        (mt/with-premium-features #{:transforms}
          (mt/with-temporary-setting-values [remote-sync-type :read-write
                                             remote-sync-transforms true
                                             remote-sync-enabled true]
            (mt/with-model-cleanup [:model/RemoteSyncTask]
              (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})
                    library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# shared code"})]
                (t2/update! :model/RemoteSyncObject {:model_type "PythonLibrary" :model_id (:id library)}
                            {:status "create"})
                (let [mock-source (test-helpers/create-mock-source)
                      result (impl/export! (source.p/snapshot mock-source) task-id "Test export")]
                  (is (= :success (:status result))
                      (str "Export should succeed. Result: " result))
                  (let [files-after-export (get @(:files-atom mock-source) "main")]
                    (is (some #(str/includes? % "python-libraries/") (keys files-after-export))
                        "Export should include the PythonLibrary file")))))))))))

(deftest import-python-library-from-yaml-test
  (testing "Import brings in PythonLibrary from YAML files"
    (with-clean-python-library
      (fn []
        (mt/with-premium-features #{:transforms}
          (mt/with-temporary-setting-values [remote-sync-transforms true
                                             remote-sync-enabled true]
            (mt/with-model-cleanup [:model/RemoteSyncTask]
              (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                    lib-entity-id (u/generate-nano-id)
                    test-files {"main" {(str "python-libraries/" lib-entity-id ".yaml")
                                        (generate-python-library-yaml lib-entity-id "common.py" "def shared_func():\n    return 42")}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result))
                    (str "Import should succeed. Result: " result))
                (is (t2/exists? :model/PythonLibrary :path "common.py")
                    "PythonLibrary should be imported")
                (when-let [library (t2/select-one :model/PythonLibrary :path "common.py")]
                  (is (str/includes? (:source library) "def shared_func()")
                      "PythonLibrary source should be imported correctly"))))))))))

(deftest import-removes-python-library-not-on-remote-test
  (testing "Import removes local PythonLibrary that doesn't exist on the remote"
    (with-clean-python-library
      (fn []
        (mt/with-premium-features #{:transforms}
          (mt/with-temporary-setting-values [remote-sync-transforms true
                                             remote-sync-enabled true]
            (mt/with-model-cleanup [:model/RemoteSyncTask]
              (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                    local-library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# local only"})]
                (is (t2/exists? :model/PythonLibrary :id (:id local-library))
                    "Local PythonLibrary should exist before import")
                (let [test-files {"main" {}}
                      mock-source (test-helpers/create-mock-source :initial-files test-files)
                      result (impl/import! (source.p/snapshot mock-source) task-id)]
                  (is (= :success (:status result))
                      (str "Import should succeed. Result: " result))
                  (is (not (t2/exists? :model/PythonLibrary :id (:id local-library)))
                      "Local PythonLibrary should be deleted after import since it wasn't on remote"))))))))))

(deftest import-replaces-python-library-with-remote-version-test
  (testing "Import updates local PythonLibrary when remote has same entity_id"
    (with-clean-python-library
      (fn []
        (mt/with-premium-features #{:transforms}
          (mt/with-temporary-setting-values [remote-sync-transforms true
                                             remote-sync-enabled true]
            (mt/with-model-cleanup [:model/RemoteSyncTask]
              (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                    local-library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# local version"})
                    local-entity-id (:entity_id local-library)]
                (is (t2/exists? :model/PythonLibrary :path "common.py")
                    "Local PythonLibrary should exist before import")
                ;; Use the same entity_id as the local library so it gets updated
                (let [test-files {"main" {(str "python-libraries/" local-entity-id ".yaml")
                                          (generate-python-library-yaml local-entity-id "common.py" "# remote version\ndef new_func():\n    pass")}}
                      mock-source (test-helpers/create-mock-source :initial-files test-files)
                      result (impl/import! (source.p/snapshot mock-source) task-id)]
                  (is (= :success (:status result))
                      (str "Import should succeed. Result: " result))
                  (let [library (t2/select-one :model/PythonLibrary :path "common.py")]
                    (is (some? library) "PythonLibrary should still exist")
                    (is (str/includes? (:source library) "# remote version")
                        "PythonLibrary source should be updated with remote version")))))))))))
>>>>>>> origin/master
