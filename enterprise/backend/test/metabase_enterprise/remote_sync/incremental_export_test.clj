(ns metabase-enterprise.remote-sync.incremental-export-test
  "Tests for the incremental export fast-path (GHY-3725). The fast-path serializes and writes only
  the changed entities when every dirty change is a safe in-place content update; otherwise it
  falls back to the full export."
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

(defn- mark-dirty! [model-type model-id status]
  (t2/insert! :model/RemoteSyncObject
              {:model_type model-type
               :model_id model-id
               :model_name (str model-type " " model-id)
               :status status
               :status_changed_at (t/offset-date-time)}))

(defn with-exported-collection!
  "Sets up a remote-synced collection with two cards, runs a full export into a fresh empty
  MockSource (populating its files and marking everything synced), then calls `f` with a map of
  `{:mock :coll-id :card-a :card-b}`. Leaves the RemoteSyncObject table clean so `f` fully controls
  the dirty set."
  [f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write
                                     remote-sync-transforms false]
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                   :model/Card {card-a :id} {:name "Card A" :collection_id coll-id}
                   :model/Card {card-b :id} {:name "Card B" :collection_id coll-id}]
      ;; Clear any RSO rows created by with-temp's card-creation events so the initial export
      ;; is a clean full export and `f` fully controls the dirty set.
      (t2/delete! :model/RemoteSyncObject)
      (let [mock        (rs.test/create-mock-source :initial-files {"main" {}})
            init-task   (new-task!)
            init-result (impl/export! (source.p/snapshot mock) init-task "init")]
        (is (= :success (:status init-result)) "initial full export succeeds")
        (is (= "write-files-version" (written-version init-task)) "initial export uses full write-files!")
        (t2/delete! :model/RemoteSyncObject)
        (f {:mock mock :coll-id coll-id :card-a card-a :card-b card-b})))))

(deftest in-place-update-uses-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      (let [files-before (get @(:files-atom mock) "main")
            card-a-eid   (t2/select-one-fn :entity_id :model/Card :id card-a)
            ;; filenames are slug-only; locate card A's file by the entity_id in its content
            card-a-path  (some (fn [[p c]] (when (re-find (re-pattern card-a-eid) c) p)) files-before)]
        (is (some? card-a-path) "card A has a file in the repo after the first export")
        ;; In-place content edit: name (and therefore path) unchanged.
        (t2/update! :model/Card card-a {:description "edited in place"})
        (mark-dirty! "Card" card-a "update")
        (let [task        (new-task!)
              result      (impl/export! (source.p/snapshot mock) task "edit")
              files-after (get @(:files-atom mock) "main")
              other-path  (some (fn [[p _]] (when (not= p card-a-path) p)) files-before)]
          (is (= :success (:status result)))
          (is (= "apply-changes-version" (written-version task))
              "in-place update takes the incremental fast-path")
          (is (= (set (keys files-before)) (set (keys files-after)))
              "no files added or removed")
          (is (re-find #"edited in place" (get files-after card-a-path))
              "changed card's file reflects the edit")
          (is (= (get files-before other-path) (get files-after other-path))
              "untouched files are byte-for-byte preserved")
          (is (not (t2/exists? :model/RemoteSyncObject :status [:not= "synced"]))
              "processed rows are marked synced"))))))

(deftest multiple-in-place-updates-use-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock card-a card-b]}]
      (t2/update! :model/Card card-a {:description "edit A"})
      (t2/update! :model/Card card-b {:description "edit B"})
      (mark-dirty! "Card" card-a "update")
      (mark-dirty! "Card" card-b "update")
      (let [task        (new-task!)
            result      (impl/export! (source.p/snapshot mock) task "edit both")
            files-after (get @(:files-atom mock) "main")]
        (is (= :success (:status result)))
        (is (= "apply-changes-version" (written-version task))
            "a batch of in-place updates still takes the incremental fast-path")
        (is (some (fn [[_ c]] (re-find #"edit A" c)) files-after) "card A edit written")
        (is (some (fn [[_ c]] (re-find #"edit B" c)) files-after) "card B edit written")
        (is (not (t2/exists? :model/RemoteSyncObject :status [:not= "synced"])))))))

(deftest collection-in-place-edit-uses-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock coll-id]}]
      ;; Editing a collection's metadata without renaming it is safe: its directory slug is
      ;; unchanged, so descendant paths don't move.
      (t2/update! :model/Collection coll-id {:description "collection note"})
      (mark-dirty! "Collection" coll-id "update")
      (let [task   (new-task!)
            result (impl/export! (source.p/snapshot mock) task "edit collection")]
        (is (= :success (:status result)))
        (is (= "apply-changes-version" (written-version task))
            "an in-place collection edit (no rename) takes the incremental fast-path")))))

(deftest mixed-batch-falls-back-to-full-export-test
  (with-exported-collection!
    (fn [{:keys [mock coll-id card-a]}]
      (mt/with-temp [:model/Card {card-c :id} {:name "Card C" :collection_id coll-id}]
        ;; One qualifying update batched with one create: the whole export falls back to full.
        (t2/update! :model/Card card-a {:description "edit A"})
        (mark-dirty! "Card" card-a "update")
        (mark-dirty! "Card" card-c "create")
        (let [task   (new-task!)
              result (impl/export! (source.p/snapshot mock) task "mixed")]
          (is (= :success (:status result)))
          (is (= "write-files-version" (written-version task))
              "a single non-qualifying row forces the whole batch to full export"))))))

(deftest path-holding-different-entity-falls-back-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      (let [files  (get @(:files-atom mock) "main")
            a-eid  (t2/select-one-fn :entity_id :model/Card :id card-a)
            a-path (some (fn [[p c]] (when (re-find (re-pattern a-eid) c) p)) files)]
        ;; Simulate the computed path now holding a DIFFERENT entity (e.g. a dedup name collision):
        ;; the YAML parse sees a mismatched entity_id, so we must NOT clobber it — fall back to full.
        (swap! (:files-atom mock) assoc-in ["main" a-path]
               (str/replace (get files a-path) a-eid "different0entity0id0x"))
        (t2/update! :model/Card card-a {:description "edit A"})
        (mark-dirty! "Card" card-a "update")
        (let [task   (new-task!)
              result (impl/export! (source.p/snapshot mock) task "mismatch")]
          (is (= :success (:status result)))
          (is (= "write-files-version" (written-version task))
              "a path holding a different entity fails the safety check and falls back to full"))))))

(deftest create-falls-back-to-full-export-test
  (with-exported-collection!
    (fn [{:keys [mock coll-id]}]
      (mt/with-temp [:model/Card {card-c :id} {:name "Card C" :collection_id coll-id}]
        (mark-dirty! "Card" card-c "create")
        (let [task   (new-task!)
              result (impl/export! (source.p/snapshot mock) task "add card C")]
          (is (= :success (:status result)))
          (is (= "write-files-version" (written-version task))
              "a create falls back to the full export"))))))

(deftest rename-falls-back-to-full-export-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      ;; Rename shifts the serialized path; the new path is absent from the repo, so the safety
      ;; check fails and we fall back to the full export (which reconciles stale files).
      (t2/update! :model/Card card-a {:name "Card A Renamed"})
      (mark-dirty! "Card" card-a "update")
      (let [task   (new-task!)
            result (impl/export! (source.p/snapshot mock) task "rename")]
        (is (= :success (:status result)))
        (is (= "write-files-version" (written-version task))
            "a rename falls back to the full export")))))

(deftest delete-falls-back-to-full-export-test
  (with-exported-collection!
    (fn [{:keys [mock card-b]}]
      (mark-dirty! "Card" card-b "delete")
      (let [task   (new-task!)
            result (impl/export! (source.p/snapshot mock) task "delete")]
        (is (= :success (:status result)))
        (is (= "write-files-version" (written-version task))
            "a delete falls back to the full export")))))
