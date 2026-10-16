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
   [metabase-enterprise.serialization.v2.storage.kind-layout :as kind-layout]
   [metabase.collections.models.collection :as collection]
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

(defn- with-exported-bench!
  "Exports a remote-synced collection with two cards into a fresh MockSource, then calls `f` with
  `{:mock :card-a :card-b}`."
  [f]
  (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                     remote-sync-transforms false]
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                   :model/Card       {card-a :id}  {:name "Card A" :collection_id coll-id}
                   :model/Card       {card-b :id}  {:name "Card B" :collection_id coll-id}]
      (t2/delete! :model/RemoteSyncObject)
      (doseq [[model-type model-id] [["Collection" coll-id] ["Card" card-a] ["Card" card-b]]]
        (seed-create-row! model-type model-id))
      (let [mock (rs.test/create-mock-source :initial-files {"main" {}})]
        (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "init"))))
        (f {:mock mock :card-a card-a :card-b card-b})))))

(defn- written-version []
  (t2/select-one-fn :version :model/RemoteSyncTask))

(deftest full-export-writes-where-the-move-rule-says-test
  (with-exported-bench!
    (fn [{:keys [mock]}]
      (let [calls (atom [])]
        (with-redefs [remote-sync.layout/move-rule (fn [{:keys [computed-path] :as item}]
                                                     (swap! calls conj (dissoc item :computed-path))
                                                     {:write (str "moved/" @computed-path)})]
          (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "full" :force? true)))))
        (is (= #{"moved/collections/main/bench.yaml"
                 "moved/collections/main/bench/card_a.yaml"
                 "moved/collections/main/bench/card_b.yaml"}
               (set (keys (get @(:files-atom mock) "main")))))
        (testing "the rule sees each item's stored path and status"
          (is (= #{{:export :full :model-type "Collection" :status "synced" :stored-path "collections/main/bench.yaml"}
                   {:export :full :model-type "Card" :status "synced" :stored-path "collections/main/bench/card_a.yaml"}
                   {:export :full :model-type "Card" :status "synced" :stored-path "collections/main/bench/card_b.yaml"}}
                 (set @calls))))))))

(deftest incremental-export-asks-the-move-rule-test
  (with-exported-bench!
    (fn [{:keys [mock card-a]}]
      (t2/update! :model/Card card-a {:description "edited"})
      (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card-a} {:status "update"})
      (testing "the rule is asked about unchanged items too, and can make the export a full one"
        (let [asked (atom #{})]
          (with-redefs [remote-sync.layout/move-rule (fn [{:keys [status] :as item}]
                                                       (swap! asked conj [(:model-type item) status])
                                                       (if (and (= :incremental (:export item)) (= "synced" status))
                                                         :remote-sync/incremental-not-possible
                                                         (remote-sync.layout/current-move-rule item)))]
            (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "edit")))))
          (is (= "write-files-version" (written-version)))
          (is (contains? @asked ["Card" "synced"]))
          (is (contains? @asked ["Card" "update"]))))
      (testing "with today's rule an in-place edit stays incremental"
        (t2/update! :model/Card card-a {:description "edited again"})
        (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card-a} {:status "update"})
        (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "edit again"))))
        (is (= "apply-changes-version" (written-version)))))))

(def ^:private kind-layout-paths
  "Where the kind layout puts each file a full export of [[with-kind-layout-content!]] writes today."
  {"collections/main/bench.yaml"                "collections/bench/_collection.yaml"
   "collections/main/bench/card_a.yaml"         "collections/bench/card_a.question.yaml"
   "collections/main/bench/dash.yaml"           "collections/bench/dash.dashboard.yaml"
   "collections/main/bench/dash/dq.yaml"        "collections/bench/dash.dashboard/dq.question.yaml"
   "collections/main/bench/sub.yaml"            "collections/bench/sub/_collection.yaml"
   "collections/transforms/staging.yaml"        "transforms/staging/_collection.yaml"
   "collections/transforms/staging/dedupe.yaml" "transforms/staging/dedupe.transform.yaml"
   "transforms/transform_tags/nightly.yaml"     "transform_tags/nightly.transform_tag.yaml"
   "python_libraries/common.py.yaml"            "python_library/common.py.yaml"})

(defn- with-kind-layout-content!
  "Calls `f` with remote-synced content of each kind whose folder the kind layout changes."
  [f]
  (mt/with-premium-features #{:transforms-basic :transforms-python}
    (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                       remote-sync-enabled    true
                                       remote-sync-transforms true]
      (mt/with-model-cleanup [:model/PythonLibrary :model/TransformTag :model/Transform :model/Card :model/Dashboard
                              :model/Collection]
        (mt/with-temp [:model/Collection {bench :id}   {:name "Bench" :is_remote_synced true :location "/"}
                       :model/Collection _sub          {:name "Sub" :is_remote_synced true :location (str "/" bench "/")}
                       :model/Card       _card         {:name "Card A" :collection_id bench}
                       :model/Dashboard  {dash :id}    {:name "Dash" :collection_id bench}
                       :model/Card       _dq           {:name "DQ" :collection_id bench :dashboard_id dash}
                       :model/Collection {staging :id} {:name "Staging" :namespace collection/transforms-ns :location "/"}
                       :model/Transform  _transform    {:name "Dedupe" :collection_id staging}
                       :model/TransformTag _tag        {:name "Nightly"}]
          (when-not (t2/exists? :model/PythonLibrary :path "common.py")
            (t2/insert! :model/PythonLibrary {:path "common.py" :source "# shared"}))
          (f))))))

(defn- full-export-files!
  "The files of a forced full export into an empty MockSource."
  []
  (let [mock (rs.test/create-mock-source :initial-files {"main" {}})]
    (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "full" :force? true))))
    (get @(:files-atom mock) "main")))

(deftest kind-layout-full-and-incremental-exports-agree-on-names-test
  (testing "with the kind layout, full and incremental exports give two items of one name the same files"
    (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                       remote-sync-transforms false]
      (with-redefs [remote-sync.layout/layout kind-layout/kind-layout]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                       :model/Card       {older :id}   {:name "Orders" :collection_id coll-id
                                                        :created_at #t "2026-01-01T00:00:00Z"}]
          (t2/delete! :model/RemoteSyncObject)
          (seed-create-row! "Collection" coll-id)
          (seed-create-row! "Card" older)
          (let [mock  (rs.test/create-mock-source :initial-files {"main" {}})
                files #(set (keys (get @(:files-atom mock) "main")))]
            (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "first"))))
            (is (= #{"collections/bench/_collection.yaml" "collections/bench/orders.question.yaml"} (files)))
            (mt/with-temp [:model/Card {newer :id} {:name "Orders" :collection_id coll-id
                                                    :created_at #t "2026-02-01T00:00:00Z"}]
              (seed-create-row! "Card" newer)
              (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "incremental"))))
              (is (= "apply-changes-version" (written-version)))
              (let [incremental (files)]
                (is (= #{"collections/bench/_collection.yaml"
                         "collections/bench/orders.question.yaml"
                         "collections/bench/orders_2.question.yaml"}
                       incremental))
                (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "full" :force? true))))
                (is (= incremental (files)) "a full export gives the same names")))))))))

(deftest move-every-item-moves-the-repo-in-one-push-test
  (testing "with the move-every-item rule, the first push after a layout switch moves every file in one commit"
    (with-exported-bench!
      (fn [{:keys [mock card-a]}]
        (let [files #(get @(:files-atom mock) "main")]
          (is (= #{"collections/main/bench.yaml"
                   "collections/main/bench/card_a.yaml"
                   "collections/main/bench/card_b.yaml"}
                 (set (keys (files)))))
          (with-redefs [remote-sync.layout/layout    kind-layout/kind-layout
                        remote-sync.layout/move-rule remote-sync.layout/move-every-item]
            (testing "a push with no local change moves every file"
              (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "switch"))))
              (is (= "write-files-version" (written-version)))
              (is (= #{"collections/bench/_collection.yaml"
                       "collections/bench/card_a.question.yaml"
                       "collections/bench/card_b.question.yaml"}
                     (set (keys (files)))))
              (is (= "collections/bench/card_a.question.yaml"
                     (t2/select-one-fn :file_path :model/RemoteSyncObject :model_type "Card" :model_id card-a))))
            (testing "the next push moves nothing"
              (is (=? {:status :success :outcome {:kind "push-skipped"}}
                      (impl/export! (source.p/snapshot mock) (new-task!) "nothing"))))
            (testing "an edit after the switch is incremental"
              (let [before (files)]
                (t2/update! :model/Card card-a {:description "edited"})
                (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card-a} {:status "update"})
                (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "edit"))))
                (is (= "apply-changes-version" (written-version)))
                (is (= (set (keys before)) (set (keys (files)))))))))))))

(deftest full-export-refuses-two-items-at-one-path-test
  (testing "a full export fails, and writes nothing, when the move rule gives two items one path"
    (with-exported-bench!
      (fn [{:keys [mock]}]
        (let [before (get @(:files-atom mock) "main")]
          (with-redefs [remote-sync.layout/move-rule (constantly {:write "collections/main/same.yaml"})]
            (let [result (impl/export! (source.p/snapshot mock) (new-task!) "clash" :force? true)]
              (is (= :error (:status result)))
              (is (str/includes? (:message result) "Two items have the path collections/main/same.yaml"))))
          (is (= before (get @(:files-atom mock) "main"))))))))

(defn- export-at!
  "Exports to `src` (a versioned source) under a fresh task, completes the task so the next export knows the
  version, and returns the result. `opts` go to `impl/export!`."
  [src message & {:as opts}]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export"
                                                               :initiated_by   (mt/user->id :rasta)})
        result (impl/export! (source.p/snapshot src) task message (assoc opts :source src))]
    (impl/handle-task-result! result task)
    result))

(defn- tree [src]
  (into {} (for [path (source.p/list-files (source.p/snapshot src))]
             [path (source.p/read-file (source.p/snapshot src) path)])))

(deftest move-changed-items-is-one-swap-test
  (testing "with the move-changed-items rule, unchanged items stay at their stored paths in every kind of export"
    (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                       remote-sync-transforms false]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                     :model/Card       {card-a :id}  {:name "Card A" :collection_id coll-id}
                     :model/Card       {card-b :id}  {:name "Card B" :collection_id coll-id}]
        (t2/delete! :model/RemoteSyncObject)
        (doseq [[model-type model-id] [["Collection" coll-id] ["Card" card-a] ["Card" card-b]]]
          (seed-create-row! model-type model-id))
        (t2/delete! :model/RemoteSyncTask)
        (let [src   (rs.test/versioned-source :trees {"v0" {}} :current "v0")
              paths #(set (keys (tree src)))
              edit! (fn [card-id]
                      (t2/update! :model/Card card-id {:description (str "edited " (random-uuid))})
                      (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card-id} {:status "update"}))]
          (is (= :success (:status (export-at! src "init"))))
          (with-redefs [remote-sync.layout/layout    kind-layout/kind-layout
                        remote-sync.layout/move-rule remote-sync.layout/move-changed-items]
            (testing "incremental: the changed card moves, the others stay"
              (edit! card-a)
              (is (= :success (:status (export-at! src "edit A"))))
              (is (= #{"collections/main/bench.yaml"
                       "collections/main/bench/card_b.yaml"
                       "collections/bench/card_a.question.yaml"}
                     (paths))))
            (testing "full: every item stays where it is"
              (is (= :success (:status (export-at! src "full" :force? true))))
              (is (= #{"collections/main/bench.yaml"
                       "collections/main/bench/card_b.yaml"
                       "collections/bench/card_a.question.yaml"}
                     (paths))))
            (testing "merged: the changed card moves, the others stay"
              (let [base   (source.p/version (source.p/snapshot src))
                    commit (source.p/open-commit (source.p/snapshot src))]
                (source.p/stage-upsert! commit {:path "README.md" :content "remote change\n"})
                (source.p/finish-commit! commit "remote")
                (edit! card-b)
                (let [result (export-at! src "merge" :merge? true
                                         :base-snapshot (source.p/snapshot-at src base))]
                  (is (= :success (:status result)) (:message result))
                  (is (= "merged" (get-in result [:outcome :kind])))))
              (is (= #{"README.md"
                       "collections/main/bench.yaml"
                       "collections/bench/card_b.question.yaml"
                       "collections/bench/card_a.question.yaml"}
                     (paths))))))))))

(deftest import-reads-the-kind-layout-test
  (testing "an export rewritten to the kind layout's paths loads to the same app-DB state"
    (with-kind-layout-content!
      (fn []
        (let [before    (full-export-files!)
              _         (is (= (set (keys kind-layout-paths)) (set (keys before)))
                            "the export writes the files the test rewrites")
              rewritten (update-keys before kind-layout-paths)
              mock      (rs.test/create-mock-source :initial-files {"main" rewritten})
              result    (impl/import! (source.p/snapshot mock) (new-task!) :force? true)]
          (is (= :success (:status result)) (:message result))
          (is (= before (full-export-files!))
              "a new export of the loaded content writes the same files"))))))
