(ns metabase-enterprise.remote-sync.layout-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.layout :as remote-sync.layout]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- test-entity [eid entity-name]
  {:serdes/meta [{:id eid :label entity-name :model "Card"}]
   :name        entity-name
   :entity_id   eid})

(defn- flat-layout
  "A layout that puts every entity in `flat/`, named by its entity_id."
  [_ctx entity]
  ["flat" (:entity_id entity)])

(deftest storage-context-layout-test
  (testing "a storage context without a layout resolves paths with the default layout"
    (is (= "collections/main/card_a.yaml"
           (serialization/entity-file-path (serdes/storage-base-context) (test-entity "A" "Card A"))
           (serialization/entity-file-path (serialization/storage-context) (test-entity "A" "Card A")))))
  (testing "a storage context with a layout resolves paths with it"
    (is (= "flat/A.yaml"
           (serialization/entity-file-path (serialization/storage-context flat-layout) (test-entity "A" "Card A"))))))

(defn- new-task! []
  (t2/delete! :model/RemoteSyncTask)
  (t2/insert-returning-pk! :model/RemoteSyncTask
                           {:sync_task_type "export" :initiated_by (mt/user->id :rasta)}))

(defn- seed-create-row! [model-type model-id]
  (t2/insert! :model/RemoteSyncObject
              {:model_type        model-type
               :model_id          model-id
               :model_name        (str model-type " " model-id)
               :status            "create"
               :status_changed_at (t/offset-date-time)}))

(deftest remote-sync-writes-with-its-layout-test
  (testing "every remote-sync path comes from remote-sync.layout/layout"
    (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                       remote-sync-transforms false]
      (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Bench" :is_remote_synced true :location "/"}
                     :model/Card       {card-id :id card-eid :entity_id} {:name "Card A" :collection_id coll-id}]
        (t2/delete! :model/RemoteSyncObject)
        (seed-create-row! "Collection" coll-id)
        (seed-create-row! "Card" card-id)
        (with-redefs [remote-sync.layout/layout flat-layout]
          (testing "full export"
            (let [mock (rs.test/create-mock-source :initial-files {"main" {}})]
              (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "full" :force? true))))
              (is (= #{(str "flat/" coll-eid ".yaml") (str "flat/" card-eid ".yaml")}
                     (set (keys (get @(:files-atom mock) "main")))))
              (is (= (str "flat/" card-eid ".yaml")
                     (t2/select-one-fn :file_path :model/RemoteSyncObject :model_type "Card" :model_id card-id)))))
          (testing "the path an entity's change is compared against"
            (is (= (str "flat/" card-eid ".yaml")
                   (:path (source/row->file-info {:model_type "Card" :model_id card-id})))))
          (testing "incremental export"
            (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card-id} {:status "update" :file_path nil})
            (let [mock (rs.test/create-mock-source :initial-files {"main" {(str "flat/" card-eid ".yaml") (str "entity_id: " card-eid "\n")}})]
              (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "incremental"))))
              (is (= "apply-changes-version" (t2/select-one-fn :version :model/RemoteSyncTask)))
              (is (str/includes? (get-in @(:files-atom mock) ["main" (str "flat/" card-eid ".yaml")]) "Card A")))))))))
