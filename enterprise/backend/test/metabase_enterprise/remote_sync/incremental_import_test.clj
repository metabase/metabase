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
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

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

(defn- import-v1-under-test!
  "Runs the under-test import of v1 (force? false), spying on incremental-load-snapshot! to report which
  path it took. Returns [result path], where path is :incremental (the fast-path ran) or :fallback (it
  declined and import! ran the full load-snapshot!)."
  [src]
  (let [real (mt/original-fn #'impl/incremental-load-snapshot!)
        path (atom :fallback)]
    (mt/with-dynamic-fn-redefs [impl/incremental-load-snapshot!
                                (fn [& args] (let [r (apply real args)]
                                               (reset! path (if (= r :remote-sync/incremental-not-possible) :fallback :incremental))
                                               r))]
      [(import-at! src "v1" :force? false) @path])))

(defn- run-differential!
  "Imports `f0` as the baseline, then runs the full (oracle) and under-test imports of `f1` and asserts the
  resulting state is identical. `f0`/`f1` are {path content} trees. Returns the path the under-test import
  took (:incremental or :fallback) so the caller can assert the v1 scope boundary."
  [f0 f1]
  ;; These scenarios assert DB/RSO/setting/version equivalence, not search — disable index maintenance so
  ;; their (async) search ingestion can't bleed into the search-index integration test in this namespace.
  (search.tu/with-index-disabled
    (let [src (rs.test/versioned-source :trees {"v0" f0 "v1" f1} :current "v0")]
      (is (= :success (:status (import-at! src "v0" :force? true))) "baseline import of v0 succeeds")
      (is (= :success (:status (import-at! src "v1" :force? true))) "oracle full import of v1 succeeds")
      (let [oracle (state-vector)]
        (is (= :success (:status (import-at! src "v0" :force? true))) "reset back to v0 succeeds")
        (let [[result path] (import-v1-under-test! src)]
          (is (= :success (:status result)) "under-test import of v1 succeeds")
          (assert-equivalent oracle (state-vector))
          path)))))

(defn- do-with-bench!
  "Sets up a remote-synced `Bench` collection with cards A and B, then calls `f` with the V0 tree
  ({path content}; the two cards' paths carry `card_a` / `card_b` slugs). Cleans up any entities
  recreated during the differential churn (delete+recreate gives fresh primary keys)."
  [f]
  ;; with-temp commits (not rollback) via the `commit-with-temp` :each fixture, so the import's progress
  ;; updates on a separate connection don't block on MySQL — see that fixture's docstring.
  (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Bench" :is_remote_synced true :location "/"}
                   :model/Card _a {:name "Card A" :collection_id coll-id}
                   :model/Card _b {:name "Card B" :collection_id coll-id}]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (f (synced-tree))))))

(defn- path-with [tree slug]
  (some (fn [p] (when (str/includes? p slug) p)) (keys tree)))

(defn- bench-collection []
  (t2/select-one :model/Collection :name "Bench" :is_remote_synced true))

;;; --------------------------------------------------- Scenarios ----------------------------------------------------

(deftest no-op-pull-equivalence-test
  (testing "GHY-3779: a pull whose content is unchanged (only the version advanced) reconciles to the same
            state via the full and under-test paths"
    (do-with-bench!
     (fn [f0]
       ;; identical content under a new version — exercises the empty-diff fast path
       (is (= :incremental (run-differential! f0 f0)))))))

(deftest edit-card-equivalence-test
  (testing "GHY-3779: editing a single card's content imports equivalently full vs. under-test"
    (do-with-bench!
     (fn [f0]
       (let [b-path (path-with f0 "card_b")
             f1     (update f0 b-path str/replace "display: table" "display: line")]
         (is (= :incremental (run-differential! f0 f1))))))))

(deftest edit-multiple-cards-equivalence-test
  (testing "GHY-3779: editing several cards in one pull loads just those cards, equivalently to a full import"
    (do-with-bench!
     (fn [f0]
       (let [f1 (-> f0
                    (update (path-with f0 "card_a") str/replace "display: table" "display: line")
                    (update (path-with f0 "card_b") str/replace "display: table" "display: bar"))]
         (is (= :incremental (run-differential! f0 f1))))))))

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
         (is (= :incremental (run-differential! f0 f1))))))))

(deftest delete-card-equivalence-test
  (testing "GHY-3779: deleting a card remotely imports equivalently full vs. under-test"
    (do-with-bench!
     (fn [f0]
       (let [b-path (path-with f0 "card_b")
             f1     (dissoc f0 b-path)]
         (is (= :incremental (run-differential! f0 f1))))))))

(deftest incremental-search-update-only-changed-test
  (testing "GHY-3779: an incremental edit re-indexes only the changed entity (we skip the full reindex),
            keeping search-index cost proportional to the change"
    ;; Index maintenance is disabled so the (un-stubbed) baseline reindex can't bleed into the
    ;; search-index integration test; the with-redefs recorder still captures the hook's update! call.
    (search.tu/with-index-disabled
      (do-with-bench!
       (fn [f0]
         (let [a-eid   (second (re-find #"entity_id: (\S+)" (get f0 (path-with f0 "card_a"))))
               b-path  (path-with f0 "card_b")
               b-eid   (second (re-find #"entity_id: (\S+)" (get f0 b-path)))
               f1      (update f0 b-path str/replace "display: table" "display: line")
               src     (rs.test/versioned-source :trees {"v0" f0 "v1" f1} :current "v0")
               indexed (atom #{})]
           (import-at! src "v0" :force? true)              ; baseline (full) — local == v0
           (mt/with-dynamic-fn-redefs [search/update! (fn [inst] (swap! indexed conj (:entity_id inst)))
                                       search/delete! (fn [& _] nil)]
             (import-at! src "v1"))                        ; incremental edit of card_b only
           (is (contains? @indexed b-eid) "the edited card is re-indexed")
           (is (not (contains? @indexed a-eid)) "the unchanged card is NOT re-indexed")))))))

(deftest incremental-delete-removes-from-search-index-test
  (testing "GHY-3779: a remote delete must explicitly remove the entity from the search index — unlike
            updates (handled by the load's after-insert/after-update hooks), there is no after-delete
            hook, so the incremental path calls search/delete! for each removed entity."
    ;; Asserted at the call level (search/delete! invoked with the right model + id); the live appdb index
    ;; isn't queried here because its tracking state is order-sensitive across tests in a shared JVM.
    (search.tu/with-index-disabled
      (do-with-bench!
       (fn [_f0]
         (mt/with-temp [:model/Card       {model-id :id} {:name "Bench Model" :type :model
                                                          :collection_id (:id (bench-collection))}
                        :model/ModelIndex {mi-id :id}    {:model_id   model-id
                                                          :pk_ref     [:field 1 nil]
                                                          :value_ref  [:field 2 nil]
                                                          :schedule   "0 0 0 * * ? *"
                                                          :state      "indexed"
                                                          :creator_id (mt/user->id :rasta)}]
           ;; the model delete removes this row by cascade
           (t2/insert! :model/ModelIndexValue {:model_index_id mi-id :model_pk 42 :name "Quokka value"})
           (let [f0      (synced-tree)
                 b-path  (path-with f0 "card_b")
                 b-eid   (second (re-find #"entity_id: (\S+)" (get f0 b-path)))
                 f1      (dissoc f0 b-path (path-with f0 "bench_model"))
                 src     (rs.test/versioned-source :trees {"v0" f0 "v1" f1} :current "v0")
                 deleted (atom [])]
             (import-at! src "v0" :force? true)            ; baseline (full) — local == v0
             (let [b-id (t2/select-one-pk :model/Card :entity_id b-eid)]
               (mt/with-dynamic-fn-redefs [search/delete! (fn [model ids] (swap! deleted conj [model (vec ids)]))]
                 (import-at! src "v1"))                    ; incremental delete of card_b and the model
               (is (some (fn [[model ids]] (and (= :model/Card model) (some #{(str b-id)} ids))) @deleted)
                   "the removed card is deleted from the search index by id, as the string the index stores
                    (an integer id fails on Postgres with `text = integer`)")
               (is (some (fn [[model ids]] (and (= :model/ModelIndexValue model) (some #{(str mi-id ":42")} ids)))
                         @deleted)
                   "the model-index value that the model delete removes by cascade leaves search too")
               (is (every? string? (mapcat second @deleted))
                   "every id sent to the search index is a string, also the ids of rows removed by cascade")))))))))

(deftest model-delete-removes-cascaded-actions-and-indexed-entities-from-search-test
  (testing (str "a pull that deletes a model card also deletes its actions and model-index values (foreign-key "
                "cascade), and it must remove them from search, as the full import does")
    (search.tu/with-appdb-search-if-available*
      (do-with-bench!
       (fn [_f0]
         (let [bench (bench-collection)]
           (mt/with-temp [:model/Card        {model-id :id}  {:name "Bench Model" :type :model :collection_id (:id bench)}
                          :model/Action      {action-id :id} {:name "Zebra action" :type :query :model_id model-id}
                          :model/QueryAction _               {:action_id     action-id
                                                              :dataset_query (mt/native-query {:query "select 1"})}
                          :model/ModelIndex  {mi-id :id}     {:model_id   model-id
                                                              :pk_ref     [:field 1 nil]
                                                              :value_ref  [:field 2 nil]
                                                              :schedule   "0 0 0 * * ? *"
                                                              :state      "indexed"
                                                              :creator_id (mt/user->id :rasta)}]
             ;; Inserted directly: ModelIndexValue has no id column, so with-temp cannot clean it up. The model delete
             ;; removes it by cascade. Its search entry comes from the reindex of the baseline import.
             (t2/insert! :model/ModelIndexValue {:model_index_id mi-id :model_pk 42 :name "Quokka value"})
             (mt/with-model-cleanup [:model/Action]
               (let [g0          (synced-tree)
                     model-path  (path-with g0 "bench_model")
                     action-path (path-with g0 "zebra_action")
                     g1          (dissoc g0 model-path action-path)
                     src         (rs.test/versioned-source :trees {"v0" g0 "v1" g1} :current "v0")
                     action?     #(t2/exists? (search.index/active-table) :model "action" :model_id (str action-id))
                     value?      #(t2/exists? (search.index/active-table) :model "indexed-entity"
                                              :model_id (str mi-id ":" 42))]
                 (is (some? model-path) "precondition: the model card is in the synced tree")
                 (is (some? action-path) "precondition: the action is in the synced tree")
                 (is (= :success (:status (import-at! src "v0" :force? true))) "baseline import of v0 succeeds")
                 (is (action?) "precondition: the action is in the search index")
                 (is (value?) "precondition: the model-index value is in the search index")
                 (let [[result path] (import-v1-under-test! src)]
                   (is (= :success (:status result)) "the pull that deletes the model succeeds")
                   (is (= :incremental path) "a model delete stays on the incremental path")
                   (is (not (t2/exists? :model/Card model-id)) "the pull deleted the model")
                   (is (not (action?)) "the tracked action is gone from the search index")
                   (is (not (value?)) "the cascaded model-index value is gone from the search index")))))))))))

(deftest model-delete-removes-untracked-action-from-search-test
  (testing (str "a pull that deletes a model card also removes from search an action of the model that the ledger "
                "does not track, which the foreign-key cascade deletes")
    (search.tu/with-appdb-search-if-available*
      (do-with-bench!
       (fn [_f0]
         (let [bench (bench-collection)]
           (mt/with-temp [:model/Card {model-id :id} {:name "Bench Model" :type :model :collection_id (:id bench)}]
             (mt/with-model-cleanup [:model/Action]
               (let [g0         (synced-tree)
                     model-path (path-with g0 "bench_model")
                     g1         (dissoc g0 model-path)
                     src        (rs.test/versioned-source :trees {"v0" g0 "v1" g1} :current "v0")]
                 (is (some? model-path) "precondition: the model card is in the synced tree")
                 (is (= :success (:status (import-at! src "v0" :force? true))) "baseline import of v0 succeeds")
                 ;; t2/insert! publishes no event, so the ledger does not track this action
                 (let [action-id (t2/insert-returning-pk! :model/Action {:name "Zebra action" :type :query :model_id model-id})
                       _         (t2/insert! :model/QueryAction {:action_id     action-id
                                                                 :dataset_query (mt/native-query {:query "select 1"})})
                       action?   #(t2/exists? (search.index/active-table) :model "action" :model_id (str action-id))]
                   (is (not (t2/exists? :model/RemoteSyncObject :model_type "Action" :model_id action-id))
                       "precondition: the ledger does not track the action")
                   (is (action?) "precondition: the action is in the search index")
                   (let [[result path] (import-v1-under-test! src)]
                     (is (= :success (:status result)) "the pull that deletes the model succeeds")
                     (is (= :incremental path) "a model delete stays on the incremental path")
                     (is (not (t2/exists? :model/Action action-id)) "the cascade deleted the action")
                     (is (not (action?)) "the untracked action is gone from the search index"))))))))))))

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
         (is (= :incremental (run-differential! f0 f1))))))))

;;; --------------------------------------- Structural changes: fall back to full ---------------------------------------

(deftest collection-rename-falls-back-test
  (testing "GHY-3779: a Collection change falls back to the full import (a rename moves descendant paths),
            and still reconciles to the same state as the full oracle"
    (do-with-bench!
     (fn [f0]
       (let [c-path (path-with f0 "bench.yaml")
             f1     (update f0 c-path str/replace "name: Bench" "name: Workbench")]
         (is (= :fallback (run-differential! f0 f1))))))))

(deftest collection-delete-with-contents-falls-back-test
  (testing "GHY-3779: deleting a collection and its contents falls back to the full import (avoids the
            cascade trap), and still reconciles to the same state as the full oracle"
    (do-with-bench!
     (fn [f0]
       ;; remove the whole bench subtree (collection + both cards)
       (is (= :fallback (run-differential! f0 {})))))))

;;; ------------------------------------------ First import: never incremental ------------------------------------------

(deftest cancelled-after-commit-keeps-the-sync-base-test
  (testing "a pull whose task is cancelled after its transaction committed still advances last-version, so the
            next pull of the same snapshot is skipped instead of re-importing everything"
    (do-with-bench!
     (fn [f0]
       (search.tu/with-index-disabled
         (let [f1  (update f0 (path-with f0 "card_b") str/replace "display: table" "display: line")
               src (rs.test/versioned-source :trees {"v0" f0 "v1" f1} :current "v0")]
           (is (= :success (:status (import-at! src "v0" :force? true))))
           (let [task (t2/insert-returning-pk! :model/RemoteSyncTask
                                               {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})]
             (is (= :success (:status (impl/import! (source.p/snapshot-at src "v1") task))))
             ;; The worker died (or an admin cancelled) between the commit and the result bookkeeping.
             (remote-sync.task/cancel-sync-task! task)
             (is (=? {:cancelled true :version "v1"} (t2/select-one :model/RemoteSyncTask :id task))))
           (is (= "v1" (remote-sync.task/last-version)))
           (is (=? {:status :success :outcome {:kind "pull-skipped"}} (import-at! src "v1")))))))))

(deftest first-import-no-force-uses-full-load-test
  (testing "GHY-3779: a first import (no prior version, so last-version is nil) with force? false must NOT
            attempt the incremental fast-path. incremental-load-snapshot! assumes local state equals
            last-version, which cannot hold on a first import — driving it with a nil base diffs against an
            unresolvable version (a real git source NPEs on resolve(nil)). The first import must take the
            full load-snapshot! and succeed."
    (do-with-bench!
     (fn [f0]
       (let [src     (rs.test/versioned-source :trees {"v0" f0} :current "v0")
             real    (mt/original-fn #'impl/incremental-load-snapshot!)
             called? (atom false)]
         (mt/with-dynamic-fn-redefs [impl/incremental-load-snapshot! (fn [& args] (reset! called? true) (apply real args))]
           ;; no baseline import has run, so this is the first import: first-import? is true
           (is (= :success (:status (import-at! src "v0" :force? false))))
           (is (not @called?)
               "incremental-load-snapshot! must not run on a first import")))))))
