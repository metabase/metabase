(ns metabase-enterprise.remote-sync.transforms-test
  "Tests for transform sync functionality in remote-sync."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.events :as remote-sync.events]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as sync-object]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase-enterprise.transforms-python.core :as transforms-python]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.remote-sync.test-util :as remote-sync.tu]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each
  remote-sync.tu/allow-remote-synced-collections test-helpers/commit-with-temp
  (fn [f]
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (test-helpers/clean-remote-sync-state f))))

(deftest transform-event-creates-sync-object-when-setting-enabled-test
  (testing "Creating a transform creates a RemoteSyncObject entry when remote-sync-transforms is enabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true
                                         remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns}
                       :model/Transform transform {:name "Test Transform" :collection_id coll-id}]
          (events/publish-event! :event/transform-create {:object transform})
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "Transform"
                          :model_id (:id transform))
              "Transform should be tracked when remote-sync-transforms is enabled"))))))

(deftest transform-event-ignored-when-setting-disabled-test
  (testing "Transform events are ignored when remote-sync-transforms is disabled"
    (mt/with-premium-features #{:transforms-basic}
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
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true
                                         remote-sync-type :read-write]
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

(deftest transform-noop-update-does-not-redirty-test
  (testing "A transform-update event whose serialized form is unchanged must not re-dirty a synced transform (GHY-3933)"
    ;; Repro for the \"yellow dot with no changes\" report: editing a non-serialized aspect of a transform
    ;; (e.g. its schedule/run_trigger) — or any no-op re-save — fires :event/transform-update and flips the
    ;; RemoteSyncObject to \"update\", lighting the dirty indicator. But the serialized YAML is identical, so a
    ;; subsequent push produces a commit with no files. The dirty state should track the serialized form, not
    ;; the mere occurrence of an update event.
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-type :read-write
                                         remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
            (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms Collection" :namespace collection/transforms-ns :entity_id "transforms-coll-xxxxx" :location "/"}
                           :model/Transform transform {:name "Synced Transform" :collection_id coll-id}
                           :model/RemoteSyncObject _rso1 {:model_type "Collection" :model_id coll-id :model_name "Transforms Collection" :status "create" :status_changed_at (t/offset-date-time)}
                           :model/RemoteSyncObject _rso2 {:model_type "Transform" :model_id (:id transform) :model_name "Synced Transform" :model_collection_id coll-id :status "create" :status_changed_at (t/offset-date-time)}]
              ;; Establish a synced baseline by exporting to the mock remote.
              (let [mock-source (test-helpers/create-mock-source)
                    result (impl/export! (source.p/snapshot mock-source) task-id "Initial export")]
                (is (= :success (:status result))
                    (str "Export should succeed. Result: " result))
                (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Transform" :model_id (:id transform))))
                    "Transform should be synced after export"))
              ;; Re-publish an update event for the unchanged transform — the serialized form is identical to
              ;; what was just exported, so this must NOT re-dirty it.
              (events/publish-event! :event/transform-update {:object (t2/select-one :model/Transform :id (:id transform))})
              (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Transform" :model_id (:id transform))))
                  "A no-op update must leave the transform synced (GHY-3933)")
              (is (not (sync-object/dirty?))
                  "Instance must not report dirty state after a no-op transform update (GHY-3933)"))))))))

(deftest transform-tag-event-creates-sync-object-test
  (testing "Creating a transform tag creates a RemoteSyncObject entry when transform sync is enabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true
                                         remote-sync-type :read-write]
        (mt/with-temp [:model/TransformTag tag {:name "Test Tag"}]
          (events/publish-event! :event/transform-tag-create {:object tag})
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "TransformTag"
                          :model_id (:id tag))
              "TransformTag should be tracked in RemoteSyncObject"))))))

(deftest transform-tag-event-ignored-when-disabled-test
  (testing "TransformTag events are ignored when transform sync is disabled"
    (mt/with-premium-features #{:transforms-basic}
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
    (mt/with-premium-features #{:transforms-basic}
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
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection coll {:name "Transforms Collection" :namespace collection/transforms-ns :location "/"}]
          (events/publish-event! :event/collection-create {:object coll :user-id (mt/user->id :rasta)})
          (is (not (t2/exists? :model/RemoteSyncObject
                               :model_type "Collection"
                               :model_id (:id coll)))
              "Transforms-namespace collection should NOT be tracked when setting is disabled"))))))

(defn- insert-rso!
  "Inserts a RemoteSyncObject for `model-type` `model-id` in `status`."
  [model-type model-id status]
  (t2/insert! :model/RemoteSyncObject {:model_type model-type :model_id model-id :model_name "T"
                                       :status status :status_changed_at (t/offset-date-time)}))

(defn- rso-status
  "The status of the RemoteSyncObject of `model-type` `model-id`, or nil when there is none."
  [model-type model-id]
  (t2/select-one-fn :status :model/RemoteSyncObject :model_type model-type :model_id model-id))

(defn- transforms-rso-count
  "The number of RemoteSyncObjects of the models that sync with transforms."
  []
  (t2/count :model/RemoteSyncObject :model_type [:in ["Transform" "TransformTag" "TransformTest" "PythonLibrary"]]))

(defn- reset-default-python-library!
  "Replaces the built-in Python library with the default one the migrations create."
  []
  (t2/delete! :model/PythonLibrary :entity_id transforms-python/builtin-entity-id)
  (t2/insert! :model/PythonLibrary {:path       "common.py"
                                    :source     ""
                                    :entity_id  transforms-python/builtin-entity-id
                                    :is_default true}))

(defn- edit-default-python-library!
  "Replaces the built-in Python library with an edited one, returning its ID."
  []
  (reset-default-python-library!)
  (t2/update! :model/PythonLibrary :entity_id transforms-python/builtin-entity-id {:source "def f(): pass"})
  (t2/select-one-pk :model/PythonLibrary :entity_id transforms-python/builtin-entity-id))

(deftest enable-transforms-tracking-creates-rows-test
  (testing "Enabling transforms tracking records a 'create' row for each untracked piece of transforms content"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled    true
                                         remote-sync-type       :read-write
                                         remote-sync-transforms false]
        (mt/with-temp [:model/Collection    {folder-id :id}    {:name "ETL" :namespace collection/transforms-ns}
                       :model/Transform     {transform-id :id} {:name "Untracked" :collection_id folder-id}
                       :model/Transform     {tracked-id :id}   {:name "Tracked" :collection_id folder-id}
                       :model/TransformTag  {tag-id :id}       {:name "Custom Tag"}
                       :model/TransformTest {test-id :id}      {:transform_id transform-id :name "No nulls"}]
          (let [library-id (edit-default-python-library!)]
            (insert-rso! "Transform" tracked-id "synced")
            (settings/remote-sync-transforms! true)
            (remote-sync.events/enable-transforms-tracking!)
            (is (= {["Collection" folder-id]       "create"
                    ["Transform" transform-id]     "create"
                    ["Transform" tracked-id]       "synced"
                    ["TransformTag" tag-id]        "create"
                    ["TransformTest" test-id]      "create"
                    ["PythonLibrary" library-id]   "create"}
                   (into {}
                         (map (juxt (juxt :model_type :model_id) :status))
                         (t2/select :model/RemoteSyncObject))))))))))

(deftest enable-transforms-tracking-skips-default-content-test
  (testing "Enabling transforms tracking with only built-in tags and the default Python library records nothing"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms true]
      (reset-default-python-library!)
      (is (t2/exists? :model/TransformTag :built_in_type [:not= nil]))
      (remote-sync.events/enable-transforms-tracking!)
      (is (not (t2/exists? :model/RemoteSyncObject))))))

(deftest disable-transforms-tracking-test
  (testing "Disabling transforms tracking drops rows never pushed and marks pushed ones removed"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled    true
                                         remote-sync-type       :read-write
                                         remote-sync-transforms false]
        (mt/with-temp [:model/Collection    {folder-id :id} {:name "ETL" :namespace collection/transforms-ns}
                       :model/Collection    {coll-id :id}   {:name "Library" :is_remote_synced true}
                       :model/Transform     {synced-id :id} {:name "Synced" :collection_id folder-id}
                       :model/Transform     {update-id :id} {:name "Updated" :collection_id folder-id}
                       :model/Transform     {create-id :id} {:name "Created" :collection_id folder-id}
                       :model/TransformTag  {tag-id :id}    {:name "Custom Tag"}
                       :model/TransformTest {test-id :id}   {:transform_id synced-id :name "No nulls"}]
          (insert-rso! "Collection" folder-id "synced")
          (insert-rso! "Collection" coll-id "synced")
          (insert-rso! "Transform" synced-id "synced")
          (insert-rso! "Transform" update-id "update")
          (insert-rso! "Transform" create-id "create")
          (insert-rso! "TransformTag" tag-id "create")
          (insert-rso! "TransformTest" test-id "delete")
          (remote-sync.events/disable-transforms-tracking!)
          (is (= {["Collection" folder-id]  "removed"
                  ["Collection" coll-id]    "synced"
                  ["Transform" synced-id]   "removed"
                  ["Transform" update-id]   "removed"
                  ["TransformTest" test-id] "delete"}
                 (into {}
                       (map (juxt (juxt :model_type :model_id) :status))
                       (t2/select :model/RemoteSyncObject)))))))))

(deftest removed-transforms-rows-stay-dirty-when-sync-disabled-test
  (testing "Pushed transforms rows that disabling marks removed still count as dirty, so their removal gets pushed"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled    true
                                         remote-sync-type       :read-write
                                         remote-sync-transforms false]
        (mt/with-temp [:model/Transform {transform-id :id} {:name "Synced"}]
          (insert-rso! "Transform" transform-id "synced")
          (is (not (sync-object/dirty?)))
          (remote-sync.events/disable-transforms-tracking!)
          (is (= "removed" (rso-status "Transform" transform-id)))
          (is (sync-object/dirty?)))))))

(deftest re-enabling-transforms-tracking-restores-removed-rows-test
  (testing "Re-enabling transforms tracking before a push turns removed rows back into updates"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms true]
      (mt/with-temp [:model/Transform {synced-id :id} {:name "Synced"}
                     :model/Transform {created-id :id} {:name "Created"}]
        (insert-rso! "Transform" synced-id "synced")
        (insert-rso! "Transform" created-id "create")
        (remote-sync.events/disable-transforms-tracking!)
        (remote-sync.events/enable-transforms-tracking!)
        (is (= "update" (rso-status "Transform" synced-id)))
        (is (= "create" (rso-status "Transform" created-id)))))))

(deftest re-enabling-transforms-tracking-deletes-removed-rows-of-deleted-content-test
  (testing "Re-enabling transforms tracking turns the removed row of content deleted while sync was off into a delete"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms true]
      (mt/with-temp [:model/Transform {kept-id :id}    {:name "Kept"}
                     :model/Transform {deleted-id :id} {:name "Deleted"}]
        (insert-rso! "Transform" kept-id "synced")
        (insert-rso! "Transform" deleted-id "synced")
        (remote-sync.events/disable-transforms-tracking!)
        (t2/delete! :model/Transform :id deleted-id)
        (remote-sync.events/enable-transforms-tracking!)
        (is (= "update" (rso-status "Transform" kept-id)))
        (is (= "delete" (rso-status "Transform" deleted-id)))))))

(deftest enable-transforms-tracking-records-only-exported-content-test
  (testing "Enabling transforms tracking records rows only for what an export writes, and folder rows carry their own id"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled    true
                                         remote-sync-type       :read-write
                                         remote-sync-transforms true]
        (mt/with-temp [:model/Collection {folder-id :id}   {:name "ETL" :namespace collection/transforms-ns}
                       :model/Collection {archived-id :id} {:name "Old" :namespace collection/transforms-ns :archived true}
                       :model/Transform  {live-id :id}     {:name "Live" :collection_id folder-id}
                       :model/Transform  {stale-id :id}    {:name "Stale" :collection_id archived-id}]
          (remote-sync.events/enable-transforms-tracking!)
          (is (=? {:status "create" :model_collection_id folder-id}
                  (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id folder-id)))
          (is (= "create" (rso-status "Transform" live-id)))
          (is (nil? (rso-status "Collection" archived-id)))
          (is (nil? (rso-status "Transform" stale-id))))))))

(deftest disable-enable-disable-keeps-pushed-rows-removed-test
  (testing "Disabling, re-enabling, and disabling transforms tracking again before a push still removes pushed files"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms true]
      (mt/with-temp [:model/Transform {synced-id :id} {:name "Synced"}
                     :model/Transform {created-id :id} {:name "Created"}]
        (insert-rso! "Transform" synced-id "synced")
        (insert-rso! "Transform" created-id "create")
        (remote-sync.events/disable-transforms-tracking!)
        (remote-sync.events/enable-transforms-tracking!)
        (remote-sync.events/disable-transforms-tracking!)
        (is (= "removed" (rso-status "Transform" synced-id)))
        (is (nil? (rso-status "Transform" created-id)))))))

(deftest sync-transforms-tracking-follows-setting-test
  (testing "Syncing transforms tracking on a read-write instance enables or disables it according to the setting"
    (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                       remote-sync-transforms false]
      (mt/with-temp [:model/Transform {transform-id :id} {:name "T"}]
        (settings/remote-sync-transforms! true)
        (remote-sync.events/sync-transforms-tracking!)
        (is (= "create" (rso-status "Transform" transform-id)))
        (settings/remote-sync-transforms! false)
        (remote-sync.events/sync-transforms-tracking!)
        (is (nil? (rso-status "Transform" transform-id)))))))

(deftest setting-transforms-directly-tracks-nothing-test
  (testing "Changing the remote-sync-transforms setting on its own neither tracks nor untracks transforms content"
    (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                       remote-sync-transforms false]
      (mt/with-temp [:model/Transform {untracked-id :id} {:name "Untracked"}
                     :model/Transform {tracked-id :id}   {:name "Tracked"}]
        (insert-rso! "Transform" tracked-id "synced")
        (settings/remote-sync-transforms! true)
        (is (nil? (rso-status "Transform" untracked-id)))
        (settings/remote-sync-transforms! false)
        (is (= "synced" (rso-status "Transform" tracked-id)))))))

(deftest sync-transforms-tracking-read-only-test
  (testing "A read-only instance publishes nothing, so syncing transforms tracking leaves the rows alone"
    (mt/with-temporary-setting-values [remote-sync-type       :read-only
                                       remote-sync-transforms false]
      (mt/with-temp [:model/Transform {untracked-id :id} {:name "Untracked"}
                     :model/Transform {tracked-id :id}   {:name "Tracked"}]
        (insert-rso! "Transform" tracked-id "synced")
        (settings/remote-sync-transforms! true)
        (remote-sync.events/sync-transforms-tracking!)
        (is (nil? (rso-status "Transform" untracked-id)))
        (settings/remote-sync-transforms! false)
        (remote-sync.events/sync-transforms-tracking!)
        (is (= "synced" (rso-status "Transform" tracked-id)))
        (is (not (sync-object/dirty?)))))))

(deftest settings-api-drives-transforms-tracking-test
  (testing "Toggling remote-sync-transforms through PUT /api/ee/remote-sync/settings tracks and untracks transforms"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                         remote-sync-transforms false]
        (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                    impl/finish-remote-config!   (constantly nil)]
          (mt/with-temp [:model/Transform {created-id :id} {:name "Created"}
                         :model/Transform {synced-id :id}  {:name "Synced"}]
            (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings" {:remote-sync-transforms true})
            (is (= "create" (rso-status "Transform" created-id)))
            (t2/update! :model/RemoteSyncObject {:model_type "Transform" :model_id synced-id} {:status "synced"})
            (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings" {:remote-sync-transforms false})
            (is (nil? (rso-status "Transform" created-id)))
            (is (= "removed" (rso-status "Transform" synced-id)))))))))

(deftest switching-to-read-only-with-transforms-test
  (testing "Saving read-only settings with transforms on, as the setup guide does, leaves nothing unsaved"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                         remote-sync-transforms false]
        (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                    impl/finish-remote-config!   (constantly nil)]
          (mt/with-temp [:model/Transform _ {:name "T"}]
            (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                  {:remote-sync-type :read-only :remote-sync-transforms true})
            (is (true? (settings/remote-sync-transforms)))
            (is (zero? (transforms-rso-count)))
            (is (not (sync-object/dirty?)))))))))

(defn- insert-legacy-transforms-root!
  "Inserts the legacy Transforms root RemoteSyncObject in `status`."
  [status]
  (t2/insert! :model/RemoteSyncObject {:model_type "Collection" :model_id -1 :model_name "Transforms"
                                       :status status :status_changed_at (t/offset-date-time)}))

(defn- legacy-transforms-root-exists?
  "Whether the legacy Transforms root RemoteSyncObject exists."
  []
  (t2/exists? :model/RemoteSyncObject :model_type "Collection" :model_id -1))

(deftest convert-legacy-transforms-root-pending-publish-test
  (testing "A legacy Transforms root pending publish becomes a 'create' row for each untracked piece of content"
    (mt/with-temporary-setting-values [remote-sync-transforms true]
      (doseq [status ["create" "update"]]
        (testing status
          (mt/with-temp [:model/Transform {transform-id :id} {:name "T"}]
            (insert-legacy-transforms-root! status)
            (remote-sync.events/convert-legacy-transforms-root!)
            (is (= "create" (rso-status "Transform" transform-id)))
            (is (not (legacy-transforms-root-exists?)))
            (t2/delete! :model/RemoteSyncObject)))))))

(deftest convert-legacy-transforms-root-concurrently-test
  (testing "Nodes converting the legacy Transforms root at the same time record one row per piece of content"
    (mt/with-temporary-setting-values [remote-sync-transforms true]
      (mt/with-temp [:model/Transform {transform-id :id} {:name "T"}]
        (insert-legacy-transforms-root! "create")
        (let [start (promise)
              nodes (doall (repeatedly 4 #(future @start (remote-sync.events/convert-legacy-transforms-root!))))]
          (deliver start true)
          (run! deref nodes))
        (is (= 1 (t2/count :model/RemoteSyncObject :model_type "Transform" :model_id transform-id)))
        (is (not (legacy-transforms-root-exists?)))))))

(deftest convert-legacy-transforms-root-pending-delete-test
  (testing "A legacy Transforms root pending deletion marks the pushed transforms removed and drops the others"
    (mt/with-temp [:model/Transform {synced-id :id}  {:name "Synced"}
                   :model/Transform {created-id :id} {:name "Created"}]
      (insert-rso! "Transform" synced-id "synced")
      (insert-rso! "Transform" created-id "create")
      (insert-legacy-transforms-root! "delete")
      (remote-sync.events/convert-legacy-transforms-root!)
      (is (= "removed" (rso-status "Transform" synced-id)))
      (is (nil? (rso-status "Transform" created-id)))
      (is (not (legacy-transforms-root-exists?))))))

(deftest convert-legacy-transforms-root-synced-test
  (testing "A synced legacy Transforms root is dropped and leaves the transforms tracking as it was"
    (mt/with-temp [:model/Transform {synced-id :id}    {:name "Synced"}
                   :model/Transform {untracked-id :id} {:name "Untracked"}]
      (insert-rso! "Transform" synced-id "synced")
      (insert-legacy-transforms-root! "synced")
      (remote-sync.events/convert-legacy-transforms-root!)
      (is (= "synced" (rso-status "Transform" synced-id)))
      (is (nil? (rso-status "Transform" untracked-id)))
      (is (not (legacy-transforms-root-exists?))))))

(deftest transforms-included-in-dirty-check-when-enabled-test
  (testing "Transforms are included in dirty check when setting is enabled"
    (mt/with-premium-features #{:transforms-basic}
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
    (mt/with-premium-features #{:transforms-basic}
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
    (mt/with-premium-features #{:transforms-basic}
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
    (mt/with-premium-features #{:transforms-basic}
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
    (mt/with-premium-features #{:transforms-basic}
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
                  (is (some #(str/includes? % "transforms_collection")
                            (keys files-after-export))
                      "Export should include the transforms-namespace collection itself"))))))))))

(deftest export-excludes-transforms-when-setting-disabled-test
  (testing "Export excludes transforms when setting is disabled"
    (mt/with-premium-features #{:transforms-basic}
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
                  (is (not (some #(str/includes? % "collections/transforms/") (keys files-after-export)))
                      "Export should NOT include transform files when setting is disabled"))))))))))

(deftest export-removes-existing-transform-files-when-setting-disabled-test
  (testing "Export removes pre-existing transform files from remote when setting is disabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-type :read-write
                                         remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
            (mt/with-temp [:model/Collection {rs-coll-id :id} {:name "Remote Synced" :is_remote_synced true :entity_id "remote-synced-xxxxxxx" :location "/"}
                           :model/RemoteSyncObject _rso {:model_type "Collection" :model_id rs-coll-id :model_name "Remote Synced" :status "create" :status_changed_at (t/offset-date-time)}]
              ;; Start with transform files already on the remote (from a previous export when setting was enabled)
              (let [initial-files {"main" {"transforms/my_transform/my_transform.yaml" "old transform content"
                                           "transforms/my_transform/steps/step1.yaml" "old step content"
                                           "python-libraries/custom_lib.yaml" "old library content"}}
                    mock-source (test-helpers/create-mock-source :initial-files initial-files)
                    result (impl/export! (source.p/snapshot mock-source) task-id "Test export")]
                (is (= :success (:status result))
                    (str "Export should succeed. Result: " result))
                (let [files-after-export (get @(:files-atom mock-source) "main")]
                  (is (not (some #(str/starts-with? % "transforms/") (keys files-after-export)))
                      "Transform files should be removed from remote when setting is disabled")
                  (is (not (some #(str/starts-with? % "python-libraries/") (keys files-after-export)))
                      "Python library files should be removed from remote when setting is disabled"))))))))))

(defn- generate-transforms-namespace-collection-yaml
  "Generates YAML content for a transforms-namespace collection."
  [entity-id name]
  (format "name: %s
description: null
entity_id: %s
slug: %s
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
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-model-cleanup [:model/Transform :model/Collection]
          (let [task-id             (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                coll-entity-id      "transforms-coll-xxxxx"
                transform-entity-id "test-transform-xxxxxx"
                test-files {"main" {"collections/transforms/transforms/transforms.yaml"
                                    (generate-transforms-namespace-collection-yaml coll-entity-id "Transforms")
                                    "collections/transforms/transforms/test_transform.yaml"
                                    (test-helpers/generate-transform-yaml transform-entity-id "Test Transform" :collection-id coll-entity-id)}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result)))
            (is (t2/exists? :model/Collection :entity_id coll-entity-id :namespace "transforms")
                "Transforms-namespace collection should be imported")
            (is (t2/exists? :model/Transform :entity_id transform-entity-id)
                "Transform should be imported from transforms-namespace collection")))))))

(deftest import-python-transform-with-legacy-map-source-tables-test
  (testing "Import of a python transform with old map-format source-tables converts to vec format"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-model-cleanup [:model/Transform :model/Collection]
          (let [task-id             (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                coll-entity-id      "xforms-coll-legacy-01"
                transform-entity-id "python-legacy-fmt-01x"
                ;; Use old map format: {alias: table_id} — this is how pre-unification exports look
                source-tables-yaml  (format "{orders: %d}" (mt/id :orders))
                test-files {"main" {"collections/transforms/transforms/transforms.yaml"
                                    (generate-transforms-namespace-collection-yaml coll-entity-id "Transforms")
                                    "collections/transforms/transforms/python_transform.yaml"
                                    (test-helpers/generate-python-transform-yaml transform-entity-id "Python Transform"
                                                                                 "test-data (h2)" source-tables-yaml
                                                                                 :collection-id coll-entity-id)}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                result      (impl/import! (source.p/snapshot mock-source) task-id)]
            (is (= :success (:status result))
                (str "Import should succeed. Result: " result))
            (when-let [transform (t2/select-one :model/Transform :entity_id transform-entity-id)]
              (let [source-tables (get-in transform [:source :source-tables])]
                (testing "source-tables is stored as vec format after import"
                  (is (sequential? source-tables)))
                (testing "entry has correct alias and table_id"
                  (let [entry (first source-tables)]
                    (is (= "orders" (:alias entry)))
                    (is (= (mt/id :orders) (:table_id entry)))))
                (testing "entry is enriched with table metadata"
                  (let [entry (first source-tables)]
                    (is (= (mt/id) (:database_id entry)))
                    (is (some? (:table entry)))))))))))))

(deftest archived-transforms-namespace-collection-excluded-from-export-test
  (testing "When a transforms-namespace collection is archived, it and its children are excluded from export"
    (mt/with-premium-features #{:transforms-basic}
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
                           :model/Transform {root-transform-id :id}
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
              (let [initial-files {"main" {"collections/transforms/transforms_collection/transforms_collection.yaml"
                                           (generate-transforms-namespace-collection-yaml coll-eid "Transforms Collection")
                                           "collections/transforms/transforms_collection/child_transform.yaml"
                                           (test-helpers/generate-transform-yaml transform-eid "Child Transform" :collection-id coll-eid)}}
                    mock-source (test-helpers/create-mock-source :initial-files initial-files)]
                (is (some #(str/includes? % "transforms_collection") (keys (get @(:files-atom mock-source) "main"))))
                (is (some #(str/includes? % "child_transform") (keys (get @(:files-atom mock-source) "main"))))
                (t2/update! :model/Collection coll-id {:archived true})
                (events/publish-event! :event/collection-update
                                       {:object (t2/select-one :model/Collection :id coll-id)
                                        :user-id (mt/user->id :rasta)})
                (is (= "delete" (:status (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))))
                (let [result (impl/export! (source.p/snapshot mock-source) task-id "Test export")]
                  (is (= :success (:status result)))
                  (let [files-after-export (get @(:files-atom mock-source) "main")]
                    (is (not (some #(str/includes? % "transforms_collection") (keys files-after-export))))
                    (is (not (some #(str/includes? % "child_transform") (keys files-after-export))))
                    (is (some #(str/includes? % "root_transform") (keys files-after-export))
                        "Root transform should be exported")))))))))))

;;; ------------------------------------------- Collection Cleanup Tests -------------------------------------------

(deftest transforms-collections-included-in-all-syncable-collection-ids-test
  (testing "Transforms collections are included in all-syncable-collection-ids when setting is enabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {transforms-coll-id :id} {:name "Transforms Collection"
                                                                   :namespace collection/transforms-ns
                                                                   :location "/"}]
          (is (contains? (set (spec/all-syncable-collection-ids)) transforms-coll-id)
              "Transforms-namespace collection should be included when setting is enabled")))))
  (testing "Transforms collections are NOT included when setting is disabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Collection {transforms-coll-id :id} {:name "Transforms Collection"
                                                                   :namespace collection/transforms-ns
                                                                   :location "/"}]
          (is (not (contains? (set (spec/all-syncable-collection-ids)) transforms-coll-id))
              "Transforms-namespace collection should NOT be included when setting is disabled"))))))

(deftest import-removes-empty-transforms-collection-not-on-remote-test
  (testing "Import removes empty transforms-namespace collections that don't exist on the remote"
    (mt/with-premium-features #{:transforms-basic}
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
              (let [test-files {"main" {"collections/transforms/remote_transforms/remote_transforms.yaml"
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
    (mt/with-premium-features #{:transforms-basic}
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
              (let [test-files {"main" {"collections/transforms/transforms_collection/transforms_collection.yaml"
                                        (generate-transforms-namespace-collection-yaml coll-entity-id "Transforms Collection")
                                        "collections/transforms/transforms_collection/remote_transform.yaml"
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
    (mt/with-premium-features #{:transforms-basic}
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
              (let [test-files {"main" {"collections/transforms/remote_transforms/remote_transforms.yaml"
                                        (generate-transforms-namespace-collection-yaml remote-coll-entity-id "Remote Transforms")}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id :force? true)]
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
serdes/meta:
- id: %s
  model: PythonLibrary
"
          path
          (str/join "\n" (map #(str "  " %) (str/split-lines source)))
          entity-id
          entity-id))

(deftest python-library-event-creates-sync-object-when-setting-enabled-test
  (testing "Creating a PythonLibrary creates a RemoteSyncObject entry when remote-sync-transforms is enabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true
                                         remote-sync-type :read-write]
        (let [library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# test"})]
          (is (t2/exists? :model/RemoteSyncObject
                          :model_type "PythonLibrary"
                          :model_id (:id library))
              "PythonLibrary should be tracked when remote-sync-transforms is enabled"))))))

(deftest python-library-event-ignored-when-setting-disabled-test
  (testing "PythonLibrary events are ignored when remote-sync-transforms is disabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (let [library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# test"})]
          (is (not (t2/exists? :model/RemoteSyncObject
                               :model_type "PythonLibrary"
                               :model_id (:id library)))
              "PythonLibrary should NOT be tracked when remote-sync-transforms is disabled"))))))

(deftest python-library-event-updates-sync-object-test
  (testing "Updating a PythonLibrary updates the RemoteSyncObject entry when setting is enabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true
                                         remote-sync-type :read-write]
        (let [library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# test"})]
          (t2/update! :model/RemoteSyncObject {:model_type "PythonLibrary" :model_id (:id library)}
                      {:status "synced"})
          (t2/update! :model/PythonLibrary (:id library) {:source "# updated"})
          (let [entry (t2/select-one :model/RemoteSyncObject
                                     :model_type "PythonLibrary"
                                     :model_id (:id library))]
            (is (= "update" (:status entry))
                "PythonLibrary should have 'update' status after modification")))))))

(deftest export-includes-python-library-when-setting-enabled-test
  (testing "Export includes PythonLibrary when remote-sync-transforms is enabled"
    (mt/with-premium-features #{:transforms-basic}
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
                (is (some #(str/includes? % "python_libraries/") (keys files-after-export))
                    "Export should include the PythonLibrary file")))))))))

(deftest import-python-library-from-yaml-test
  (testing "Import brings in PythonLibrary from YAML files"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                lib-entity-id (u/generate-nano-id)
                test-files {"main" {"python_libraries/common_py.yaml"
                                    (generate-python-library-yaml lib-entity-id "common.py" "def shared_func():\n    return 42")}}
                mock-source (test-helpers/create-mock-source :initial-files test-files)
                snapshot (source.p/snapshot mock-source)
                result (impl/import! snapshot task-id)]
            (is (= :success (:status result))
                (str "Import should succeed. Result: " result))
            (is (t2/exists? :model/PythonLibrary :path "common.py")
                "PythonLibrary should be imported")
            (when-let [library (t2/select-one :model/PythonLibrary :path "common.py")]
              (is (str/includes? (:source library) "def shared_func()")
                  "PythonLibrary source should be imported correctly"))))))))

(deftest import-removes-python-library-not-on-remote-test
  (testing "Import removes local PythonLibrary that doesn't exist on the remote, but only when forced (GHY-3900)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/PythonLibrary]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                local-library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# local only"})]
            (is (t2/exists? :model/PythonLibrary :id (:id local-library))
                "Local PythonLibrary should exist before import")
            (let [test-files {"main" {}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)
                  snapshot (source.p/snapshot mock-source)]
              (testing "a non-forced import reports a conflict and preserves the library"
                (is (= :conflict (:status (impl/import! snapshot task-id)))
                    "Import should conflict when it would delete an unsynced local PythonLibrary")
                (is (t2/exists? :model/PythonLibrary :id (:id local-library))
                    "Local PythonLibrary must be preserved when the import is not forced"))
              (testing "forcing the import discards the local library"
                (is (= :success (:status (impl/import! snapshot task-id :force? true))))
                (is (not (t2/exists? :model/PythonLibrary :id (:id local-library)))
                    "Local PythonLibrary should be deleted after a forced import since it wasn't on remote")))))))))

(deftest import-preserves-builtin-python-library-test
  (testing "Import does NOT delete the built-in PythonLibrary even when it's not on remote"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
            ;; Create the builtin library explicitly (fixture cleans PythonLibrary before test)
            (t2/insert-returning-instance! :model/PythonLibrary
                                           {:path "common.py"
                                            :source "# builtin"
                                            :entity_id transforms-python/builtin-entity-id})
            (is (t2/exists? :model/PythonLibrary :entity_id transforms-python/builtin-entity-id)
                "Built-in PythonLibrary should exist before import")
            (let [test-files {"main" {}}  ;; Empty remote - no python libraries
                  mock-source (test-helpers/create-mock-source :initial-files test-files)
                  result (impl/import! (source.p/snapshot mock-source) task-id)]
              (is (= :success (:status result))
                  (str "Import should succeed. Result: " result))
              (is (t2/exists? :model/PythonLibrary :entity_id transforms-python/builtin-entity-id)
                  "Built-in PythonLibrary should NOT be deleted after import"))))))))

(deftest first-import-does-not-conflict-on-builtin-python-library-test
  (testing "A fresh instance's built-in common.py does not block a first import that contains common.py"
    (mt/with-premium-features #{:transforms-basic}
      (doseq [transforms-synced? [false true]]
        (testing (str "remote-sync-transforms " transforms-synced?)
          (mt/with-temporary-setting-values [remote-sync-transforms transforms-synced?
                                             remote-sync-enabled true]
            (mt/with-model-cleanup [:model/RemoteSyncTask :model/PythonLibrary]
              (t2/insert! :model/PythonLibrary {:path      "common.py"
                                                :source    ""
                                                :entity_id transforms-python/builtin-entity-id})
              (let [task-id    (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                               :initiated_by   (mt/user->id :rasta)})
                    test-files {"main" {"python_libraries/common.py.yaml"
                                        (generate-python-library-yaml transforms-python/builtin-entity-id
                                                                      "common.py"
                                                                      "def shared_func():\n    return 42")}}
                    result     (impl/import! (source.p/snapshot (test-helpers/create-mock-source :initial-files test-files))
                                             task-id)]
                (is (= :success (:status result))
                    (str "First import should not conflict. Result: " result))))))))))

(deftest import-replaces-python-library-with-remote-version-test
  (testing "Import updates local PythonLibrary when remote has same entity_id"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true
                                         remote-sync-type :read-write]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                local-library (t2/insert-returning-instance! :model/PythonLibrary {:path "common.py" :source "# local version"})
                local-entity-id (:entity_id local-library)]
            (is (t2/exists? :model/PythonLibrary :path "common.py")
                "Local PythonLibrary should exist before import")
            (let [test-files {"main" {"python_libraries/common_py.yaml"
                                      (generate-python-library-yaml local-entity-id "common.py" "# remote version\ndef new_func():\n    pass")}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)
                  result (impl/import! (source.p/snapshot mock-source) task-id)]
              (is (= :success (:status result))
                  (str "Import should succeed. Result: " result))
              (let [library (t2/select-one :model/PythonLibrary :path "common.py")]
                (is (some? library) "PythonLibrary should still exist")
                (is (str/includes? (:source library) "# remote version")
                    "PythonLibrary source should be updated with remote version")))))))))

;;; ------------------------------------------- Transform Sync Behavior Tests -------------------------------------------

(deftest import-preserves-local-transforms-when-setting-disabled-and-remote-has-none-test
  (testing "When remote-sync-transforms is disabled and remote has no transforms, local transforms are preserved"
    (mt/with-premium-features #{:transforms-basic}
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
                    test-files {"main" {"collections/main/remote_collection/remote_collection.yaml"
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
    (mt/with-premium-features #{:transforms-basic}
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
              (let [test-files {"main" {"collections/transforms/remote_transforms/remote_transforms.yaml"
                                        (generate-transforms-namespace-collection-yaml remote-coll-entity-id "Remote Transforms")
                                        "collections/transforms/remote_transforms/remote_transform.yaml"
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

(deftest import-conflicts-on-local-transforms-when-setting-enabled-and-remote-has-none-test
  (testing "When remote-sync-transforms is enabled and remote has no transforms, deleting unsynced local transforms requires force"
    (mt/with-premium-features #{:transforms-basic}
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
                    test-files {"main" {"collections/main/remote_collection/remote_collection.yaml"
                                        (test-helpers/generate-collection-yaml remote-coll-entity-id "Remote Collection")}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    snapshot (source.p/snapshot mock-source)]
                (testing "a non-forced import reports a conflict instead of silently deleting (GHY-3900)"
                  (is (= :conflict (:status (impl/import! snapshot task-id)))
                      "Import should conflict when it would delete unsynced local transforms")
                  (is (t2/exists? :model/Transform :id local-transform-id)
                      "Local transform must be preserved when the import is not forced")
                  (is (t2/exists? :model/TransformTag :id local-tag-id)
                      "Local tag must be preserved when the import is not forced")
                  (is (t2/exists? :model/Collection :id coll-id)
                      "Local transforms collection must be preserved when the import is not forced"))
                (testing "forcing the import discards the local transforms"
                  (is (= :success (:status (impl/import! snapshot task-id :force? true))))
                  (is (not (t2/exists? :model/Transform :id local-transform-id))
                      "Local transform should be deleted when forced")
                  (is (not (t2/exists? :model/TransformTag :id local-tag-id))
                      "Local tag should be deleted when forced")
                  (is (not (t2/exists? :model/Collection :entity_id coll-eid))
                      "Local transforms collection should be deleted when forced"))))))))))

(deftest import-conflicts-on-non-first-import-when-local-transform-would-be-deleted-test
  (testing "GHY-3900: an already-configured instance (not first import) reports a conflict rather than deleting unsynced local transforms"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Local Transforms Collection"
                                                          :namespace collection/transforms-ns
                                                          :entity_id (u/generate-nano-id)
                                                          :location "/"}
                         :model/Transform {local-transform-id :id} {:name "Local Transform"
                                                                    :entity_id (u/generate-nano-id)
                                                                    :collection_id coll-id}]
            ;; a prior successful import makes this NOT a first import, so the legacy first-import conflict
            ;; gate would not fire — the deletion-conflict gate must catch it regardless.
            (t2/insert! :model/RemoteSyncTask {:sync_task_type "import"
                                               :initiated_by (mt/user->id :rasta)
                                               :cancelled false
                                               :version "prior-version"
                                               :ended_at (t/offset-date-time)})
            (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                  test-files {"main" {"collections/main/remote_collection/remote_collection.yaml"
                                      (test-helpers/generate-collection-yaml (u/generate-nano-id) "Remote Collection")}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)
                  result (impl/import! (source.p/snapshot mock-source) task-id)]
              (is (= :conflict (:status result))
                  (str "Import should conflict on a non-first import too. Result: " result))
              (is (t2/exists? :model/Transform :id local-transform-id)
                  "Local transform must be preserved"))))))))

(deftest import-deletes-synced-transform-without-conflict-test
  (testing "A previously-synced local transform absent from the remote is reconciled away with no conflict"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform :model/RemoteSyncObject]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Local Transforms Collection"
                                                          :namespace collection/transforms-ns
                                                          :entity_id (u/generate-nano-id)
                                                          :location "/"}
                         :model/Transform {local-transform-id :id} {:name "Synced Transform"
                                                                    :entity_id (u/generate-nano-id)
                                                                    :collection_id coll-id}]
            ;; mark the transform as already synced — its removal is a normal reconcile, not data loss
            (t2/insert! :model/RemoteSyncObject {:model_type "Transform"
                                                 :model_id local-transform-id
                                                 :model_name "Synced Transform"
                                                 :status "synced"
                                                 :status_changed_at (t/offset-date-time)})
            (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                  test-files {"main" {"collections/main/remote_collection/remote_collection.yaml"
                                      (test-helpers/generate-collection-yaml (u/generate-nano-id) "Remote Collection")}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)
                  result (impl/import! (source.p/snapshot mock-source) task-id)]
              (is (= :success (:status result))
                  (str "Import should succeed without conflict for already-synced transforms. Result: " result))
              (is (not (t2/exists? :model/Transform :id local-transform-id))
                  "Synced local transform should be reconciled away"))))))))

(deftest import-does-not-conflict-on-builtin-transform-tag-test
  (testing "Built-in TransformTags are excluded from removal and do not trigger a deletion conflict"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/TransformTag]
          (mt/with-temp [:model/TransformTag {builtin-tag-id :id} {:name "Built-in Tag"
                                                                   :entity_id (u/generate-nano-id)
                                                                   :built_in_type "hourly"}]
            (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                  test-files {"main" {"collections/main/remote_collection/remote_collection.yaml"
                                      (test-helpers/generate-collection-yaml (u/generate-nano-id) "Remote Collection")}}
                  mock-source (test-helpers/create-mock-source :initial-files test-files)
                  result (impl/import! (source.p/snapshot mock-source) task-id)]
              (is (= :success (:status result))
                  (str "Built-in tag should not cause a conflict. Result: " result))
              (is (t2/exists? :model/TransformTag :id builtin-tag-id)
                  "Built-in tag should be preserved"))))))))

(deftest import-auto-enables-setting-when-remote-has-transforms-test
  (testing "When setting is disabled and remote has transforms, setting is auto-enabled and transforms are synced"
    (mt/with-premium-features #{:transforms-basic}
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
              (let [test-files {"main" {"collections/transforms/remote_transforms/remote_transforms.yaml"
                                        (generate-transforms-namespace-collection-yaml remote-coll-entity-id "Remote Transforms")
                                        "collections/transforms/remote_transforms/remote_transform.yaml"
                                        (test-helpers/generate-transform-yaml remote-transform-entity-id "Remote Transform" :collection-id remote-coll-entity-id)}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id :force? true)]
                (is (= :success (:status result))
                    (str "Import should succeed. Result: " result))
                (is (settings/remote-sync-transforms)
                    "remote-sync-transforms setting should be auto-enabled when remote has transforms")
                (is (t2/exists? :model/Transform :entity_id remote-transform-entity-id)
                    "Remote transform should be imported")
                (is (not (t2/exists? :model/Transform :id local-transform-id))
                    "Local transform should be removed because it's not on the remote")))))))))

(deftest export-excludes-builtin-transform-tags-test
  (testing "Export excludes built-in transform tags based on :conditions"
    (mt/with-premium-features #{:transforms-basic}
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

(deftest export-includes-builtin-python-library-test
  (testing "Export includes built-in PythonLibrary (common.py) since it has no export-conditions"
    (mt/with-premium-features #{:transforms}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-temp [:model/PythonLibrary builtin-lib {:path "common.py"
                                                         :source "# builtin"
                                                         :entity_id transforms-python/builtin-entity-id}
                       :model/PythonLibrary custom-lib {:path "custom.py"
                                                        :source "# custom"}]
          (let [python-lib-spec (spec/spec-for-model-key :model/PythonLibrary)
                export-roots (spec/query-export-roots python-lib-spec)
                exported-ids (set (map second export-roots))]
            (is (contains? exported-ids (:id builtin-lib))
                "Built-in PythonLibrary should be in export roots")
            (is (contains? exported-ids (:id custom-lib))
                "Custom PythonLibrary should be in export roots")))))))

(deftest import-removes-transform-tag-not-on-remote-test
  (testing "Import removes non-built-in TransformTags that don't exist on the remote (regression: UXW-3710)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/TransformTag :model/Collection]
          (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
                local-tag-entity-id (u/generate-nano-id)
                remote-tag-entity-id (u/generate-nano-id)
                coll-entity-id (u/generate-nano-id)]
            (mt/with-temp [:model/TransformTag {local-tag-id :id} {:name "Local Tag"
                                                                   :entity_id local-tag-entity-id
                                                                   :built_in_type nil}]
              (is (t2/exists? :model/TransformTag :id local-tag-id))
              (let [test-files {"main" {"collections/transforms/transforms_collection/transforms_collection.yaml"
                                        (generate-transforms-namespace-collection-yaml coll-entity-id "Transforms Collection")
                                        "transforms/transform_tags/remote_tag.yaml"
                                        (test-helpers/generate-transform-tag-yaml remote-tag-entity-id "Remote Tag")}}
                    mock-source (test-helpers/create-mock-source :initial-files test-files)
                    result (impl/import! (source.p/snapshot mock-source) task-id :force? true)]
                (is (= :success (:status result))
                    (str "Import should succeed but got: " (:message result)))
                (is (not (t2/exists? :model/TransformTag :id local-tag-id))
                    "Local transform tag should be deleted after import since it wasn't on remote")
                (is (t2/exists? :model/TransformTag :entity_id remote-tag-entity-id)
                    "Remote transform tag should be imported")))))))))

(defn- transform-test-rso [test-id]
  (t2/select-one :model/RemoteSyncObject :model_type "TransformTest" :model_id test-id))

(deftest transform-test-events-track-sync-object-test
  (testing "Creating, updating and deleting a transform test tracks it when remote-sync-transforms is enabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true
                                         remote-sync-type :read-write]
        (mt/with-temp [:model/Transform     {transform-id :id} {:name "Orders Summary"}
                       :model/TransformTest {test-id :id}      {:transform_id transform-id :name "My test"}]
          (is (= "create" (:status (transform-test-rso test-id))))
          (t2/update! :model/RemoteSyncObject (:id (transform-test-rso test-id))
                      {:status "synced" :status_changed_at (t/offset-date-time)})
          (t2/update! :model/TransformTest test-id {:name "Renamed test"})
          (is (=? {:status "update" :model_name "Renamed test"} (transform-test-rso test-id)))
          (t2/update! :model/RemoteSyncObject (:id (transform-test-rso test-id))
                      {:status "synced" :status_changed_at (t/offset-date-time)})
          (t2/delete! :model/TransformTest test-id)
          (is (= "delete" (:status (transform-test-rso test-id)))))))))

(deftest transform-delete-marks-its-tests-deleted-test
  (testing "Deleting a transform marks its tests for deletion, so their files leave the branch with its own"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true
                                         remote-sync-enabled true
                                         remote-sync-type :read-write]
        (mt/with-temp [:model/Transform     {transform-id :id} {:name "Orders Summary"}
                       :model/TransformTest {test-id :id}      {:transform_id transform-id :name "My test"}]
          (t2/update! :model/RemoteSyncObject (:id (transform-test-rso test-id))
                      {:status "synced" :status_changed_at (t/offset-date-time)})
          (t2/delete! :model/Transform transform-id)
          (is (false? (t2/exists? :model/TransformTest :id test-id)))
          (is (= "delete" (:status (transform-test-rso test-id)))))))))

(deftest transform-test-events-ignored-when-setting-disabled-test
  (testing "Transform tests aren't tracked when remote-sync-transforms is disabled"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms false
                                         remote-sync-enabled true]
        (mt/with-temp [:model/Transform     {transform-id :id} {:name "Orders Summary"}
                       :model/TransformTest {test-id :id}      {:transform_id transform-id :name "My test"}]
          (is (nil? (transform-test-rso test-id))))))))

(defn- new-export-task! []
  (t2/delete! :model/RemoteSyncTask)
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)}))

(deftest transform-test-file-moves-with-its-transform-test
  (testing "A transform test is stored under its transform's path, so renaming the transform moves the test's file"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-type :read-write
                                         remote-sync-transforms true
                                         remote-sync-enabled true]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "ETL" :namespace collection/transforms-ns :location "/"}
                         :model/Transform {transform-id :id} {:name "Orders Summary" :collection_id coll-id}
                         :model/TransformTest {test-id :id test-eid :entity_id} {:transform_id transform-id :name "No nulls"}]
            (testing "creating a transform test tracks it"
              (is (= "create" (:status (t2/select-one :model/RemoteSyncObject :model_type "TransformTest" :model_id test-id)))))
            (t2/delete! :model/RemoteSyncObject)
            (doseq [[model-type model-id] [["Collection" coll-id] ["Transform" transform-id] ["TransformTest" test-id]]]
              (t2/insert! :model/RemoteSyncObject {:model_type        model-type
                                                   :model_id          model-id
                                                   :model_name        model-type
                                                   :status            "create"
                                                   :status_changed_at (t/offset-date-time)}))
            (let [mock      (test-helpers/create-mock-source :initial-files {"main" {}})
                  test-path (fn []
                              (some (fn [[path content]] (when (str/includes? content test-eid) path))
                                    (get @(:files-atom mock) "main")))]
              (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-export-task!) "init"))))
              (let [old-path (test-path)]
                (is (str/ends-with? old-path "/etl/orders_summary/no_nulls.yaml"))
                (t2/update! :model/Transform transform-id {:name "Orders Report"})
                (events/publish-event! :event/transform-update {:object (t2/select-one :model/Transform transform-id)})
                (testing "renaming the transform marks its test for update"
                  (is (= "update" (:status (t2/select-one :model/RemoteSyncObject :model_type "TransformTest" :model_id test-id)))))
                (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-export-task!) "rename"))))
                (is (str/ends-with? (test-path) "/etl/orders_report/no_nulls.yaml"))
                (is (not (contains? (get @(:files-atom mock) "main") old-path)))))))))))

(deftest enabling-transforms-sync-with-default-content-test
  (testing "Enabling transforms sync with only built-in tags and the default Python library leaves nothing to push, and a
           pull of a branch with transforms then has no conflicts"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled    true
                                         remote-sync-type       :read-write
                                         remote-sync-transforms false]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Transform :model/Collection]
          (reset-default-python-library!)
          (is (t2/exists? :model/TransformTag :built_in_type [:not= nil]))
          (settings/remote-sync-transforms! true)
          (remote-sync.events/sync-transforms-tracking!)
          (is (not (t2/exists? :model/RemoteSyncObject)))
          (is (not (sync-object/dirty?)))
          (let [coll-eid (u/generate-nano-id)
                files    {"main" {"collections/transforms/remote_transforms/remote_transforms.yaml"
                                  (generate-transforms-namespace-collection-yaml coll-eid "Remote Transforms")
                                  "collections/transforms/remote_transforms/remote_transform.yaml"
                                  (test-helpers/generate-transform-yaml (u/generate-nano-id) "Remote Transform"
                                                                        :collection-id coll-eid)}}
                task-id  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                         :initiated_by   (mt/user->id :rasta)})]
            (is (=? {:status :success}
                    (impl/import! (source.p/snapshot (test-helpers/create-mock-source :initial-files files))
                                  task-id)))))))))

(deftest saving-default-python-library-unchanged-keeps-it-default-test
  (testing "Saving the default Python library unchanged keeps it the default one"
    (reset-default-python-library!)
    (t2/update! :model/PythonLibrary :entity_id transforms-python/builtin-entity-id {:source ""})
    (is (true? (t2/select-one-fn :is_default :model/PythonLibrary :entity_id transforms-python/builtin-entity-id)))))

(deftest edited-python-library-is-not-default-test
  (testing "Editing the default Python library makes it content to publish"
    (edit-default-python-library!)
    (is (false? (t2/select-one-fn :is_default :model/PythonLibrary :entity_id transforms-python/builtin-entity-id)))))

(defn- import-files!
  "Imports `files` on the main branch from a mock source, returning the result."
  [files]
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                :initiated_by   (mt/user->id :rasta)})]
    (impl/import! (source.p/snapshot (test-helpers/create-mock-source :initial-files {"main" files})) task-id)))

(deftest import-ignores-default-builtin-python-library-test
  (testing "A pull of a branch whose only transforms content is the blank built-in common.py leaves transforms sync off"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled    true
                                         remote-sync-transforms false]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Collection]
          (reset-default-python-library!)
          (is (=? {:status :success}
                  (import-files! {"python_libraries/common.py.yaml"
                                  (generate-python-library-yaml transforms-python/builtin-entity-id "common.py" "")})))
          (is (false? (settings/remote-sync-transforms))))))))

(deftest import-enables-transforms-sync-for-edited-builtin-python-library-test
  (testing "A pull of a branch whose built-in common.py has code turns transforms sync on"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled    true
                                         remote-sync-transforms false]
        (mt/with-model-cleanup [:model/RemoteSyncTask :model/Collection]
          (reset-default-python-library!)
          (is (=? {:status :success}
                  (import-files! {"python_libraries/common.py.yaml"
                                  (generate-python-library-yaml transforms-python/builtin-entity-id "common.py"
                                                                "def shared_func():\n    return 42")})))
          (is (true? (settings/remote-sync-transforms))))))))
