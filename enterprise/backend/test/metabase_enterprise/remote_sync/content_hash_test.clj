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
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as sync-object]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
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

;;; ------------------------------------------- mark-rows-synced! -------------------------------------------

(deftest content-metadata-matches-row-hash-test
  (testing "a full export writes a content_hash matching per-row row->content-hash for every identity flavor —
            including the extract-query overrides (Collection, NativeQuerySnippet), hybrids (Measure), and path
            models (Field) that have no entity_id (GHY-3933)"
    (with-library-synced
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-temp [:model/Database db {:name "DB"}
                       :model/Collection rs {:is_remote_synced true :name "RS" :location "/"}
                       :model/Collection data {:is_remote_synced true :type collection/library-data-collection-type :name "Data"}
                       :model/Collection snips {:name "Snippets" :namespace "snippets"}
                       :model/Card card {:name "Card" :dataset_query (mt/mbql-query venues) :collection_id (:id rs)}
                       :model/NativeQuerySnippet snip {:name "Snip" :content "SELECT 1" :collection_id (:id snips)}
                       :model/Table table {:name "T" :schema "PUBLIC" :db_id (:id db) :is_published true :collection_id (:id data)}
                       :model/Field field {:name "F" :table_id (:id table) :base_type :type/Integer}
                       :model/FieldUserSettings _ {:field_id (:id field) :description "curated"}
                       :model/Measure measure {:name "M" :table_id (:id table)}]
          (mt/with-model-cleanup [:model/RemoteSyncTask]
            (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})
                  rows    (mapv (fn [[mt id]] {:model_type mt :model_id id})
                                [["Card" (:id card)] ["Collection" (:id rs)] ["NativeQuerySnippet" (:id snip)]
                                 ["FieldUserSettings" (:id field)] ["Measure" (:id measure)]])]
              (t2/delete! :model/RemoteSyncObject)
              (doseq [row rows]
                (t2/insert! :model/RemoteSyncObject (merge row {:model_name "x" :status "synced"
                                                                :status_changed_at (t/offset-date-time)})))
              ;; force? routes through full-export!, which computes + records the content_hash for every flavor
              (impl/export! (source.p/snapshot (test-helpers/create-mock-source)) task-id "Full export" :force? true)
              (doseq [{:keys [model_type model_id] :as row} rows]
                (is (= (source/row->content-hash row)
                       (t2/select-one-fn :content_hash :model/RemoteSyncObject :model_type model_type :model_id model_id))
                    (str "written hash should match per-row hash for " model_type))))))))))

(deftest mark-rows-synced!-chunks-rows-test
  (testing "mark-rows-synced! writes every synced row even when they span multiple batches (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                   :model/Card c1 {:name "C1" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}
                   :model/Card c2 {:name "C2" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}
                   :model/Card c3 {:name "C3" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}]
      (t2/delete! :model/RemoteSyncObject)
      (doseq [card [c1 c2 c3]]
        (t2/insert! :model/RemoteSyncObject {:model_type "Card" :model_id (:id card) :model_name (:name card)
                                             :status "create" :status_changed_at (t/offset-date-time)}))
      ;; synced entries keyed by RSO id, carrying each card's real content hash
      (let [synced (mapv (fn [r] {:id (:id r) :file_path "p"
                                  :content_hash (source/row->content-hash (select-keys r [:model_type :model_id]))})
                         (t2/select [:model/RemoteSyncObject :id :model_type :model_id]))]
        ;; force more than one chunk for the 3 rows
        (with-redefs [impl/app-db-batch-size 2]
          (#'impl/mark-rows-synced! (t2/select-pks-set :model/RemoteSyncObject) synced (t/offset-date-time))))
      (doseq [card [c1 c2 c3]]
        (is (= (source/row->content-hash {:model_type "Card" :model_id (:id card)})
               (t2/select-one-fn :content_hash :model/RemoteSyncObject :model_type "Card" :model_id (:id card)))
            (str "every chunked row should get its hash: " (:name card)))))))

(deftest insert-with-metadata!-chunks-rows-test
  (testing "insert-with-metadata! inserts every row with its content_hash even across multiple chunks (GHY-3933)"
    (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                   :model/Card c1 {:name "C1" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}
                   :model/Card c2 {:name "C2" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}
                   :model/Card c3 {:name "C3" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}]
      (t2/delete! :model/RemoteSyncObject)
      (let [rows (mapv (fn [c] {:model_type "Card" :model_id (:id c) :model_name (:name c)
                                :status "synced" :status_changed_at (t/offset-date-time)})
                       [c1 c2 c3])]
        ;; force more than one chunk for the 3 cards
        (with-redefs [impl/app-db-batch-size 2]
          (#'impl/insert-with-metadata! rows [])))
      (doseq [card [c1 c2 c3]]
        (is (= (source/row->content-hash {:model_type "Card" :model_id (:id card)})
               (t2/select-one-fn :content_hash :model/RemoteSyncObject :model_type "Card" :model_id (:id card)))
            (str "every chunked row should be inserted with its hash: " (:name card)))))))

;;; ------------------------------------------- export integration -------------------------------------------
;;; These run a real export! to a mock source — which records the content_hash baseline through the actual
;;; export path (full/incremental) — then fire a no-op update and assert it stays synced. Unlike the
;;; consumer tests above (which seed the hash directly), these exercise the export-side baseline recording.

(defn- export-baseline-then-noop-status!
  "Seeds `create`-status RemoteSyncObject `seeds` (so export has something to write), runs a real export! to
   a mock source (recording content_hash baselines), then publishes a no-op event and returns the resulting
   status of [model-type model-id]. `target` is {:model-type :model-id :topic :object :payload}."
  [seeds {:keys [model-type model-id topic object payload]}]
  (mt/with-model-cleanup [:model/RemoteSyncTask]
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
      (t2/delete! :model/RemoteSyncObject)
      (doseq [seed seeds]
        (t2/insert! :model/RemoteSyncObject (merge {:status "create" :status_changed_at (t/offset-date-time)} seed)))
      (let [mock-source (test-helpers/create-mock-source)
            result      (impl/export! (source.p/snapshot mock-source) task-id "Initial export")]
        (is (= :success (:status result)) (str "export should succeed: " result))
        (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)))
            (str model-type " should be synced after export")))
      (events/publish-event! topic (merge {:object object :user-id (mt/user->id :rasta)} payload))
      (:status (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)))))

(deftest card-export-then-noop-stays-synced-test
  (testing "After a real export, a no-op Card update stays synced (GHY-3933)"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
      (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                     :model/Card card {:name "Card" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}]
        (is (= "synced"
               (export-baseline-then-noop-status!
                [{:model_type "Collection" :model_id (:id coll) :model_name "RS"}
                 {:model_type "Card" :model_id (:id card) :model_name "Card" :model_collection_id (:id coll)}]
                {:model-type "Card" :model-id (:id card) :topic :event/card-update :object card
                 :payload {:previous-object card}})))))))

(deftest dashboard-export-then-noop-stays-synced-test
  (testing "After a real export, a no-op Dashboard update stays synced (GHY-3933)"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
      (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                     :model/Dashboard dash {:name "Dash" :collection_id (:id coll)}]
        (is (= "synced"
               (export-baseline-then-noop-status!
                [{:model_type "Collection" :model_id (:id coll) :model_name "RS"}
                 {:model_type "Dashboard" :model_id (:id dash) :model_name "Dash" :model_collection_id (:id coll)}]
                {:model-type "Dashboard" :model-id (:id dash) :topic :event/dashboard-update :object dash})))))))

(deftest document-export-then-noop-stays-synced-test
  (testing "After a real export, a no-op Document update stays synced (GHY-3933)"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
      (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                     :model/Document doc {:collection_id (u/the-id coll)}]
        (is (= "synced"
               (export-baseline-then-noop-status!
                [{:model_type "Collection" :model_id (:id coll) :model_name "RS"}
                 {:model_type "Document" :model_id (:id doc) :model_name "Doc" :model_collection_id (:id coll)}]
                {:model-type "Document" :model-id (:id doc) :topic :event/document-update :object doc})))))))

(deftest timeline-export-then-noop-stays-synced-test
  (testing "After a real export, a no-op Timeline update stays synced (GHY-3933)"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
      (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS"}
                     :model/Timeline tl {:name "TL" :collection_id (:id coll)}]
        (is (= "synced"
               (export-baseline-then-noop-status!
                [{:model_type "Collection" :model_id (:id coll) :model_name "RS"}
                 {:model_type "Timeline" :model_id (:id tl) :model_name "TL" :model_collection_id (:id coll)}]
                {:model-type "Timeline" :model-id (:id tl) :topic :event/timeline-update :object tl})))))))

(deftest collection-export-then-noop-stays-synced-test
  (testing "After a real export, a no-op Collection update stays synced (GHY-3933)"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
      (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS" :location "/"}]
        (is (= "synced"
               (export-baseline-then-noop-status!
                [{:model_type "Collection" :model_id (:id coll) :model_name "RS"}]
                {:model-type "Collection" :model-id (:id coll) :topic :event/collection-update :object coll})))))))

(deftest transform-tag-export-then-noop-stays-synced-test
  (testing "After a real export, a no-op TransformTag update stays synced (GHY-3933)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms true remote-sync-enabled true]
        (mt/with-temp [:model/TransformTag tag {:name "Tag"}]
          (is (= "synced"
                 (export-baseline-then-noop-status!
                  [{:model_type "TransformTag" :model_id (:id tag) :model_name "Tag"}]
                  {:model-type "TransformTag" :model-id (:id tag) :topic :event/transform-tag-update :object tag}))))))))

(deftest python-library-export-then-noop-stays-synced-test
  (testing "After a real export, a no-op PythonLibrary update stays synced (GHY-3933)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms true remote-sync-enabled true]
        (mt/with-model-cleanup [:model/PythonLibrary]
          (let [lib (t2/insert-returning-instance! :model/PythonLibrary {:path "lib.py" :source "# x"})]
            (is (= "synced"
                   (export-baseline-then-noop-status!
                    [{:model_type "PythonLibrary" :model_id (:id lib) :model_name "lib.py"}]
                    {:model-type "PythonLibrary" :model-id (:id lib) :topic :event/python-library-update :object lib})))))))))

(deftest full-export-records-metadata-and-stays-synced-test
  (testing "A forced full export (real store-and-record! + mark-rows-synced!) writes file_path and
            content_hash, and a subsequent no-op update stays synced (GHY-3933)"
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export" :initiated_by (mt/user->id :rasta)})]
          (mt/with-temp [:model/Collection coll {:is_remote_synced true :name "RS" :location "/"}
                         :model/Card card {:name "Card" :dataset_query (mt/mbql-query venues) :collection_id (:id coll)}
                         :model/RemoteSyncObject _ {:model_type "Collection" :model_id (:id coll) :model_name "RS" :status "create" :status_changed_at (t/offset-date-time)}
                         :model/RemoteSyncObject _ {:model_type "Card" :model_id (:id card) :model_name "Card" :model_collection_id (:id coll) :status "create" :status_changed_at (t/offset-date-time)}
                         ;; a removed/delete row whose entity left the synced set — full export must drop it
                         :model/RemoteSyncObject leftover {:model_type "Card" :model_id 999999 :model_name "Gone" :status "delete" :status_changed_at (t/offset-date-time)}]
            ;; force? routes through full-export! -> store-and-record! (no incremental fast-path)
            (let [mock-source (test-helpers/create-mock-source)
                  result      (impl/export! (source.p/snapshot mock-source) task-id "Full export" :force? true)]
              (is (= :success (:status result)) (str "forced full export should succeed: " result))
              (let [row (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))]
                (is (= "synced" (:status row)))
                (is (some? (:content_hash row)) "content_hash recorded from store-and-record!'s serialization")
                (is (some? (:file_path row)) "file_path recorded from store-and-record!'s serialization"))
              (is (nil? (t2/select-one :model/RemoteSyncObject :id (:id leftover)))
                  "removed/delete row dropped by full export (as the incremental path does)"))
            (events/publish-event! :event/card-update {:object card :previous-object card :user-id (mt/user->id :rasta)})
            (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))))
                "a no-op update after a full export stays synced")))))))

;;; ------------------------------------------- import integration -------------------------------------------
;;; These import a snapshot from a mock source — which records the content_hash baseline through the actual
;;; import path (`insert-with-metadata!`) — then fire a no-op update and assert it stays synced. This is the
;;; "right after a pull" scenario from GHY-3933.

(defn- import-then-noop-status!
  "Imports `files` from a mock source (recording content_hash baselines via the import path), looks up the
   imported entity with `lookup` (a 0-arg thunk returning the instance), publishes a no-op `topic`, and
   returns the resulting RemoteSyncObject status. `payload-fn` (optional) returns extra event payload."
  [files model-type lookup topic & {:keys [payload-fn]}]
  (mt/with-model-cleanup [:model/RemoteSyncTask]
    (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
          ms      (test-helpers/create-mock-source :initial-files files)
          result  (impl/import! (source.p/snapshot ms) task-id :force? true :force-deletion? true)]
      (is (= :success (:status result)) (str "import should succeed: " result))
      (let [entity   (lookup)
            model-id (:id entity)]
        (is (= "synced" (:status (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)))
            (str model-type " should be synced after import"))
        (events/publish-event! topic (merge {:object entity :user-id (mt/user->id :rasta)}
                                            (when payload-fn (payload-fn entity))))
        (:status (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id))))))

(deftest transform-import-then-noop-stays-synced-test
  (testing "After a real import, a no-op Transform update stays synced (GHY-3933)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-model-cleanup [:model/Transform :model/Collection]
          ;; the transform YAML references the "test-data (h2)" database by name; force it to load so the
          ;; import resolves the reference regardless of test order.
          (mt/db)
          (let [coll-eid "transforms-coll-xxxxx"
                tr-eid   "test-transform-xxxxxx"
                files {"main" {"collections/transforms/transforms/transforms.yaml"
                               (test-helpers/generate-collection-yaml coll-eid "Transforms" :namespace "transforms")
                               "collections/transforms/transforms/test_transform.yaml"
                               (test-helpers/generate-transform-yaml tr-eid "Test Transform" :collection-id coll-eid)}}]
            (is (= "synced"
                   (import-then-noop-status!
                    files "Transform"
                    #(t2/select-one :model/Transform :entity_id tr-eid)
                    :event/transform-update)))))))))

(deftest transform-tag-import-then-noop-stays-synced-test
  (testing "After a real import, a no-op TransformTag update stays synced (GHY-3933)"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-enabled true]
        (mt/with-model-cleanup [:model/TransformTag]
          (let [tag-eid "test-transform-tag-xx"
                files {"main" {"transforms/transform_tags/test_tag.yaml"
                               (test-helpers/generate-transform-tag-yaml tag-eid "Test Tag")}}]
            (is (= "synced"
                   (import-then-noop-status!
                    files "TransformTag"
                    #(t2/select-one :model/TransformTag :entity_id tag-eid)
                    :event/transform-tag-update)))))))))
