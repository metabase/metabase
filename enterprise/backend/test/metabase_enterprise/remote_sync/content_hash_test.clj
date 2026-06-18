(ns metabase-enterprise.remote-sync.content-hash-test
  "Tests for content-hash-based dirty detection in remote sync (GHY-3933).

   The yellow dot / dirty status must track whether an entity's *serialized form* changed since the last
   sync — not merely whether an update event fired. After a sync, each RemoteSyncObject row records a
   `content_hash` of the entity's serialized YAML. When an update event arrives, the consumer re-serializes
   the entity and compares: an unchanged serialization (a no-op save, or an edit to a non-serialized field
   like a transform's schedule) must leave the row `synced`, so a subsequent push produces no empty commit.

   These tests cover every tracked model type (entity-id, hybrid, and path identities) and the
   null-baseline / real-change / revert edge cases."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.remote-sync.content-hash-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as sync-object]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [with-library-synced]]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- noop-update-status!
  "Seeds a synced RemoteSyncObject for [model-type model-id] whose `content_hash` matches the entity's
   current serialization, publishes a no-op `topic` carrying the unchanged `object`, and returns the row's
   status afterward. Asserts a baseline hash is computable for the model type (i.e. serialization works).
   `extra-payload` is merged into the event (e.g. {:previous-object …} for events whose schema requires it)."
  ([model-type model-id topic object]
   (noop-update-status! model-type model-id topic object {}))
  ([model-type model-id topic object extra-payload]
   (t2/delete! :model/RemoteSyncObject)
   (let [row  {:model_type model-type :model_id model-id}
         hash (source/row->content-hash row)]
     (is (some? hash) (str "row->content-hash should be computable for " model-type))
     (t2/insert! :model/RemoteSyncObject
                 (merge row {:model_name        "Baseline"
                             :status            "synced"
                             :content_hash      hash
                             :status_changed_at (t/offset-date-time)}))
     (events/publish-event! topic (merge {:object object :user-id (mt/user->id :rasta)} extra-payload))
     (:status (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)))))

;;; ------------------------------------------- entity-id models -------------------------------------------

(deftest card-noop-update-stays-synced-test
  (testing "A no-op Card update keeps it synced (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                   :model/Card card {:name "Card" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}]
      (is (= "synced" (noop-update-status! "Card" (:id card) :event/card-update card {:previous-object card}))))))

(deftest dashboard-noop-update-stays-synced-test
  (testing "A no-op Dashboard update keeps it synced (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                   :model/Dashboard dash {:name "Dash" :collection_id (:id coll)}]
      (is (= "synced" (noop-update-status! "Dashboard" (:id dash) :event/dashboard-update dash))))))

(deftest document-noop-update-stays-synced-test
  (testing "A no-op Document update keeps it synced (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                   :model/Document doc {:collection_id (u/the-id coll)}]
      (is (= "synced" (noop-update-status! "Document" (:id doc) :event/document-update doc))))))

(deftest timeline-noop-update-stays-synced-test
  (testing "A no-op Timeline update keeps it synced (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                   :model/Timeline tl {:name "TL" :collection_id (:id coll)}]
      (is (= "synced" (noop-update-status! "Timeline" (:id tl) :event/timeline-update tl))))))

(deftest snippet-noop-update-stays-synced-test
  (testing "A no-op NativeQuerySnippet update keeps it synced when the Library is synced (GHY-3933)"
    (with-library-synced
      (mt/with-temp [:model/Collection sc {:name "Snippets" :namespace "snippets"}
                     :model/NativeQuerySnippet snip {:name "Snip" :content "SELECT 1" :collection_id (:id sc)}]
        (is (= "synced" (noop-update-status! "NativeQuerySnippet" (:id snip) :event/snippet-update snip)))))))

(deftest collection-noop-update-stays-synced-test
  (testing "A no-op Collection update keeps it synced (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}]
      (is (= "synced" (noop-update-status! "Collection" (:id coll) :event/collection-update coll))))))

;;; ------------------------------------------- path & hybrid models -------------------------------------------

(deftest table-noop-update-stays-synced-test
  (testing "A no-op Table update keeps it synced (GHY-3933)"
    (mt/with-temp [:model/Database db {:name "DB"}
                   :model/Collection coll {:is_remote_synced true :type collection/library-data-collection-type :name "Data"}
                   :model/Table table {:name "T" :schema "PUBLIC" :db_id (:id db)
                                       :is_published true :collection_id (:id coll)}]
      (is (= "synced" (noop-update-status! "Table" (:id table) :event/table-update table))))))

(deftest field-noop-update-stays-synced-test
  (testing "A no-op Field update keeps it synced (GHY-3933)"
    (mt/with-temp [:model/Database db {:name "DB"}
                   :model/Collection coll {:is_remote_synced true :type collection/library-data-collection-type :name "Data"}
                   :model/Table table {:name "T" :schema "PUBLIC" :db_id (:id db)
                                       :is_published true :collection_id (:id coll)}
                   :model/Field field {:name "F" :table_id (:id table) :base_type :type/Integer}]
      (is (= "synced" (noop-update-status! "Field" (:id field) :event/field-update field))))))

(deftest segment-noop-update-stays-synced-test
  (testing "A no-op Segment update keeps it synced (GHY-3933)"
    (mt/with-temp [:model/Database db {:name "DB"}
                   :model/Collection coll {:is_remote_synced true :type collection/library-data-collection-type :name "Data"}
                   :model/Table table {:name "T" :schema "PUBLIC" :db_id (:id db)
                                       :is_published true :collection_id (:id coll)}
                   :model/Segment seg {:name "S" :table_id (:id table)
                                       :definition {:source-table (:id table) :filter [:> [:field 1 nil] 0]}}]
      (is (= "synced" (noop-update-status! "Segment" (:id seg) :event/segment-update seg))))))

(deftest measure-noop-update-stays-synced-test
  (testing "A no-op Measure update keeps it synced (GHY-3933)"
    (mt/with-model-cleanup [:model/Measure]
      (mt/with-temp [:model/Database db {:name "DB"}
                     :model/Collection coll {:is_remote_synced true :type collection/library-data-collection-type :name "Data"}
                     :model/Table table {:name "T" :schema "PUBLIC" :db_id (:id db)
                                         :is_published true :collection_id (:id coll)}
                     :model/Field _ {:name "F" :table_id (:id table) :base_type :type/Integer}
                     :model/Measure measure {:name "M" :table_id (:id table)}]
        (is (= "synced" (noop-update-status! "Measure" (:id measure) :event/measure-update measure)))))))

;;; ------------------------------------------- transforms models (setting-gated) -------------------------------------------

(deftest transform-noop-update-stays-synced-test
  (testing "A no-op Transform update keeps it synced (GHY-3933)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true remote-sync-enabled true]
        (mt/with-temp [:model/Collection coll {:namespace collection/transforms-ns :location "/"}
                       :model/Transform tr {:name "T" :collection_id (:id coll)}]
          (is (= "synced" (noop-update-status! "Transform" (:id tr) :event/transform-update tr))))))))

(deftest transform-tag-noop-update-stays-synced-test
  (testing "A no-op TransformTag update keeps it synced (GHY-3933)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true remote-sync-enabled true]
        (mt/with-temp [:model/TransformTag tag {:name "Tag"}]
          (is (= "synced" (noop-update-status! "TransformTag" (:id tag) :event/transform-tag-update tag))))))))

(deftest python-library-noop-update-stays-synced-test
  (testing "A no-op PythonLibrary update keeps it synced (GHY-3933)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-transforms true remote-sync-enabled true]
        (mt/with-model-cleanup [:model/PythonLibrary]
          (let [lib (t2/insert-returning-instance! :model/PythonLibrary {:path "lib.py" :source "# x"})]
            (is (= "synced" (noop-update-status! "PythonLibrary" (:id lib) :event/python-library-update lib)))))))))

;;; ------------------------------------------- edge cases -------------------------------------------

(deftest null-baseline-update-marks-dirty-test
  (testing "An update with no recorded baseline hash still marks dirty — exports the first time (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                   :model/Card card {:name "C" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}]
      (t2/delete! :model/RemoteSyncObject)
      (t2/insert! :model/RemoteSyncObject {:model_type "Card" :model_id (:id card) :model_name "C"
                                           :status "synced" :status_changed_at (t/offset-date-time)})
      (events/publish-event! :event/card-update {:object card :previous-object card :user-id (mt/user->id :rasta)})
      (is (= "update" (:status (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))))
          "A null content_hash baseline must be treated as dirty"))))

(deftest changed-content-marks-dirty-test
  (testing "A real change to serialized content marks dirty (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                   :model/Card card {:name "Original" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}]
      (t2/delete! :model/RemoteSyncObject)
      (t2/insert! :model/RemoteSyncObject {:model_type "Card" :model_id (:id card) :model_name "Original"
                                           :status "synced"
                                           :content_hash (source/row->content-hash {:model_type "Card" :model_id (:id card)})
                                           :status_changed_at (t/offset-date-time)})
      (t2/update! :model/Card (:id card) {:name "Renamed"})
      (events/publish-event! :event/card-update {:object (t2/select-one :model/Card :id (:id card))
                                                 :previous-object card
                                                 :user-id (mt/user->id :rasta)})
      (is (= "update" (:status (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))))
          "A changed serialization must mark the row dirty"))))

(deftest revert-to-baseline-resyncs-test
  (testing "An update whose content matches the synced baseline clears a stale dirty flag (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                   :model/Card card {:name "C" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}]
      (t2/delete! :model/RemoteSyncObject)
      (t2/insert! :model/RemoteSyncObject {:model_type "Card" :model_id (:id card) :model_name "C"
                                           :status "update"
                                           :content_hash (source/row->content-hash {:model_type "Card" :model_id (:id card)})
                                           :status_changed_at (t/offset-date-time)})
      (events/publish-event! :event/card-update {:object card :previous-object card :user-id (mt/user->id :rasta)})
      (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))))
          "Content matching the baseline must clear a stale dirty flag")
      (is (not (sync-object/dirty?))))))
