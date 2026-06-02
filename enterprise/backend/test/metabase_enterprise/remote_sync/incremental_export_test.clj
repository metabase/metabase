(ns metabase-enterprise.remote-sync.incremental-export-test
  "Tests for the incremental export fast-path (GHY-3725). The fast-path writes only the changed
  entities (and deletes only the removed ones) when every pending change can be applied
  incrementally — in-place updates, renames, and deletes of entity-id models whose old path is
  known via the RemoteSyncObject file_path column. Anything else falls back to the full export."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- new-task! []
  (t2/delete! :model/RemoteSyncTask)
  (t2/insert-returning-pk! :model/RemoteSyncTask
                           {:sync_task_type "export" :initiated_by (mt/user->id :rasta)}))

(defn- written-version [task-id]
  (t2/select-one-fn :version :model/RemoteSyncTask :id task-id))

(defn- seed-synced-row! [model-type model-id]
  (t2/insert! :model/RemoteSyncObject
              {:model_type model-type
               :model_id model-id
               :model_name (str model-type " " model-id)
               :status "synced"
               :status_changed_at (t/offset-date-time)}))

(defn- set-status! [model-type model-id status]
  (t2/update! :model/RemoteSyncObject :model_type model-type :model_id model-id
              {:status status :status_changed_at (t/offset-date-time)}))

(defn- rso [model-type model-id]
  (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id))

(defn- files [mock] (get @(:files-atom mock) "main"))

(defn- path-for-eid
  "The repo path of the file whose content contains `eid` (filenames are slug-only)."
  [mock eid]
  (some (fn [[p c]] (when (re-find (re-pattern eid) c) p)) (files mock)))

(defn- with-exported-collection!
  "Sets up a remote-synced collection with two cards plus synced RemoteSyncObject rows, runs a full
  export into a fresh empty MockSource (which writes the files and records each entity's file_path),
  then calls `f` with `{:mock :coll-id :card-a :card-b}`."
  [f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write
                                     remote-sync-transforms false]
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                   :model/Card {card-a :id} {:name "Card A" :collection_id coll-id}
                   :model/Card {card-b :id} {:name "Card B" :collection_id coll-id}]
      ;; Reset RSO and seed synced rows for the three entities so the full export can record their
      ;; file_path (in production these rows come from events / import).
      (t2/delete! :model/RemoteSyncObject)
      (seed-synced-row! "Collection" coll-id)
      (seed-synced-row! "Card" card-a)
      (seed-synced-row! "Card" card-b)
      (let [mock        (rs.test/create-mock-source :initial-files {"main" {}})
            init-task   (new-task!)
            init-result (impl/export! (source.p/snapshot mock) init-task "init")]
        (is (= :success (:status init-result)) "initial full export succeeds")
        (is (= "write-files-version" (written-version init-task)) "initial export uses full write-files!")
        (f {:mock mock :coll-id coll-id :card-a card-a :card-b card-b})))))

(deftest full-export-records-file-path-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      (let [a-eid (t2/select-one-fn :entity_id :model/Card :id card-a)]
        (is (= (path-for-eid mock a-eid) (:file_path (rso "Card" card-a)))
            "full export records each entity's file_path on its RemoteSyncObject row")))))

(deftest in-place-update-uses-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      (let [a-eid        (t2/select-one-fn :entity_id :model/Card :id card-a)
            a-path       (path-for-eid mock a-eid)
            files-before (files mock)]
        (t2/update! :model/Card card-a {:description "edited in place"})
        (set-status! "Card" card-a "update")
        (let [task        (new-task!)
              result      (impl/export! (source.p/snapshot mock) task "edit")
              files-after (files mock)
              other-path  (some (fn [[p _]] (when (not= p a-path) p)) files-before)]
          (is (= :success (:status result)))
          (is (= "apply-changes-version" (written-version task)) "in-place update is incremental")
          (is (= (set (keys files-before)) (set (keys files-after))) "no files added or removed")
          (is (re-find #"edited in place" (get files-after a-path)) "edit written")
          (is (= (get files-before other-path) (get files-after other-path)) "other files preserved")
          (is (= a-path (:file_path (rso "Card" card-a))) "file_path unchanged")
          (is (not (t2/exists? :model/RemoteSyncObject :status [:not= "synced"]))))))))

(deftest multiple-in-place-updates-use-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock card-a card-b]}]
      (t2/update! :model/Card card-a {:description "edit A"})
      (t2/update! :model/Card card-b {:description "edit B"})
      (set-status! "Card" card-a "update")
      (set-status! "Card" card-b "update")
      (let [task        (new-task!)
            result      (impl/export! (source.p/snapshot mock) task "edit both")
            files-after (files mock)]
        (is (= :success (:status result)))
        (is (= "apply-changes-version" (written-version task)))
        (is (some (fn [[_ c]] (re-find #"edit A" c)) files-after))
        (is (some (fn [[_ c]] (re-find #"edit B" c)) files-after))))))

(deftest collection-in-place-edit-uses-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock coll-id]}]
      (t2/update! :model/Collection coll-id {:description "collection note"})
      (set-status! "Collection" coll-id "update")
      (let [task   (new-task!)
            result (impl/export! (source.p/snapshot mock) task "edit collection")]
        (is (= :success (:status result)))
        (is (= "apply-changes-version" (written-version task))
            "an in-place collection edit (no rename) is incremental")))))

(deftest rename-uses-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      (let [a-eid    (t2/select-one-fn :entity_id :model/Card :id card-a)
            old-path (path-for-eid mock a-eid)]
        (t2/update! :model/Card card-a {:name "Card A Renamed"})
        (set-status! "Card" card-a "update")
        (let [task        (new-task!)
              result      (impl/export! (source.p/snapshot mock) task "rename")
              files-after (files mock)
              new-path    (path-for-eid mock a-eid)]
          (is (= :success (:status result)))
          (is (= "apply-changes-version" (written-version task)) "rename is incremental")
          (is (not (contains? files-after old-path)) "old file removed")
          (is (not= old-path new-path) "file moved to a new path")
          (is (re-find #"Card A Renamed" (get files-after new-path)) "new file has the new name")
          (is (= 1 (count (filter (fn [[_ c]] (re-find (re-pattern a-eid) c)) files-after)))
              "exactly one file for the entity (no stale duplicate)")
          (is (= new-path (:file_path (rso "Card" card-a))) "file_path updated to the new path"))))))

(deftest delete-uses-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock card-a card-b]}]
      (let [a-eid  (t2/select-one-fn :entity_id :model/Card :id card-a)
            b-eid  (t2/select-one-fn :entity_id :model/Card :id card-b)
            b-path (path-for-eid mock b-eid)]
        (set-status! "Card" card-b "delete")
        (let [task        (new-task!)
              result      (impl/export! (source.p/snapshot mock) task "delete B")
              files-after (files mock)]
          (is (= :success (:status result)))
          (is (= "apply-changes-version" (written-version task)) "delete is incremental")
          (is (not (contains? files-after b-path)) "deleted entity's file removed")
          (is (some (fn [[_ c]] (re-find (re-pattern a-eid) c)) files-after) "card A preserved")
          (is (nil? (rso "Card" card-b)) "deleted entity's RemoteSyncObject row removed"))))))

(deftest rename-without-stored-path-falls-back-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      ;; Simulate the post-import state where file_path hasn't been recorded yet: a rename then can't
      ;; resolve the old path, so we fall back to the full export (which reconciles stale files).
      (t2/update! :model/RemoteSyncObject :model_type "Card" :model_id card-a {:file_path nil})
      (t2/update! :model/Card card-a {:name "Card A Renamed"})
      (set-status! "Card" card-a "update")
      (let [task   (new-task!)
            result (impl/export! (source.p/snapshot mock) task "rename")]
        (is (= :success (:status result)))
        (is (= "write-files-version" (written-version task))
            "rename without a stored file_path falls back to full")))))

(deftest delete-without-stored-path-falls-back-test
  (with-exported-collection!
    (fn [{:keys [mock card-b]}]
      (t2/update! :model/RemoteSyncObject :model_type "Card" :model_id card-b {:file_path nil})
      (set-status! "Card" card-b "delete")
      (let [task   (new-task!)
            result (impl/export! (source.p/snapshot mock) task "delete")]
        (is (= :success (:status result)))
        (is (= "write-files-version" (written-version task))
            "delete without a stored file_path falls back to full")))))

(deftest create-falls-back-to-full-export-test
  (with-exported-collection!
    (fn [{:keys [mock coll-id]}]
      (mt/with-temp [:model/Card {card-c :id} {:name "Card C" :collection_id coll-id}]
        (seed-synced-row! "Card" card-c)
        (set-status! "Card" card-c "create")
        (let [task   (new-task!)
              result (impl/export! (source.p/snapshot mock) task "add card C")]
          (is (= :success (:status result)))
          (is (= "write-files-version" (written-version task))
              "a create falls back to the full export"))))))

(deftest mixed-batch-falls-back-to-full-export-test
  (with-exported-collection!
    (fn [{:keys [mock coll-id card-a]}]
      (mt/with-temp [:model/Card {card-c :id} {:name "Card C" :collection_id coll-id}]
        (t2/update! :model/Card card-a {:description "edit A"})
        (set-status! "Card" card-a "update")
        (seed-synced-row! "Card" card-c)
        (set-status! "Card" card-c "create")
        (let [task   (new-task!)
              result (impl/export! (source.p/snapshot mock) task "mixed")]
          (is (= :success (:status result)))
          (is (= "write-files-version" (written-version task))
              "a single non-qualifying row forces the whole batch to full export"))))))

(deftest name-collision-backfill-falls-back-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      (let [a-eid  (t2/select-one-fn :entity_id :model/Card :id card-a)
            a-path (path-for-eid mock a-eid)]
        ;; No stored file_path (post-import), and the repo file at the computed path holds a DIFFERENT
        ;; entity (a dedup name collision). The safety check must reject the clobber → full export.
        (t2/update! :model/RemoteSyncObject :model_type "Card" :model_id card-a {:file_path nil})
        (swap! (:files-atom mock) assoc-in ["main" a-path]
               (str/replace (get (files mock) a-path) a-eid "different0entity0id0x"))
        (t2/update! :model/Card card-a {:description "edit A"})
        (set-status! "Card" card-a "update")
        (let [task   (new-task!)
              result (impl/export! (source.p/snapshot mock) task "collision")]
          (is (= :success (:status result)))
          (is (= "write-files-version" (written-version task))
              "a path holding a different entity fails the safety check and falls back to full"))))))
