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
   [metabase.util.yaml :as yaml]
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
  {"collections/main/bench.yaml"                "collections/main/bench/collection.yaml"
   "collections/main/bench/card_a.yaml"         "collections/main/bench/card_a.question.yaml"
   "collections/main/bench/dash.yaml"           "collections/main/bench/dash.dashboard.yaml"
   "collections/main/bench/dash/dq.yaml"        "collections/main/bench/dash.dashboard/dq.question.yaml"
   "collections/main/bench/sub.yaml"            "collections/main/bench/sub/collection.yaml"
   "collections/transforms/staging.yaml"        "transforms/staging/collection.yaml"
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
            (is (= #{"collections/main/bench/collection.yaml" "collections/main/bench/orders.question.yaml"} (files)))
            (mt/with-temp [:model/Card {newer :id} {:name "Orders" :collection_id coll-id
                                                    :created_at #t "2026-02-01T00:00:00Z"}]
              (seed-create-row! "Card" newer)
              (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "incremental"))))
              (is (= "apply-changes-version" (written-version)))
              (let [incremental (files)]
                (is (= #{"collections/main/bench/collection.yaml"
                         "collections/main/bench/orders.question.yaml"
                         "collections/main/bench/orders_2.question.yaml"}
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
              (is (= #{"collections/main/bench/collection.yaml"
                       "collections/main/bench/card_a.question.yaml"
                       "collections/main/bench/card_b.question.yaml"}
                     (set (keys (files)))))
              (is (= "collections/main/bench/card_a.question.yaml"
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

(deftest full-export-never-writes-two-items-at-one-path-test
  (with-exported-bench!
    (fn [{:keys [mock]}]
      (let [before (get @(:files-atom mock) "main")
            clash  (constantly {:write "collections/main/same.yaml"})]
        (testing "when the move rule gives two items one path, the export moves every item to its computed path"
          (with-redefs [remote-sync.layout/move-rule clash]
            (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "clash" :force? true)))))
          (is (= (set (keys before)) (set (keys (get @(:files-atom mock) "main"))))))
        (testing "when that clashes too, the export fails and writes nothing"
          (with-redefs [remote-sync.layout/move-rule       clash
                        remote-sync.layout/move-every-item clash]
            (let [result (impl/export! (source.p/snapshot mock) (new-task!) "clash" :force? true)]
              (is (= :error (:status result)))
              (is (str/includes? (str (:message result)) "Two items have the path collections/main/same.yaml"))))
          (is (= (set (keys before)) (set (keys (get @(:files-atom mock) "main"))))))))))

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
                       "collections/main/bench/card_a.question.yaml"}
                     (paths))))
            (testing "full: every item stays where it is"
              (is (= :success (:status (export-at! src "full" :force? true))))
              (is (= #{"collections/main/bench.yaml"
                       "collections/main/bench/card_b.yaml"
                       "collections/main/bench/card_a.question.yaml"}
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
                       "collections/main/bench/card_b.question.yaml"
                       "collections/main/bench/card_a.question.yaml"}
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

(defn- ensure-library!
  "The Library collection, created with its system collections when the instance has none."
  []
  (or (collection/library-collection) (collection/create-library-collection!)))

(defn- set-library-remote-synced!
  "Marks the Library and its system collections remote-synced, or not."
  [synced?]
  (t2/update! :model/Collection {:type [:in collection/library-collection-types]} {:is_remote_synced synced?}))

(defn- export-library-metric!
  "With the kind layout, creates a synced Library holding a metric, exports it into a fresh MockSource, and calls `f`
  with the source and the metric's id."
  [f]
  (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                     remote-sync-transforms false]
    (with-redefs [remote-sync.layout/layout kind-layout/kind-layout]
      (ensure-library!)
      (set-library-remote-synced! true)
      (let [metrics-id (t2/select-one-pk :model/Collection :entity_id "librarylibrarymetrics")]
        (mt/with-temp [:model/Card {card-id :id} {:name "MRR" :type :metric :collection_id metrics-id}]
          (t2/delete! :model/RemoteSyncObject)
          (seed-create-row! "Card" card-id)
          (let [mock (rs.test/create-mock-source :initial-files {"main" {}})]
            (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "metric" :force? true))))
            (is (contains? (get @(:files-atom mock) "main") "metrics/mrr.metric.yaml"))
            (is (not-any? #(str/starts-with? % "collections/") (keys (get @(:files-atom mock) "main")))
                "the Library has no files of its own")
            (f mock card-id)))))))

(deftest kind-layout-pull-turns-library-sync-on-test
  (testing "a pull of a kind-layout repo that holds Library content turns Library sync on"
    (export-library-metric!
     (fn [mock _card-id]
       (set-library-remote-synced! false)
       (let [result (impl/import! (source.p/snapshot mock) (new-task!) :force? true)]
         (is (= :success (:status result)) (:message result))
         (is (true? (t2/select-one-fn :is_remote_synced :model/Collection
                                      :entity_id collection/library-entity-id)))))))
  (testing "but not when the repo holds only a user's own file in a Library folder"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (with-redefs [remote-sync.layout/layout kind-layout/kind-layout]
        (ensure-library!)
        (set-library-remote-synced! false)
        (let [mock   (rs.test/create-mock-source :initial-files {"main" {"data/notes.yaml" "notes: true\n"}})
              result (impl/import! (source.p/snapshot mock) (new-task!) :force? true)]
          (is (= :success (:status result)) (:message result))
          (is (false? (t2/select-one-fn :is_remote_synced :model/Collection
                                        :entity_id collection/library-entity-id))))))))

(defn- with-published-venues!
  "Publishes the test `venues` table in a synced Library Data collection, with a table setting, a column setting and a
  remapping to a column of `categories`, and calls `f` with a MockSource that holds a forced full export in the
  layout `layout`."
  [layout f]
  (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                     remote-sync-transforms false]
    (collection/ensure-library-collection!)
    (rs.test/set-library-remote-synced! true)
    (let [data-id (t2/select-one-pk :model/Collection :entity_id "librarylibrarydatadat")]
      (mt/with-temp-vals-in-db :model/Table (mt/id :venues) {:is_published true :collection_id data-id}
        ;; a pull re-creates the rows the test deletes, under new ids
        (mt/with-model-cleanup [:model/TableUserSettings :model/FieldUserSettings :model/Dimension]
          (mt/with-temp [:model/TableUserSettings _ {:table_id (mt/id :venues) :display_name "Places"}
                         :model/FieldUserSettings _ {:field_id (mt/id :venues :price) :description "Cost"}
                         :model/Dimension _ {:field_id (mt/id :venues :category_id) :type :external :name "Category"
                                             :human_readable_field_id (mt/id :categories :name)}]
            (t2/delete! :model/RemoteSyncObject)
            (with-redefs [remote-sync.layout/layout layout]
              (let [mock (rs.test/create-mock-source :initial-files {"main" {}})]
                (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "full" :force? true))))
                (f mock)))))))))

(def ^:private venues-file "data/venues.table.yaml")

(deftest one-file-per-table-git-sync-round-trip-test
  (with-published-venues!
    kind-layout/kind-layout
    (fn [mock]
      (let [files    (get @(:files-atom mock) "main")
            document (yaml/parse-string (get files venues-file))]
        (testing "a published table is one file: its settings, then its columns with their settings and remappings"
          (is (= "Places" (:display_name document)))
          (is (= (t2/select-fn-vec :name :model/Field :table_id (mt/id :venues) {:order-by [[:position :asc]]})
                 (map :name (:columns document))))
          (is (=? {:description "Cost"} (some #(when (= "PRICE" (:name %)) %) (:columns document))))
          (is (=? {:remapping {:human_readable_field_id ["test-data (h2)" "PUBLIC" "CATEGORIES" "NAME"]}}
                  (some #(when (= "CATEGORY_ID" (:name %)) %) (:columns document))))
          (is (not (contains? document :metadata)) "git sync writes no schema")
          (is (not-any? #(str/starts-with? % "databases/") (keys files)))
          (is (not-any? #(str/starts-with? % "data/venues.table/") (keys files))))
        (testing "a pull loads the settings back"
          (t2/delete! :model/TableUserSettings :table_id (mt/id :venues))
          (t2/delete! :model/FieldUserSettings :field_id (mt/id :venues :price))
          (t2/delete! :model/Dimension :field_id (mt/id :venues :category_id))
          (let [result (impl/import! (source.p/snapshot mock) (new-task!) :force? true)]
            (is (= :success (:status result)) (:message result)))
          (is (= "Places" (t2/select-one-fn :display_name :model/TableUserSettings :table_id (mt/id :venues))))
          (is (= "Cost" (t2/select-one-fn :description :model/FieldUserSettings :field_id (mt/id :venues :price))))
          (is (=? {:human_readable_field_id (mt/id :categories :name)}
                  (t2/select-one :model/Dimension :field_id (mt/id :venues :category_id)))))
        (testing "an export after a column setting changes rewrites the table's file"
          (t2/update! :model/FieldUserSettings {:field_id (mt/id :venues :price)} {:description "Price level"})
          (t2/update! :model/RemoteSyncObject {:model_type "FieldUserSettings" :model_id (mt/id :venues :price)}
                      {:status "update"})
          (is (t2/exists? :model/RemoteSyncObject :model_type "FieldUserSettings" :status "update"))
          (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "edit column"))))
          (is (=? {:description "Price level"}
                  (some #(when (= "PRICE" (:name %)) %)
                        (:columns (yaml/parse-string (get-in @(:files-atom mock) ["main" venues-file])))))))))))

(deftest old-table-files-still-load-test
  (testing "a repo whose table settings are files of their own, as the earlier layout writes them, still loads"
    (with-published-venues!
      serialization/default-layout
      (fn [mock]
        (is (some #(str/includes? % "___fieldusersettings") (keys (get @(:files-atom mock) "main"))))
        (t2/delete! :model/FieldUserSettings :field_id (mt/id :venues :price))
        (t2/delete! :model/Dimension :field_id (mt/id :venues :category_id))
        (with-redefs [remote-sync.layout/layout kind-layout/kind-layout]
          (let [result (impl/import! (source.p/snapshot mock) (new-task!) :force? true)]
            (is (= :success (:status result)) (:message result))))
        (is (= "Cost" (t2/select-one-fn :description :model/FieldUserSettings :field_id (mt/id :venues :price))))
        (is (t2/exists? :model/Dimension :field_id (mt/id :venues :category_id)))))))

(defn- ai-context [entity-type entity-id]
  (t2/select-one-fn :ai_context :model/OsiAiContext :entity_type entity-type :entity_local_id entity-id))

(deftest ai-context-syncs-with-its-item-test
  (mt/with-model-cleanup [:model/OsiAiContext]
    (with-published-venues!
      kind-layout/kind-layout
      (fn [_]
        (let [metrics-id (t2/select-one-pk :model/Collection :entity_id "librarylibrarymetrics")]
          (mt/with-temp [:model/Card {card-id :id} {:name "MRR" :type :metric :collection_id metrics-id
                                                    :dataset_query {:database (mt/id) :type :query
                                                                    :query    {:source-table (mt/id :venues)
                                                                               :aggregation  [[:count]]}}}]
            (t2/insert! :model/OsiAiContext {:entity_type "card" :entity_local_id card-id
                                             :ai_context {:instructions "Monthly recurring revenue"}})
            (t2/insert! :model/OsiAiContext {:entity_type "table" :entity_local_id (mt/id :venues)
                                             :ai_context {:synonyms ["places"]}})
            (with-redefs [remote-sync.layout/layout kind-layout/kind-layout]
              (let [mock  (rs.test/create-mock-source :initial-files {"main" {}})
                    files #(get @(:files-atom mock) "main")]
                (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "full" :force? true))))
                (testing "each item's AI context is in the item's folder"
                  (is (=? {:ai_context {:instructions "Monthly recurring revenue"}}
                          (yaml/parse-string (get (files) "metrics/mrr.metric/ai_context.yaml"))))
                  (is (=? {:ai_context {:synonyms ["places"]}}
                          (yaml/parse-string (get (files) "data/venues.table/ai_context.yaml"))))
                  (is (not-any? #(str/starts-with? % "osi_ai_context/") (keys (files)))))
                (testing "a pull loads it back"
                  (t2/delete! :model/OsiAiContext)
                  (let [result (impl/import! (source.p/snapshot mock) (new-task!) :force? true)]
                    (is (= :success (:status result)) (:message result)))
                  (is (= {:instructions "Monthly recurring revenue"} (ai-context "card" card-id)))
                  (is (= {:synonyms ["places"]} (ai-context "table" (mt/id :venues)))))
                (testing "a change to it marks its item changed, and the next push writes it"
                  (t2/update! :model/OsiAiContext {:entity_type "card" :entity_local_id card-id}
                              {:ai_context {:instructions "MRR, net of refunds"}})
                  (is (t2/exists? :model/RemoteSyncObject :model_type "Card" :model_id card-id :status "update"))
                  (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "edit"))))
                  (is (=? {:ai_context {:instructions "MRR, net of refunds"}}
                          (yaml/parse-string (get (files) "metrics/mrr.metric/ai_context.yaml")))))
                (testing "a pull removes AI context the repo no longer holds for a synced item"
                  (swap! (:files-atom mock) update "main" dissoc "data/venues.table/ai_context.yaml")
                  (is (= :success (:status (impl/import! (source.p/snapshot mock) (new-task!) :force? true))))
                  (is (nil? (ai-context "table" (mt/id :venues))))
                  (is (some? (ai-context "card" card-id))))
                (testing "a deleted item's AI context leaves the repo at the next push"
                  (t2/update! :model/Card card-id {:archived true})
                  (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id card-id} {:status "delete"})
                  (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "delete"))))
                  (is (not-any? #(str/starts-with? % "metrics/mrr.metric") (keys (files)))))))))))))

(defn- with-move-changed-items!
  "Calls `f` with the kind layout and the move-changed-items rule swapped in, and remote sync on."
  [f]
  (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                     remote-sync-transforms false]
    (with-redefs [remote-sync.layout/layout    kind-layout/kind-layout
                  remote-sync.layout/move-rule remote-sync.layout/move-changed-items]
      (t2/delete! :model/RemoteSyncObject)
      (t2/delete! :model/RemoteSyncTask)
      (f))))

(defn- card-path [card-id]
  (t2/select-one-fn :file_path :model/RemoteSyncObject :model_type "Card" :model_id card-id))

(deftest move-changed-items-falls-back-on-duplicate-names-test
  (testing "when kept paths and computed paths clash, the push moves every item instead of failing"
    (with-move-changed-items!
      (fn []
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                       :model/Card       {x :id}       {:name "Orders" :collection_id coll-id
                                                        :created_at #t "2026-01-01T00:00:00Z"}
                       :model/Card       {y :id}       {:name "Orders" :collection_id coll-id
                                                        :created_at #t "2026-01-02T00:00:00Z"}]
          (doseq [[model-type model-id] [["Collection" coll-id] ["Card" x] ["Card" y]]]
            (seed-create-row! model-type model-id))
          (let [src (rs.test/versioned-source :trees {"v0" {}} :current "v0")]
            (is (= :success (:status (export-at! src "first"))))
            (is (= "collections/main/bench/orders_2.question.yaml" (card-path y)))
            (t2/update! :model/Card x {:archived true})
            (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id x} {:status "delete"})
            (is (= :success (:status (export-at! src "archive X"))))
            (is (= "collections/main/bench/orders_2.question.yaml" (card-path y))
                "the rule keeps the unchanged card where it is")
            (mt/with-temp [:model/Card {z :id} {:name "Orders" :collection_id coll-id
                                                :created_at #t "2026-01-03T00:00:00Z"}]
              (seed-create-row! "Card" z)
              (let [result (export-at! src "new Orders")]
                (is (= :success (:status result)) (:message result)))
              (is (= "collections/main/bench/orders.question.yaml" (card-path y)))
              (is (= "collections/main/bench/orders_2.question.yaml" (card-path z)))
              (is (= #{"collections/main/bench/collection.yaml"
                       "collections/main/bench/orders.question.yaml"
                       "collections/main/bench/orders_2.question.yaml"}
                     (set (keys (tree src))))))))))))

(deftest move-changed-items-falls-back-after-a-folder-rename-test
  (testing "an unchanged item in a renamed folder, and a new item that computes its path: the push moves every item"
    (with-move-changed-items!
      (fn []
        (mt/with-temp [:model/Collection {a :id} {:name "Sales" :is_remote_synced true :location "/"}
                       :model/Card       {k :id} {:name "K" :collection_id a}]
          (seed-create-row! "Collection" a)
          (seed-create-row! "Card" k)
          (let [src (rs.test/versioned-source :trees {"v0" {}} :current "v0")]
            (is (= :success (:status (export-at! src "first"))))
            (t2/update! :model/Collection a {:name "Ops"})
            (t2/update! :model/RemoteSyncObject {:model_type "Collection" :model_id a} {:status "update"})
            (is (= :success (:status (export-at! src "rename"))))
            (is (= "collections/main/sales/k.question.yaml" (card-path k)) "the rule keeps the unchanged card")
            (mt/with-temp [:model/Collection {b :id} {:name "Sales" :is_remote_synced true :location "/"}
                           :model/Card       {k2 :id} {:name "K" :collection_id b}]
              (seed-create-row! "Collection" b)
              (seed-create-row! "Card" k2)
              (testing "forced push"
                (let [result (export-at! src "new Sales" :force? true)]
                  (is (= :success (:status result)) (:message result))))
              (is (= "collections/main/ops/k.question.yaml" (card-path k)))
              (is (= "collections/main/sales/k.question.yaml" (card-path k2))))))))))

(deftest move-changed-items-falls-back-in-a-merge-test
  (testing "the pull merge and the merged export also move every item when the rule's paths clash"
    (with-move-changed-items!
      (fn []
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                       :model/Card       {x :id}       {:name "Orders" :collection_id coll-id
                                                        :created_at #t "2026-01-01T00:00:00Z"}
                       :model/Card       {y :id}       {:name "Orders" :collection_id coll-id
                                                        :created_at #t "2026-01-02T00:00:00Z"}]
          (doseq [[model-type model-id] [["Collection" coll-id] ["Card" x] ["Card" y]]]
            (seed-create-row! model-type model-id))
          (let [src           (rs.test/versioned-source :trees {"v0" {}} :current "v0")
                remote-ahead! (fn [content]
                                (let [commit (source.p/open-commit (source.p/snapshot src))]
                                  (source.p/stage-upsert! commit {:path "README.md" :content content})
                                  (source.p/finish-commit! commit "remote")))]
            (is (= :success (:status (export-at! src "first"))))
            (t2/update! :model/Card x {:archived true})
            (t2/update! :model/RemoteSyncObject {:model_type "Card" :model_id x} {:status "delete"})
            (is (= :success (:status (export-at! src "archive X"))))
            (mt/with-temp [:model/Card {z :id} {:name "Orders" :collection_id coll-id
                                                :created_at #t "2026-01-03T00:00:00Z"}]
              (seed-create-row! "Card" z)
              (testing "pull merge"
                (let [base   (source.p/version (source.p/snapshot src))
                      _      (remote-ahead! "one\n")
                      task   (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                             :initiated_by   (mt/user->id :rasta)})
                      result (impl/import! (source.p/snapshot src) task :merge? true
                                           :base-snapshot (source.p/snapshot-at src base))]
                  (impl/handle-task-result! result task)
                  (is (= :success (:status result)) (:message result))))
              (testing "merged export"
                (let [base   (source.p/version (source.p/snapshot src))
                      _      (remote-ahead! "two\n")
                      result (export-at! src "merge" :merge? true :base-snapshot (source.p/snapshot-at src base))]
                  (is (= :success (:status result)) (:message result))
                  (is (= "merged" (get-in result [:outcome :kind])))))
              (is (= #{"README.md"
                       "collections/main/bench/collection.yaml"
                       "collections/main/bench/orders.question.yaml"
                       "collections/main/bench/orders_2.question.yaml"}
                     (set (keys (tree src))))))))))))
