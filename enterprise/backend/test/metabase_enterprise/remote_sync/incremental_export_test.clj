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
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- venues-query []
  {:database (mt/id) :type :query :query {:source-table (mt/id :venues)}})

(defn- card-source-query [card-id]
  {:database (mt/id) :type :query :query {:source-table (str "card__" card-id)}})

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

(defn- seed-create-row!
  "Seeds a `create`-status RemoteSyncObject row, so the next export writes the entity (and records its
  file_path). Use when a test needs to get an entity into the repo."
  [model-type model-id]
  (seed-synced-row! model-type model-id)
  (set-status! model-type model-id "create"))

(defn- rso [model-type model-id]
  (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id))

(defn- files [mock] (get @(:files-atom mock) "main"))

(defn- path-for-eid
  "The repo path of the file whose content contains `eid` (filenames are slug-only)."
  [mock eid]
  (some (fn [[p c]] (when (re-find (re-pattern eid) c) p)) (files mock)))

(defn- entity-exported?
  "True if some repo file is the serialized entity with top-level `eid` (i.e. the entity has its own
  file). Distinct from `path-for-eid`, which also matches a mere reference to `eid` inside another
  entity's file."
  [mock eid]
  (boolean (some (fn [[_ c]]
                   (try (= eid (:entity_id (yaml/parse-string c)))
                        (catch Exception _ false)))
                 (files mock))))

(defn- with-exported-collection!
  "Sets up a remote-synced collection with two cards, marks the three entities as new (`create`), and
  runs an initial export into a fresh empty MockSource — writing the files and recording each entity's
  file_path. Then calls `f` with `{:mock :coll-id :card-a :card-b}`."
  [f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write
                                     remote-sync-transforms false]
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                   :model/Card {card-a :id} {:name "Card A" :collection_id coll-id}
                   :model/Card {card-b :id} {:name "Card B" :collection_id coll-id}]
      ;; Reset RSO and seed `create` rows for the three entities (in production these come from events /
      ;; enabling sync) so the initial export writes them and records their file_path.
      (t2/delete! :model/RemoteSyncObject)
      (doseq [[model-type model-id] [["Collection" coll-id] ["Card" card-a] ["Card" card-b]]]
        (seed-create-row! model-type model-id))
      (let [mock        (rs.test/create-mock-source :initial-files {"main" {}})
            init-task   (new-task!)
            init-result (impl/export! (source.p/snapshot mock) init-task "init")]
        (is (= :success (:status init-result)) "initial export succeeds")
        (is (= "apply-changes-version" (written-version init-task))
            "the three new entities are written incrementally")
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
        ;; A real delete means the entity is archived, so it can't be re-serialized — the incremental
        ;; delete must work from the stored file_path alone, without re-extracting the entity.
        (t2/update! :model/Card card-b {:archived true})
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

(deftest create-uses-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock coll-id]}]
      (mt/with-temp [:model/Card {card-c :id} {:name "Card C" :collection_id coll-id}]
        (seed-synced-row! "Card" card-c)
        (set-status! "Card" card-c "create")
        (let [files-before (files mock)
              c-eid        (t2/select-one-fn :entity_id :model/Card :id card-c)
              task         (new-task!)]
          (impl/export! (source.p/snapshot mock) task "add card C")
          (is (= "apply-changes-version" (written-version task)) "a create is incremental")
          (is (entity-exported? mock c-eid) "the new card's file is written")
          (is (some? (:file_path (rso "Card" card-c))) "file_path recorded for the new card")
          (is (every? (fn [[p c]] (= c (get (files mock) p))) files-before)
              "existing files are preserved unchanged")
          (is (not (t2/exists? :model/RemoteSyncObject :status [:not= "synced"]))))))))

(deftest create-with-name-collision-falls-back-test
  (with-exported-collection!
    (fn [{:keys [mock coll-id]}]
      ;; A new card whose name collides with an existing card resolves (in isolation) to the existing
      ;; card's path. The safety check sees a different occupant and falls back to full, which dedups.
      (mt/with-temp [:model/Card {card-c :id} {:name "Card A" :collection_id coll-id}]
        (seed-synced-row! "Card" card-c)
        (set-status! "Card" card-c "create")
        (let [task   (new-task!)
              result (impl/export! (source.p/snapshot mock) task "collision create")]
          (is (= :success (:status result)))
          (is (= "write-files-version" (written-version task))
              "a create whose path collides with a different entity falls back to full")
          (is (entity-exported? mock (t2/select-one-fn :entity_id :model/Card :id card-c))
              "the colliding new card is still exported (at a deduped path) by the full export"))))))

(deftest mixed-batch-with-unhandled-row-falls-back-test
  (with-exported-collection!
    (fn [{:keys [mock card-a card-b]}]
      ;; One incremental-able update batched with a delete that has no stored path (so it can't be
      ;; handled incrementally) -> the whole batch falls back to a full export.
      (t2/update! :model/Card card-a {:description "edit A"})
      (set-status! "Card" card-a "update")
      (t2/update! :model/RemoteSyncObject :model_type "Card" :model_id card-b {:file_path nil})
      (set-status! "Card" card-b "delete")
      (let [task   (new-task!)
            result (impl/export! (source.p/snapshot mock) task "mixed")]
        (is (= :success (:status result)))
        (is (= "write-files-version" (written-version task))
            "a single non-incremental row forces the whole batch to full export")))))

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

(deftest unparseable-occupant-falls-back-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      (let [a-eid  (t2/select-one-fn :entity_id :model/Card :id card-a)
            a-path (path-for-eid mock a-eid)]
        ;; No stored file_path (post-import), and the repo file at the computed path is present but has
        ;; no readable entity_id. We can't tell whose file it is, so the safety check must treat it as
        ;; occupied — not free — and fall back to full rather than clobber an unidentifiable entity.
        (t2/update! :model/RemoteSyncObject :model_type "Card" :model_id card-a {:file_path nil})
        (swap! (:files-atom mock) assoc-in ["main" a-path] "name: Not A Serialized Entity\nother: value\n")
        (t2/update! :model/Card card-a {:description "edit A"})
        (set-status! "Card" card-a "update")
        (let [task   (new-task!)
              result (impl/export! (source.p/snapshot mock) task "unparseable occupant")]
          (is (= :success (:status result)))
          (is (= "write-files-version" (written-version task))
              "a present file with no entity_id fails the safety check and falls back to full"))))))

(deftest malformed-yaml-occupant-falls-back-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      (let [a-eid  (t2/select-one-fn :entity_id :model/Card :id card-a)
            a-path (path-for-eid mock a-eid)]
        ;; No stored file_path, and the repo file at the computed path is malformed YAML that can't be
        ;; parsed. Reading it throws — the row must be treated as unsyncable and fall back to a full
        ;; export rather than crashing the whole export.
        (t2/update! :model/RemoteSyncObject :model_type "Card" :model_id card-a {:file_path nil})
        (swap! (:files-atom mock) assoc-in ["main" a-path] "a: b: c")
        (t2/update! :model/Card card-a {:description "edit A"})
        (set-status! "Card" card-a "update")
        (let [task   (new-task!)
              result (impl/export! (source.p/snapshot mock) task "malformed occupant")]
          (is (= :success (:status result)))
          (is (= "write-files-version" (written-version task))
              "a malformed YAML file at the target path falls back to full export instead of crashing"))))))

(deftest create-onto-same-entity-stays-incremental-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      ;; card-a is already exported: its file sits at its computed path holding its own entity_id. A
      ;; fresh "create" whose target path already holds THIS same entity is a safe overwrite, so it must
      ;; stay incremental rather than fall back (the path is occupied, but by us).
      (let [a-eid (t2/select-one-fn :entity_id :model/Card :id card-a)]
        (set-status! "Card" card-a "create")
        (let [task (new-task!)]
          (impl/export! (source.p/snapshot mock) task "re-create A")
          (is (= "apply-changes-version" (written-version task))
              "a create whose path already holds the same entity stays incremental")
          (is (entity-exported? mock a-eid) "card A is still exported"))))))

;;; ------------------------------------ Disabled content cleanup (GHY-3725) ------------------------------------
;;; When a content type is disabled (transforms is off in `with-exported-collection!`), stale files left
;;; behind in its repo dir must be removed — but that shouldn't drop us off the incremental fast-path.
;;; They're appended to the incremental delete-paths instead of forcing a full re-serialize.

(deftest disabled-content-cleaned-up-incrementally-test
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      ;; A stale file in a now-disabled content dir, alongside an ordinary card edit. The edit stays on
      ;; the incremental path AND the stale transforms file is deleted in the same commit.
      (swap! (:files-atom mock) assoc-in ["main" "transforms/old/old.yaml"] "stale transform")
      (t2/update! :model/Card card-a {:description "edit A"})
      (set-status! "Card" card-a "update")
      (let [a-eid (t2/select-one-fn :entity_id :model/Card :id card-a)
            task  (new-task!)]
        (impl/export! (source.p/snapshot mock) task "edit with stale transform")
        (is (= "apply-changes-version" (written-version task))
            "disabled content no longer forces a full export")
        (is (nil? (get (files mock) "transforms/old/old.yaml"))
            "the stale file in the disabled dir is deleted incrementally")
        (is (entity-exported? mock a-eid) "the edited card is still exported")))))

(deftest disabled-content-cleaned-up-with-no-dirty-rows-test
  (with-exported-collection!
    (fn [{:keys [mock]}]
      ;; A stale file in a disabled dir with nothing else dirty: a delete-only incremental commit removes
      ;; it (rather than a no-op that would leave it behind, or a full re-serialize).
      (swap! (:files-atom mock) assoc-in ["main" "transforms/old/old.yaml"] "stale transform")
      (let [task   (new-task!)
            result (impl/export! (source.p/snapshot mock) task "remove stale transform")]
        (is (= :success (:status result)))
        (is (= "apply-changes-version" (written-version task))
            "a delete-only incremental commit removes the stale file")
        (is (nil? (get (files mock) "transforms/old/old.yaml")))))))

;;; ---------------------------------- Required-closure regression (GHY-3725) ------------------------------------
;;; A full export pulls a card's source cards via `serdes/descendants` (transitively, through
;;; `resolve-targets`), even when the source card lives outside the synced collection. The incremental
;;; fast-path writes only the changed entities, so a change that introduces such a cross-scope reference
;;; must still export the referenced dependency — otherwise the reference dangles on import.

(defn- with-cross-scope-setup!
  "Synced collection C plus a card Y in a NON-synced collection. Runs an initial full export into a
  fresh MockSource. Calls `f` with `{:mock :c-id :ext-id :y-id :y-eid}`. Y is not referenced yet, so
  it isn't in the repo after the initial export."
  [f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write
                                     remote-sync-transforms false]
    (mt/with-temp [:model/Collection {c-id :id}   {:name "Synced" :is_remote_synced true :location "/"}
                   :model/Collection {ext-id :id} {:name "External" :is_remote_synced false :location "/"}
                   :model/Card {y-id :id} {:name "Outside Card" :collection_id ext-id
                                           :database_id (mt/id) :dataset_query (venues-query)}]
      (t2/delete! :model/RemoteSyncObject)
      (seed-create-row! "Collection" c-id)
      (let [mock  (rs.test/create-mock-source :initial-files {"main" {}})
            y-eid (t2/select-one-fn :entity_id :model/Card :id y-id)]
        (impl/export! (source.p/snapshot mock) (new-task!) "init")
        (is (not (entity-exported? mock y-eid)) "Y is not in the repo until something references it")
        (f {:mock mock :c-id c-id :ext-id ext-id :y-id y-id :y-eid y-eid})))))

(deftest update-adding-external-reference-exports-dependency-test
  (testing "an in-place update that newly references a card outside the synced collection pulls that dependency incrementally"
    (with-cross-scope-setup!
      (fn [{:keys [mock c-id y-id y-eid]}]
        (mt/with-temp [:model/Card {x-id :id} {:name "Synced Card" :collection_id c-id
                                               :database_id (mt/id) :dataset_query (venues-query)}]
          (seed-create-row! "Card" x-id)
          (impl/export! (source.p/snapshot mock) (new-task!) "add x") ; X now in repo, Y still not
          ;; Edit X to reference the external card Y, then export the single in-place change.
          (t2/update! :model/Card x-id {:dataset_query (card-source-query y-id)})
          (set-status! "Card" x-id "update")
          (let [task (new-task!)]
            (impl/export! (source.p/snapshot mock) task "reference Y")
            (is (= "apply-changes-version" (written-version task))
                "the change stays incremental — the dependency is pulled, not a full export")
            (is (entity-exported? mock y-eid)
                "the newly-referenced external dependency is exported alongside the change")))))))

(deftest create-with-external-reference-exports-dependency-test
  (testing "a new card that references a card outside the synced collection pulls that dependency incrementally"
    (with-cross-scope-setup!
      (fn [{:keys [mock c-id y-id y-eid]}]
        (mt/with-temp [:model/Card {x-id :id} {:name "New Synced Card" :collection_id c-id
                                               :database_id (mt/id)
                                               :dataset_query (card-source-query y-id)}]
          (seed-synced-row! "Card" x-id)
          (set-status! "Card" x-id "create")
          (let [task (new-task!)]
            (impl/export! (source.p/snapshot mock) task "create x")
            (is (= "apply-changes-version" (written-version task))
                "the create stays incremental — the dependency is pulled, not a full export")
            (is (entity-exported? mock y-eid)
                "the external dependency referenced by the new card is exported alongside it")))))))

(deftest update-referencing-synced-card-stays-incremental-test
  (testing "an in-place edit of a card that references a card in another SYNCED collection stays incremental"
    (mt/with-temporary-setting-values [remote-sync-type :read-write
                                       remote-sync-transforms false]
      (mt/with-temp [:model/Collection {c-id :id} {:name "C" :is_remote_synced true :location "/"}
                     :model/Collection {d-id :id} {:name "D" :is_remote_synced true :location "/"}
                     :model/Card {y-id :id} {:name "Synced Dep" :collection_id d-id
                                             :database_id (mt/id) :dataset_query (venues-query)}
                     :model/Card {x-id :id} {:name "Referencing Card" :collection_id c-id
                                             :database_id (mt/id)
                                             :dataset_query (card-source-query y-id)}]
        (t2/delete! :model/RemoteSyncObject)
        (doseq [[model-type model-id] [["Collection" c-id] ["Collection" d-id] ["Card" x-id] ["Card" y-id]]]
          (seed-create-row! model-type model-id))
        (let [mock  (rs.test/create-mock-source :initial-files {"main" {}})
              y-eid (t2/select-one-fn :entity_id :model/Card :id y-id)]
          (impl/export! (source.p/snapshot mock) (new-task!) "init")
          (is (entity-exported? mock y-eid) "the referenced synced card is in the repo")
          (t2/update! :model/Card x-id {:description "edit"})
          (set-status! "Card" x-id "update")
          (let [task (new-task!)]
            (impl/export! (source.p/snapshot mock) task "edit")
            (is (= "apply-changes-version" (written-version task))
                "the dependency is already tracked, so the guard allows the incremental path")))))))

;;; ---------------------------------------- Import round-trip (GHY-3725) ----------------------------------------
;;; The tests above assert the right files land in the repo. These assert the resulting repo actually imports
;;; back to the intended state — the real point of keeping the repo consistent. `:force? true` bypasses the
;;; first-import conflict check (the entities already exist locally with these entity_ids).

(deftest incremental-edit-round-trips-through-import-test
  (testing "a repo produced by an incremental in-place edit imports back to the edited content"
    (with-exported-collection!
      (fn [{:keys [mock card-a]}]
        (t2/update! :model/Card card-a {:description "edited via incremental"})
        (set-status! "Card" card-a "update")
        (impl/export! (source.p/snapshot mock) (new-task!) "edit")
        ;; diverge the DB from the repo, then import the repo back over it
        (t2/update! :model/Card card-a {:description "local divergence"})
        (is (= :success (:status (impl/import! (source.p/snapshot mock) (new-task!) :force? true)))
            "import succeeds")
        (is (= "edited via incremental" (t2/select-one-fn :description :model/Card :id card-a))
            "import restored the description the incremental export wrote")))))

(deftest incremental-rename-round-trips-through-import-test
  (testing "a repo produced by an incremental rename imports to the renamed entity, with no stale duplicate"
    (with-exported-collection!
      (fn [{:keys [mock card-a]}]
        (let [a-eid (t2/select-one-fn :entity_id :model/Card :id card-a)]
          (t2/update! :model/Card card-a {:name "Renamed A"})
          (set-status! "Card" card-a "update")
          (impl/export! (source.p/snapshot mock) (new-task!) "rename")
          ;; rename back locally, then import the repo
          (t2/update! :model/Card card-a {:name "Card A"})
          (is (= :success (:status (impl/import! (source.p/snapshot mock) (new-task!) :force? true)))
              "import succeeds")
          (is (= "Renamed A" (t2/select-one-fn :name :model/Card :id card-a))
              "import applied the renamed name from the repo")
          (is (= 1 (t2/count :model/Card :entity_id a-eid))
              "exactly one card for the entity — no duplicate from a stale file"))))))

(deftest two-same-named-creates-use-incremental-path-test
  (with-exported-collection!
    (fn [{:keys [mock coll-id]}]
      ;; Two NEW cards with the same name in one batch. The shared storage context dedups them to
      ;; distinct paths (foo + foo_2), so neither collides and both are written incrementally — matching
      ;; a full export. (No prior foo.yaml exists, so path-free-for? can't catch a collision; the shared
      ;; generator is what keeps them apart.)
      (mt/with-temp [:model/Card {c1 :id} {:name "Foo" :collection_id coll-id}
                     :model/Card {c2 :id} {:name "Foo" :collection_id coll-id}]
        (seed-synced-row! "Card" c1)
        (seed-synced-row! "Card" c2)
        (set-status! "Card" c1 "create")
        (set-status! "Card" c2 "create")
        (let [e1   (t2/select-one-fn :entity_id :model/Card :id c1)
              e2   (t2/select-one-fn :entity_id :model/Card :id c2)
              task (new-task!)]
          (impl/export! (source.p/snapshot mock) task "two foos")
          (is (= "apply-changes-version" (written-version task))
              "two same-named creates stay on the incremental path")
          (is (entity-exported? mock e1) "first Foo exported")
          (is (entity-exported? mock e2) "second Foo exported")
          (is (not= (path-for-eid mock e1) (path-for-eid mock e2))
              "the two Foos get distinct, deduped paths"))))))

(deftest force-export-overwrites-upstream-changes-test
  ;; A force export must be a true overwrite: it has to drop files the remote diverged with, which the
  ;; incremental fast-path (preserving every file it didn't touch) cannot do. This pins force? = full
  ;; re-serialize and guards the GHY-3726 reconciliation against regressing to an incremental force.
  (with-exported-collection!
    (fn [{:keys [mock card-a]}]
      (let [ghost-path "collections/bench/cards/ghost_upstream.yaml"
            a-eid      (t2/select-one-fn :entity_id :model/Card :id card-a)]
        ;; Simulate the remote diverging: a new, non-colliding upstream file the local instance never imported.
        (swap! (:files-atom mock) assoc-in ["main" ghost-path]
               "name: Ghost\nentity_id: ghostUpstream00000001\nserdes/meta:\n- id: ghostUpstream00000001\n  model: Card\n")
        (t2/update! :model/Card card-a {:description "local edit"})
        (set-status! "Card" card-a "update")
        (testing "an ordinary (incremental) export preserves the upstream file — so it is NOT an overwrite"
          (let [task (new-task!)]
            (is (= :success (:status (impl/export! (source.p/snapshot mock) task "edit"))))
            (is (= "apply-changes-version" (written-version task)) "took the incremental fast-path")
            (is (contains? (files mock) ghost-path)
                "the incremental path leaves the upstream file in place")))
        (testing "a force export re-serializes the whole set and drops the upstream file (true overwrite)"
          (let [task (new-task!)]
            (is (= :success (:status (impl/export! (source.p/snapshot mock) task "force" :force? true))))
            (is (= "write-files-version" (written-version task)) "took the full-export path")
            (is (not (contains? (files mock) ghost-path))
                "force overwrite removes the upstream file the remote diverged with")
            (is (re-find #"local edit"
                         (get (files mock) (path-for-eid mock a-eid)))
                "the local edit survives the overwrite")))))))
