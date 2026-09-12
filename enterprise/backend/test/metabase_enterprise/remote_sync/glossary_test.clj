(ns metabase-enterprise.remote-sync.glossary-test
  "Glossary entries are synced globally when the Library collection is remote-synced, like snippets."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.events :as rs-events]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as sync-object]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.events.core :as events]
   [metabase.glossary.core :as glossary.core]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
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

(use-fixtures :each (fn [f]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
                        (clean-remote-sync-state f)))
  test-helpers/commit-with-temp)

(defn- rso [entry]
  (t2/select-one :model/RemoteSyncObject :model_type "Glossary" :model_id (:id entry)))

(defn- with-rso! [entry status]
  (t2/insert! :model/RemoteSyncObject {:model_type        "Glossary"
                                       :model_id          (:id entry)
                                       :model_name        (:term entry)
                                       :status            status
                                       :status_changed_at (t/offset-date-time)
                                       :content_hash      (source/row->content-hash {:model_type "Glossary"
                                                                                     :model_id   (:id entry)})}))

;;; ------------------------------------------- Event Handler Tests -------------------------------------------

(deftest create-event-tracks-entry-when-library-synced-test
  (collections.tu/with-library-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-model-cleanup [:model/Glossary]
        (let [entry (glossary.core/create-entry! (mt/user->id :rasta) {:term "ARR" :definition "Annual recurring revenue"})]
          (is (=? {:status "create" :model_name "ARR"} (rso entry))))))))

(deftest create-event-ignored-when-library-not-synced-test
  (collections.tu/with-library-not-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-model-cleanup [:model/Glossary]
        (let [entry (glossary.core/create-entry! (mt/user->id :rasta) {:term "ARR" :definition "Annual recurring revenue"})]
          (is (nil? (rso entry))))))))

(deftest update-event-marks-synced-entry-for-update-test
  (collections.tu/with-library-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
        (with-rso! entry "synced")
        (testing "saving the same term and definition again stays synced"
          (glossary.core/update-entry! (mt/user->id :rasta) (:id entry) {:term "ARR" :definition "Annual recurring revenue"})
          (is (= "synced" (:status (rso entry)))))
        (testing "an update that changes the content flips to update and refreshes the tracked name"
          (glossary.core/update-entry! (mt/user->id :rasta) (:id entry) {:term "NRR" :definition "Net revenue retention"})
          (is (=? {:status "update" :model_name "NRR"} (rso entry))))))))

(deftest delete-event-test
  (collections.tu/with-library-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (testing "deleting a synced entry marks it for deletion and keeps the tracked name"
        (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
          (with-rso! entry "synced")
          (glossary.core/delete-entry! (mt/user->id :rasta) (:id entry))
          (is (=? {:status "delete" :model_name "ARR"} (rso entry)))))
      (testing "deleting a never-pushed entry drops its tracking row"
        (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
          (with-rso! entry "create")
          (glossary.core/delete-entry! (mt/user->id :rasta) (:id entry))
          (is (nil? (rso entry))))))))

;;; ------------------------------------------- Library Tracking Enable/Disable Tests -------------------------------------------

(deftest enable-library-tracking-marks-every-entry-test
  (collections.tu/with-library-not-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
        (rs-events/enable-library-tracking!)
        (is (=? {:status "create" :model_name "ARR"} (rso entry)))))))

(deftest disable-library-tracking-removes-every-entry-test
  (collections.tu/with-library-not-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
        (with-rso! entry "synced")
        (rs-events/disable-library-tracking!)
        (is (nil? (rso entry)))))))

(deftest library-sync-status-change-toggles-glossary-tracking-test
  (mt/with-temporary-setting-values [remote-sync-enabled true]
    (collections.tu/with-library [{library :library}]
      (collections.tu/with-library-not-synced
        (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
          (let [publish! (fn []
                           (events/publish-event! :event/collection-update
                                                  {:object  (t2/select-one :model/Collection :id (:id library))
                                                   :user-id (mt/user->id :rasta)}))]
            (testing "the Library becoming remote-synced tracks existing entries"
              (t2/update! :model/Collection (:id library) {:is_remote_synced true})
              (publish!)
              (is (=? {:status "create"} (rso entry))))
            (testing "the Library ceasing to be remote-synced removes their tracking rows"
              (t2/update! :model/Collection (:id library) {:is_remote_synced false})
              (publish!)
              (is (nil? (rso entry))))))))))

;;; ------------------------------------------- Dirty Check Tests -------------------------------------------

(deftest dirty-check-test
  (mt/with-temporary-setting-values [remote-sync-enabled true]
    (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
      (with-rso! entry "update")
      (testing "a pending glossary change counts as dirty when the Library is synced"
        (collections.tu/with-library-synced
          (is (sync-object/dirty?))))
      (testing "and is ignored when the Library is not synced"
        (collections.tu/with-library-not-synced
          (is (not (sync-object/dirty?))))))))

;;; ------------------------------------------- Deletion Conflict Tests -------------------------------------------

(deftest unsynced-local-term-absent-from-import-is-a-deletion-conflict-test
  (collections.tu/with-library-synced
    (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
      (let [glossary-conflicts (fn [imported-data]
                                 (filter #(= "Glossary" (:model %))
                                         (spec/check-content-deletion-conflicts imported-data)))]
        (testing "a never-synced term the import would delete is reported with its term as the name"
          (is (=? [{:type :glossary-deletion-conflict :count 1 :names ["ARR"]}]
                  (glossary-conflicts {:by-entity-id {}}))))
        (testing "a term present in the import is not reported"
          (is (empty? (glossary-conflicts {:by-entity-id {"Glossary" #{(:entity_id entry)}}}))))
        (testing "an already-synced term is a normal reconcile, not a conflict"
          (with-rso! entry "synced")
          (is (empty? (glossary-conflicts {:by-entity-id {}}))))))))

;;; ------------------------------------------- First-Import Conflict Tests -------------------------------------------

(deftest unsynced-local-glossary-conflicts-with-imported-glossary-test
  (mt/with-temp [:model/Glossary _ {:term "ARR" :definition "Annual recurring revenue"}]
    (testing "check-feature-conflicts reports Library content under the snippets conflict type"
      (let [[conflict :as conflicts] (spec/check-feature-conflicts #{"Glossary"} #{})]
        (is (= 1 (count conflicts)))
        (is (=? {:type :snippets-conflict :category "Snippets"} conflict))
        (is (str/includes? (:message conflict) "Library content (snippets, glossary)"))))
    (testing "import! surfaces the conflict"
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (let [task-id     (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                          :initiated_by   (mt/user->id :rasta)})
              test-files  {"main" {"collections/main/test_coll/test_coll.yaml"
                                   (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                   "glossary/remote_term.yaml"
                                   (test-helpers/generate-glossary-yaml "test-glossary-xxxxxxx" "MRR" "Monthly recurring revenue")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result      (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :conflict (:status result)))
          (is (contains? (:conflicts result) "Snippets"))
          (is (some #(= :snippets-conflict (:type %)) (:conflict-details result))))))))

;;; ------------------------------------------- Export Tests -------------------------------------------

(defn- repo-files [mock] (get @(:files-atom mock) "main"))

(defn- new-task! [sync-task-type]
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type sync-task-type :initiated_by (mt/user->id :rasta)}))

(defn- written-version [task-id]
  (t2/select-one-fn :version :model/RemoteSyncTask :id task-id))

(defn- glossary-file-path
  "The repo path of the file serializing the glossary entry with `entity-id`, or nil."
  [mock entity-id]
  (some (fn [[path content]]
          (when (and (str/starts-with? path "glossary/")
                     (= entity-id (:entity_id (yaml/parse-string content))))
            path))
        (repo-files mock)))

(defn- run-export!
  "Exports to `mock` under a fresh task and returns `[task-id result]`. Earlier tasks are dropped first: the mock
  source reports a constant version, so a completed task left as the sync base would read as remote divergence."
  [mock message]
  (t2/delete! :model/RemoteSyncTask)
  (let [task (new-task! "export")]
    [task (impl/export! (source.p/snapshot mock) task message)]))

(defn- run-import!
  "Imports `snapshot` under a new task, completes the task, and returns the result."
  [snapshot & opts]
  (let [task   (new-task! "import")
        result (apply impl/import! snapshot task opts)]
    (impl/handle-task-result! result task)
    result))

(defn- export-entry!
  "Marks `entry` as new, exports it to a fresh empty source and returns the mock source."
  [entry]
  (with-rso! entry "create")
  (let [mock       (test-helpers/create-mock-source :initial-files {"main" {}})
        [_ result] (run-export! mock "initial")]
    (is (= :success (:status result)) (str "initial export should succeed: " result))
    mock))

(deftest export-writes-glossary-file-and-marks-entry-synced-test
  (collections.tu/with-library-synced
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temp [:model/Glossary {eid :entity_id :as entry} {:term "ARR" :definition "Annual recurring revenue"}]
          (let [mock (export-entry! entry)
                path (glossary-file-path mock eid)]
            (testing "the entry is written under glossary/ at a path derived from the term"
              (is (= "glossary/arr.yaml" path)))
            (testing "the ledger row is synced and records the file path and content hash"
              (is (=? {:status "synced" :file_path path :content_hash string?} (rso entry))))))))))

(deftest export-removes-stale-glossary-files-when-library-not-synced-test
  (collections.tu/with-library-not-synced
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        ;; No dirty rows: the export reaches the incremental path with an empty plan and only the stale deletes.
        (let [stale-path "glossary/arr.yaml"
              mock       (test-helpers/create-mock-source
                          :initial-files {"main" {stale-path (test-helpers/generate-glossary-yaml
                                                              "stale-glossary-xxxxxxx" "ARR" "Annual recurring revenue")}})
              [_ result] (run-export! mock "remove stale glossary")]
          (is (= :success (:status result)))
          (is (nil? (get (repo-files mock) stale-path))
              "a glossary file left behind after the Library was un-synced is deleted on export"))))))

(deftest term-rename-uses-incremental-export-path-test
  (collections.tu/with-library-synced
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-enabled true]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (mt/with-temp [:model/Glossary {eid :entity_id :as entry} {:term "ARR" :definition "Annual recurring revenue"}]
          (let [mock     (export-entry! entry)
                old-path (glossary-file-path mock eid)]
            (glossary.core/update-entry! (mt/user->id :rasta) (:id entry)
                                         {:term "Annual Recurring Revenue" :definition (:definition entry)})
            (is (= "update" (:status (rso entry))))
            (let [[task result] (run-export! mock "rename")
                  new-path      (glossary-file-path mock eid)]
              (is (= :success (:status result)))
              (is (= "apply-changes-version" (written-version task)) "the rename is exported incrementally")
              (is (= "glossary/annual_recurring_revenue.yaml" new-path))
              (is (not (contains? (repo-files mock) old-path)) "the file at the old term's path is deleted")
              (is (=? {:status "synced" :file_path new-path} (rso entry))))))))))

;;; ------------------------------------------- Import Tests -------------------------------------------

(def ^:private library-yaml-path "collections/library/library.yaml")

(defn- library-yaml
  "The Library collection as a read-write instance exports it, so an import keeps the Library synced."
  []
  (test-helpers/generate-collection-yaml collection/library-entity-id "Library" :type "library" :is-remote-synced true))

(defn- do-with-synced-library!
  "Runs `f` with a remote-synced Library collection carrying the canonical Library entity_id, so it matches
  the Library in an imported snapshot."
  [f]
  (t2/delete! :model/Collection :entity_id collection/library-entity-id)
  (mt/with-temp [:model/Collection _ {:name             "Library"
                                      :type             "library"
                                      :entity_id        collection/library-entity-id
                                      :is_remote_synced true
                                      :location         "/"}]
    (f)))

(def ^:private test-collection-path "collections/main/test_coll/test_coll.yaml")

(deftest import-creates-glossary-entries-test
  (mt/with-temporary-setting-values [remote-sync-enabled true]
    (mt/with-model-cleanup [:model/Glossary :model/Collection :model/RemoteSyncTask]
      (do-with-synced-library!
       (fn []
         (let [eid    "test-glossary-xxxxxxx"
               path   "glossary/mrr.yaml"
               files  {"main" {library-yaml-path    (library-yaml)
                               test-collection-path (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                               path                 (test-helpers/generate-glossary-yaml eid "MRR" "Monthly recurring revenue")}}
               mock   (test-helpers/create-mock-source :initial-files files)
               result (run-import! (source.p/snapshot mock) :force? true)]
           (is (= :success (:status result)) (str "import should succeed: " result))
           (let [entry (t2/select-one :model/Glossary :entity_id eid)]
             (is (=? {:term "MRR" :definition "Monthly recurring revenue"} entry))
             (testing "the ledger is rebuilt with a synced row carrying the file path and content hash"
               (is (=? {:status "synced" :model_name "MRR" :file_path path :content_hash string?} (rso entry)))))))))))

(deftest import-removes-synced-terms-absent-from-snapshot-test
  (mt/with-temporary-setting-values [remote-sync-enabled true]
    (mt/with-model-cleanup [:model/Collection :model/RemoteSyncTask]
      (do-with-synced-library!
       (fn []
         (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
           (let [files {"main" {library-yaml-path    (library-yaml)
                                test-collection-path (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")}}
                 mock  (test-helpers/create-mock-source :initial-files files)]
             (testing "a never-pushed local term the import would delete blocks the import"
               (with-rso! entry "create")
               (let [result (run-import! (source.p/snapshot mock) :force? true :force-deletion? false)]
                 (is (= :conflict (:status result)))
                 (is (some #(= :glossary-deletion-conflict (:type %)) (:conflict-details result)))
                 (is (t2/exists? :model/Glossary :id (:id entry)))))
             (testing "an already-synced local term absent from the import is deleted"
               (t2/update! :model/RemoteSyncObject :model_type "Glossary" :model_id (:id entry) {:status "synced"})
               (let [result (run-import! (source.p/snapshot mock) :force? true :force-deletion? false)]
                 (is (= :success (:status result)) (str "import should succeed: " result))
                 (is (not (t2/exists? :model/Glossary :id (:id entry))))
                 (is (nil? (rso entry))))))))))))

(def ^:private base-tree
  "A snapshot with the synced Library and one plain collection, and no glossary files."
  {library-yaml-path    (library-yaml)
   test-collection-path (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")})

(defn- import-v0-then-v1!
  "Force-imports tree `v0`, then imports `v1` as a normal pull. Returns true when the second import took the
  incremental fast path."
  [v0 v1]
  (let [src          (test-helpers/versioned-source :trees {"v0" v0 "v1" v1} :current "v0")
        incremental? (atom false)]
    (is (= :success (:status (run-import! (source.p/snapshot-at src "v0") :force? true))))
    (mt/with-dynamic-fn-redefs [impl/incremental-load-snapshot!
                                (fn [& args]
                                  (reset! incremental? true)
                                  (apply (mt/original-fn #'impl/incremental-load-snapshot!) args))]
      (is (= :success (:status (run-import! (source.p/snapshot-at src "v1"))))))
    @incremental?))

(deftest changed-glossary-file-imports-incrementally-test
  (mt/with-temporary-setting-values [remote-sync-enabled true]
    (mt/with-model-cleanup [:model/Glossary :model/Collection :model/RemoteSyncTask]
      (do-with-synced-library!
       (fn []
         (let [eid  "test-glossary-xxxxxxx"
               path "glossary/mrr.yaml"
               v0   (assoc base-tree path (test-helpers/generate-glossary-yaml eid "MRR" "Monthly recurring revenue"))
               v1   (assoc base-tree path (test-helpers/generate-glossary-yaml eid "MRR" "Monthly recurring revenue, net of churn"))]
           (is (true? (import-v0-then-v1! v0 v1)) "a changed glossary file takes the incremental import fast path")
           (let [entry (t2/select-one :model/Glossary :entity_id eid)]
             (is (= "Monthly recurring revenue, net of churn" (:definition entry)))
             (is (=? {:status "synced" :file_path path} (rso entry))))))))))

(deftest added-glossary-file-imports-incrementally-test
  (mt/with-temporary-setting-values [remote-sync-enabled true]
    (mt/with-model-cleanup [:model/Glossary :model/Collection :model/RemoteSyncTask]
      (do-with-synced-library!
       (fn []
         (let [eid  "test-glossary-xxxxxxx"
               path "glossary/mrr.yaml"
               v1   (assoc base-tree path (test-helpers/generate-glossary-yaml eid "MRR" "Monthly recurring revenue"))]
           (is (true? (import-v0-then-v1! base-tree v1)) "a new glossary file takes the incremental import fast path")
           (let [entry (t2/select-one :model/Glossary :entity_id eid)]
             (is (=? {:term "MRR" :definition "Monthly recurring revenue"} entry))
             (is (=? {:status "synced" :model_name "MRR" :file_path path :content_hash string?} (rso entry))))))))))

(deftest deleted-glossary-file-imports-incrementally-test
  (mt/with-temporary-setting-values [remote-sync-enabled true]
    (mt/with-model-cleanup [:model/Glossary :model/Collection :model/RemoteSyncTask]
      (do-with-synced-library!
       (fn []
         (let [eid  "test-glossary-xxxxxxx"
               path "glossary/mrr.yaml"
               v0   (assoc base-tree path (test-helpers/generate-glossary-yaml eid "MRR" "Monthly recurring revenue"))]
           (is (true? (import-v0-then-v1! v0 base-tree)) "a deleted glossary file takes the incremental import fast path")
           (is (nil? (t2/select-one :model/Glossary :entity_id eid)) "the entry is deleted")
           (is (nil? (t2/select-one :model/RemoteSyncObject :model_type "Glossary" :file_path path)) "its ledger row is removed")))))))
