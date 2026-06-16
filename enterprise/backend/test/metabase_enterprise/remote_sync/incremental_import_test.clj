(ns metabase-enterprise.remote-sync.incremental-import-test
  "Differential equivalence harness for incremental import/pull (GHY-3779).

  The full reload (`load-snapshot!`) is the specification: a correct incremental import must leave the app
  DB, the RemoteSyncObject table, the remote-sync-transforms setting, and the version pointer in exactly
  the state a full import would. So rather than assert against hand-computed expectations, we run BOTH
  paths against the same change and assert their resulting state is identical.

  `import!` already gives us the seam: `:force? true` always takes the full path (the oracle), while
  `:force? false` is the path under test (full today; incremental once GHY-3779 lands). The harness:

    import(v0, force)         ; establish local == v0
    import(v1, force)         ; ORACLE: capture full-import state of v1
    import(v0, force)         ; reset local back to v0
    import(v1, NO force)      ; UNDER TEST: capture state of v1
    assert the two states are equal

  Until incremental lands, `force? false` == `force? true`, so these tests validate the harness and the
  oracle itself (full import is a deterministic function of the snapshot, and the state comparison is
  pk-independent and stable). When incremental lands behind `force? false`, the same tests become the
  equivalence proof."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state)

;;; ------------------------------------------------- State capture --------------------------------------------------

(defn- synced-tree
  "The current remote-synced set serialized to a {path content} map — what a fresh export would write.
  After a correct import this equals the imported snapshot's content (round-trip), so it's a faithful,
  pk-independent fingerprint of the loaded app-DB entities."
  []
  (into {} (map (juxt :path :content)) (source/serialize-specs (spec/extract-entities-for-export) nil)))

(defn- rso-state
  "The RemoteSyncObject table as a pk-independent set of [model_type file_path status]. Keyed on file_path
  (derived from names, stable across delete+recreate) rather than the autoincrement model_id, so the same
  logical entity compares equal even if its primary key changed between runs."
  []
  (into #{}
        (map (juxt :model_type :file_path :status))
        (t2/select :model/RemoteSyncObject)))

(defn- state-vector
  "Everything an import is responsible for reconciling. Two imports of the same snapshot must produce equal
  state vectors."
  []
  {:files      (synced-tree)
   :rso        (rso-state)
   :transforms (settings/remote-sync-transforms)
   :version    (remote-sync.task/last-version)})

(defn- assert-equivalent [oracle under-test]
  (is (= (:files oracle) (:files under-test))
      "synced app-DB entities serialize identically")
  (is (= (:rso oracle) (:rso under-test))
      "RemoteSyncObject table matches")
  (is (= (:transforms oracle) (:transforms under-test))
      "remote-sync-transforms setting matches")
  (is (= (:version oracle) (:version under-test))
      "version pointer matches"))

;;; --------------------------------------------------- Harness ------------------------------------------------------

(defn- import-at!
  "Runs `import!` against the source's snapshot at `version`, then completes the task (so `last-version`
  picks up its version for the next import). Returns the import result."
  [src version & {:keys [force?] :or {force? false}}]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask
                                        {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
        result (impl/import! (source.p/snapshot-at src version) task :force? force?)]
    (impl/handle-task-result! result task)
    result))

(defn- run-differential!
  "Imports `f0` as the baseline, then runs the full (oracle) and under-test imports of `f1` and asserts the
  resulting state is identical. `f0`/`f1` are {path content} trees."
  [f0 f1]
  (let [src (rs.test/versioned-source :trees {"v0" f0 "v1" f1} :current "v0")]
    (is (= :success (:status (import-at! src "v0" :force? true))) "baseline import of v0 succeeds")
    (is (= :success (:status (import-at! src "v1" :force? true))) "oracle full import of v1 succeeds")
    (let [oracle (state-vector)]
      (is (= :success (:status (import-at! src "v0" :force? true))) "reset back to v0 succeeds")
      (is (= :success (:status (import-at! src "v1" :force? false))) "under-test import of v1 succeeds")
      (assert-equivalent oracle (state-vector)))))

(defn- do-with-bench!
  "Sets up a remote-synced `Bench` collection with cards A and B, then calls `f` with the V0 tree
  ({path content}; the two cards' paths carry `card_a` / `card_b` slugs). Cleans up any entities
  recreated during the differential churn (delete+recreate gives fresh primary keys)."
  [f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                   :model/Card _a {:name "Card A" :collection_id coll-id}
                   :model/Card _b {:name "Card B" :collection_id coll-id}]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (f (synced-tree))))))

(defn- path-with [tree slug]
  (some (fn [p] (when (str/includes? p slug) p)) (keys tree)))

;;; --------------------------------------------------- Scenarios ----------------------------------------------------

(deftest no-op-pull-equivalence-test
  (testing "GHY-3779: a pull whose content is unchanged (only the version advanced) reconciles to the same
            state via the full and under-test paths"
    (do-with-bench!
     (fn [f0]
       ;; identical content under a new version — exercises the empty-diff fast path
       (run-differential! f0 f0)))))

(deftest edit-card-equivalence-test
  (testing "GHY-3779: editing a single card's content imports equivalently full vs. under-test"
    (do-with-bench!
     (fn [f0]
       (let [b-path (path-with f0 "card_b")
             f1     (update f0 b-path str/replace "display: table" "display: line")]
         (run-differential! f0 f1))))))

(deftest add-card-equivalence-test
  (testing "GHY-3779: adding a new card imports equivalently full vs. under-test"
    (do-with-bench!
     (fn [f0]
       (let [b-path (path-with f0 "card_b")
             b-yaml (get f0 b-path)
             b-eid  (second (re-find #"entity_id: (\S+)" b-yaml))
             c-yaml (-> b-yaml
                        (str/replace b-eid "Cnewcardnewcardnewca")
                        (str/replace "name: Card B" "name: Card C")
                        (str/replace "label: card_b" "label: card_c"))
             c-path (str/replace b-path "card_b" "card_c")
             f1     (assoc f0 c-path c-yaml)]
         (run-differential! f0 f1))))))

(deftest delete-card-equivalence-test
  (testing "GHY-3779: deleting a card remotely imports equivalently full vs. under-test"
    (do-with-bench!
     (fn [f0]
       (let [b-path (path-with f0 "card_b")
             f1     (dissoc f0 b-path)]
         (run-differential! f0 f1))))))

(deftest rename-card-equivalence-test
  (testing "GHY-3779: renaming a card (same entity_id at a new path) imports equivalently — the old
            path's delete must be recognized as a rename, not remove the entity"
    (do-with-bench!
     (fn [f0]
       (let [b-path  (path-with f0 "card_b")
             ;; same entity_id, new name → new slug/path: a rename shows up as delete(old) + add(new)
             renamed (-> (get f0 b-path)
                         (str/replace "name: Card B" "name: Card B Renamed")
                         (str/replace "label: card_b" "label: card_b_renamed"))
             f1      (-> f0 (dissoc b-path) (assoc (str/replace b-path "card_b" "card_b_renamed") renamed))]
         (run-differential! f0 f1))))))
