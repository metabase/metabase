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
  (testing "Enabling transform sync creates a single Transforms RSO with model_id=-1 and status 'create'"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        ;; Clean up any existing Transforms root RSO first
        (t2/delete! :model/RemoteSyncObject
                    :model_type "Collection"
                    :model_id settings/transforms-root-id)
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform _transform {:name "Existing Transform" :collection_id coll-id}
                       :model/TransformTag _tag {:name "Existing Tag"}]
          (is (not (t2/exists? :model/RemoteSyncObject
                               :model_type "Collection"
                               :model_id settings/transforms-root-id))
              "Should not have Transforms root RSO initially")
          (settings/sync-transform-tracking! true)
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "Collection"
                          :model_id settings/transforms-root-id
                          :status "create")
              "Transforms root should be created with status 'create'")
          (let [rso (t2/select-one :model/RemoteSyncObject
                                   :model_type "Collection"
                                   :model_id settings/transforms-root-id)]
            (is (= "Transforms" (:model_name rso))
                "Transforms root should have name 'Transforms'")))))))

(deftest disable-transform-sync-removes-all-tracking-test
  (testing "Disabling transform sync creates a Transforms RSO with status 'delete'"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform _transform {:name "Test Transform" :collection_id coll-id}
                       :model/TransformTag _tag {:name "Test Tag"}]
          (mt/with-temporary-setting-values [remote-sync-transforms true]
            (is (t2/exists? :model/RemoteSyncObject
                            :model_type "Collection"
                            :model_id settings/transforms-root-id
                            :status "create")
                "Should have Transforms root RSO with 'create' status")
            (settings/sync-transform-tracking! false)
            (is (t2/exists? :model/RemoteSyncObject
                            :model_type "Collection"
                            :model_id settings/transforms-root-id
                            :status "delete")
                "Transforms root should now have 'delete' status")))))))

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
            (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Transforms Collection" :namespace collection/transforms-ns :entity_id "transforms-coll-xxxxx" :location "/"}
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
            (mt/with-temp [:model/Collection {rs-coll-id :id rs-coll-eid :entity_id} {:name "Remote Synced" :is_remote_synced true :entity_id "remote-synced-xxxxxxx" :location "/"}
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
                coll-entity-id      "transforms-coll-xxxxx"
                transform-entity-id "test-transform-xxxxxx"
                test-files {"main" {(str "collections/" coll-entity-id "_transforms/" coll-entity-id "_transforms.yaml")
                                    (generate-transforms-namespace-collection-yaml coll-entity-id "Transforms")
                                    (str "collections/" coll-entity-id "_transforms/transforms/" transform-entity-id "_test_transform.yaml")
                                    (test-helpers/generate-transform-yaml transform-entity-id "Test Transform" :collection-id coll-entity-id)}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
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
                                           (test-helpers/generate-transform-yaml transform-eid "Child Transform" :collection-id coll-eid)}}
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
            (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform]
              (is (t2/exists? :model/Collection :id coll-id))
              (is (t2/exists? :model/Transform :id local-transform-id))
              (let [test-files {"main" {(str "collections/" coll-entity-id "_transforms/" coll-entity-id "_transforms.yaml")
                                        (generate-transforms-namespace-collection-yaml coll-entity-id "Transforms Collection")
                                        (str "collections/" coll-entity-id "_transforms/transforms/" remote-transform-entity-id "_remote_transform.yaml")
                                        (test-helpers/generate-transform-yaml remote-transform-entity-id "Remote Transform" :collection-id coll-entity-id)}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)]
                (testing "fails with `conflict` status because local transforms will be deleted"
                  (is (= :conflict (:status (impl/import! (source.p/snapshot mock-source) task-id)))))
                (testing "passing `force? true` allows overriding the conflict."
                  (is (= :success (:status (impl/import! (source.p/snapshot mock-source) task-id :force? true)))))
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

;;; ------------------------------------------- Transform Sync Behavior Tests -------------------------------------------

(deftest import-preserves-local-transforms-when-setting-disabled-and-remote-has-none-test
  (testing "When remote-sync-transforms is disabled and remote has no transforms, local transforms are preserved"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform :model/TransformTag]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                local-transform-entity-id (u/generate-nano-id)
                local-tag-entity-id (u/generate-nano-id)]
            (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                            :namespace collection/transforms-ns
                                                            :location "/"}
                           :model/Transform {local-transform-id :id} {:name "Local Transform"
                                                                      :entity_id local-transform-entity-id
                                                                      :collection_id coll-id}
                           :model/TransformTag {local-tag-id :id} {:name "Local Tag"
                                                                   :entity_id local-tag-entity-id}]
              (is (t2/exists? :model/Transform :id local-transform-id)
                  "Local transform should exist before import")
              (is (t2/exists? :model/TransformTag :id local-tag-id)
                  "Local tag should exist before import")
              (is (t2/exists? :model/Collection :id coll-id)
                  "Local transforms collection should exist before import")
              (let [remote-coll-entity-id (u/generate-nano-id)
                    test-files {"main" {(str "collections/" remote-coll-entity-id "_remote_collection/" remote-coll-entity-id "_remote_collection.yaml")
                                        (test-helpers/generate-collection-yaml remote-coll-entity-id "Remote Collection")}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result))
                    (str "Import should succeed. Result: " result))
                (is (t2/exists? :model/Transform :id local-transform-id)
                    "Local transform should still exist after import when setting is disabled")
                (is (t2/exists? :model/TransformTag :id local-tag-id)
                    "Local tag should still exist after import when setting is disabled")
                (is (t2/exists? :model/Collection :id coll-id)
                    "Local transforms collection should still exist after import when setting is disabled")))))))))

(deftest import-replaces-local-transforms-when-remote-has-transforms-test
  (testing "When remote has transforms, local transforms are replaced with remote content (setting auto-enabled)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform :model/TransformTag]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                local-transform-entity-id (u/generate-nano-id)
                local-tag-entity-id (u/generate-nano-id)
                remote-transform-entity-id (u/generate-nano-id)
                remote-coll-entity-id (u/generate-nano-id)]
            (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Local Transforms Collection"
                                                                                :namespace collection/transforms-ns
                                                                                :location "/"}
                           :model/Transform {local-transform-id :id} {:name "Local Transform"
                                                                      :entity_id local-transform-entity-id
                                                                      :collection_id coll-id}
                           :model/TransformTag {local-tag-id :id} {:name "Local Tag"
                                                                   :entity_id local-tag-entity-id}]
              (is (t2/exists? :model/Transform :id local-transform-id)
                  "Local transform should exist before import")
              (is (t2/exists? :model/TransformTag :id local-tag-id)
                  "Local tag should exist before import")
              (let [test-files {"main" {(str "collections/" remote-coll-entity-id "_transforms/" remote-coll-entity-id "_transforms.yaml")
                                        (generate-transforms-namespace-collection-yaml remote-coll-entity-id "Remote Transforms")
                                        (str "collections/" remote-coll-entity-id "_transforms/transforms/" remote-transform-entity-id "_remote_transform.yaml")
                                        (test-helpers/generate-transform-yaml remote-transform-entity-id "Remote Transform" :collection-id remote-coll-entity-id)}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result-without-force (impl/import! (source.p/snapshot mock-source) task-id)
                    result (impl/import! (source.p/snapshot mock-source) task-id {:force? true})]
                (is (= :conflict (:status result-without-force)))
                (is (= :success (:status result))
                    (str "Import should succeed. Result: " result))
                (is (settings/remote-sync-transforms)
                    "remote-sync-transforms setting should be auto-enabled when remote has transforms")
                (is (not (t2/exists? :model/Transform :id local-transform-id))
                    "Local transform should be deleted after import when remote has different transforms")
                (is (not (t2/exists? :model/TransformTag :id local-tag-id))
                    "Local tag should be deleted after import when remote has different tags")
                (is (t2/exists? :model/Transform :entity_id remote-transform-entity-id)
                    "Remote transform should be imported")
                (is (t2/exists? :model/Collection :entity_id remote-coll-entity-id :namespace "transforms")
                    "Remote transforms collection should be imported")
                (is (not (t2/exists? :model/Collection :entity_id coll-eid))
                    "Local transforms collection should be removed when not on remote")))))))))

(deftest import-removes-all-local-transforms-when-setting-enabled-and-remote-has-none-test
  (testing "When remote-sync-transforms is enabled and remote has no transforms, all local transforms are removed"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform :model/TransformTag]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                local-transform-entity-id (u/generate-nano-id)
                local-tag-entity-id (u/generate-nano-id)]
            (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Local Transforms Collection"
                                                                                :namespace collection/transforms-ns
                                                                                :entity_id (u/generate-nano-id)
                                                                                :location "/"}
                           :model/Transform {local-transform-id :id} {:name "Local Transform"
                                                                      :entity_id local-transform-entity-id
                                                                      :collection_id coll-id}
                           :model/TransformTag {local-tag-id :id} {:name "Local Tag"
                                                                   :entity_id local-tag-entity-id}]
              (is (t2/exists? :model/Transform :id local-transform-id)
                  "Local transform should exist before import")
              (is (t2/exists? :model/TransformTag :id local-tag-id)
                  "Local tag should exist before import")
              (is (t2/exists? :model/Collection :id coll-id)
                  "Local transforms collection should exist before import")
              (let [remote-coll-entity-id (u/generate-nano-id)
                    test-files {"main" {(str "collections/" remote-coll-entity-id "_remote_collection/" remote-coll-entity-id "_remote_collection.yaml")
                                        (test-helpers/generate-collection-yaml remote-coll-entity-id "Remote Collection")}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result))
                    (str "Import should succeed. Result: " result))
                (is (not (t2/exists? :model/Transform :id local-transform-id))
                    "Local transform should be deleted when setting enabled and remote has no transforms")
                (is (not (t2/exists? :model/TransformTag :id local-tag-id))
                    "Local tag should be deleted when setting enabled and remote has no transforms")
                (is (not (t2/exists? :model/Collection :entity_id coll-eid))
                    "Local transforms collection should be deleted when setting enabled and remote has none")))))))))

(deftest import-auto-enables-setting-when-remote-has-transforms-test
  (testing "When setting is disabled and remote has transforms, setting is auto-enabled and transforms are synced"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                local-transform-entity-id (u/generate-nano-id)
                remote-transform-entity-id (u/generate-nano-id)
                remote-coll-entity-id (u/generate-nano-id)]
            (mt/with-temp [:model/Collection {coll-id :id} {:name "Local Transforms Collection"
                                                            :namespace collection/transforms-ns
                                                            :location "/"}
                           :model/Transform {local-transform-id :id} {:name "Local Transform"
                                                                      :entity_id local-transform-entity-id
                                                                      :collection_id coll-id}]
              (is (not (settings/remote-sync-transforms))
                  "remote-sync-transforms should be disabled initially")
              (is (t2/exists? :model/Transform :id local-transform-id)
                  "Local transform should exist before import")
              (let [test-files {"main" {(str "collections/" remote-coll-entity-id "_transforms/" remote-coll-entity-id "_transforms.yaml")
                                        (generate-transforms-namespace-collection-yaml remote-coll-entity-id "Remote Transforms")
                                        (str "collections/" remote-coll-entity-id "_transforms/transforms/" remote-transform-entity-id "_remote_transform.yaml")
                                        (test-helpers/generate-transform-yaml remote-transform-entity-id "Remote Transform" :collection-id remote-coll-entity-id)}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id)]
                (is (= :success (:status result))
                    (str "Import should succeed. Result: " result))
                (is (settings/remote-sync-transforms)
                    "remote-sync-transforms setting should be auto-enabled when remote has transforms")
                (is (t2/exists? :model/Transform :entity_id remote-transform-entity-id)
                    "Remote transform should be imported")
                (is (not (t2/exists? :model/Transform :id local-transform-id))
                    "Local transform should be removed because it's not on the remote")))))))))

;;; ------------------------------------------- build-all-removal-paths Tests -------------------------------------------

(deftest build-all-removal-paths-includes-all-transforms-on-setting-disable-test
  (testing "build-all-removal-paths returns paths for all transforms content when sentinel RSO has 'delete' status"
    (with-clean-python-library
      (fn []
        (mt/with-premium-features #{:transforms}
          (mt/with-temporary-setting-values [remote-sync-transforms true
                                             remote-sync-enabled true]
            (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection"
                                                            :namespace collection/transforms-ns
                                                            :location "/"}
                           :model/Transform {transform-id :id transform-eid :entity_id} {:name "Test Transform"
                                                                                         :collection_id coll-id}
                           :model/TransformTag {tag-id :id tag-eid :entity_id} {:name "Test Tag"
                                                                                :built_in_type nil}]
              (let [library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# test"})
                    lib-eid (:entity_id library)]
                (is (t2/exists? :model/Transform :id transform-id))
                (is (t2/exists? :model/TransformTag :id tag-id))
                (is (t2/exists? :model/PythonLibrary :id (:id library)))
                (let [paths-before (spec/build-all-removal-paths)]
                  (is (not (some #(str/includes? % transform-eid) paths-before))
                      "Transform should not be in removal paths before setting is disabled"))
                (settings/sync-transform-tracking! true)
                (settings/sync-transform-tracking! false)
                (is (t2/exists? :model/RemoteSyncObject
                                :model_type "Collection"
                                :model_id settings/transforms-root-id
                                :status "delete")
                    "Sentinel RSO should exist with 'delete' status")
                (let [paths-after (spec/build-all-removal-paths)]
                  (is (some #(str/includes? % transform-eid) paths-after)
                      "Transform should be in removal paths after setting is disabled")
                  (is (some #(str/includes? % tag-eid) paths-after)
                      "TransformTag should be in removal paths after setting is disabled")
                  (is (some #(str/includes? % lib-eid) paths-after)
                      "PythonLibrary should be in removal paths after setting is disabled"))))))))))

(deftest build-all-removal-paths-excludes-builtin-transform-tags-test
  (testing "build-all-removal-paths respects :conditions and excludes built-in tags"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/TransformTag {custom-tag-id :id custom-tag-eid :entity_id} {:name "Custom Tag"
                                                                                          :built_in_type nil}
                       :model/TransformTag {builtin-tag-id :id builtin-tag-eid :entity_id} {:name "Built-in Tag"
                                                                                            :built_in_type "target"}]
          (is (t2/exists? :model/TransformTag :id custom-tag-id))
          (is (t2/exists? :model/TransformTag :id builtin-tag-id))
          (settings/sync-transform-tracking! true)
          (settings/sync-transform-tracking! false)
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "Collection"
                          :model_id settings/transforms-root-id
                          :status "delete")
              "Sentinel RSO should exist with 'delete' status")
          (let [paths (spec/build-all-removal-paths)]
            (is (some #(str/includes? % custom-tag-eid) paths)
                "Custom tag (built_in_type nil) should be in removal paths")
            (is (not (some #(str/includes? % builtin-tag-eid) paths))
                "Built-in tag should NOT be in removal paths")))))))

(deftest export-excludes-builtin-transform-tags-test
  (testing "Export excludes built-in transform tags based on :conditions"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/TransformTag {custom-tag-id :id} {:name "Custom Tag"
                                                                :built_in_type nil}
                       :model/TransformTag {builtin-tag-id :id} {:name "Built-in Tag"
                                                                 :built_in_type "target"}]
          (is (t2/exists? :model/TransformTag :id custom-tag-id))
          (is (t2/exists? :model/TransformTag :id builtin-tag-id))
          (let [transform-tag-spec (spec/spec-for-model-key :model/TransformTag)
                export-roots (spec/query-export-roots transform-tag-spec)
                exported-ids (set (map second export-roots))]
            (is (contains? exported-ids custom-tag-id)
                "Custom tag (built_in_type nil) should be in export roots")
            (is (not (contains? exported-ids builtin-tag-id))
                "Built-in tag should NOT be in export roots")))))))
