(ns ^:synchronous metabase-enterprise.remote-sync.worktree-pull-test
  "Round-trips of [[impl/import!]] with [[serdes/*worktree-id*]] bound: a worktree pull must materialize the
  branch's content as the worktree's own rows, and each sync scope's reconcile must never touch another scope's
  content."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db)
  (fn [f] (mt/dataset test-data (mt/id) (f))))

(use-fixtures :each
  (fn [f]
    (mt/with-premium-features #{:remote-sync}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
          (test-helpers/clean-remote-sync-state
           #(test-helpers/commit-with-temp f)))))))

;; Entity ids of the default mock branch content (see test-helpers/create-mock-source).
(def ^:private branch-collection-eid "M-Q4pcV0qkiyJ0kiSWECl")
(def ^:private branch-card-eid "f1C68pznmrpN1F5xFDj6d")
(def ^:private branch-dashboard-eid "Q_jD-f-9clKLFZ2TfUG2h")

(defmacro ^:private with-worktree
  "A temp RemoteSyncWorktree torn down with [[impl/delete-worktree!]], which also removes the content,
  ledger, remapping, and task rows a pull creates — rows that would otherwise block the temp row's delete."
  [[sym attrs] & body]
  `(mt/with-temp [:model/RemoteSyncWorktree {~sym :id} ~attrs]
     (try
       ~@body
       (finally
         (impl/delete-worktree! ~sym)))))

(defn- create-import-task!
  [worktree-id]
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                  :initiated_by   (mt/user->id :crowberto)
                                                  :worktree_id    worktree-id}))

(defn- pull-into-worktree!
  "Runs a full worktree pull the way async-import! does: import! under the worktree binding, then the task
  bookkeeping. Returns the import! result."
  [worktree-id]
  (let [task-id (create-import-task! worktree-id)
        result  (binding [serdes/*worktree-id* worktree-id]
                  (impl/import! (source.p/snapshot (test-helpers/create-mock-source)) task-id))]
    (impl/handle-task-result! result task-id :branch "main" :worktree-id worktree-id)
    result))

(defn- local-eid
  [worktree-id source-eid]
  (t2/select-one-fn :target_entity_id :model/RemoteSyncWorktreeRemapping
                    :worktree_id worktree-id
                    :source_entity_id source-eid))

(deftest worktree-first-pull-materializes-content-test
  (with-worktree [wt {:branch "main"}]
    (let [result (pull-into-worktree! wt)]
      (is (= :success (:status result)))
      (testing "the branch's content exists as the worktree's own rows, under remapped entity ids"
        (let [coll (t2/select-one :model/Collection :entity_id (local-eid wt branch-collection-eid))
              card (t2/select-one :model/Card :entity_id (local-eid wt branch-card-eid))
              dash (t2/select-one :model/Dashboard :entity_id (local-eid wt branch-dashboard-eid))]
          (is (=? {:name "Some Collection" :worktree_id wt} coll))
          (is (=? {:name "Some Question" :worktree_id wt :collection_id (:id coll)} card))
          (is (=? {:name "Shared Dashboard" :worktree_id wt} dash))
          (testing "the sync ledger points at the worktree rows"
            (is (= #{["Card" (:id card)] ["Dashboard" (:id dash)] ["Collection" (:id coll)]}
                   (t2/select-fn-set (juxt :model_type :model_id) :model/RemoteSyncObject
                                     :worktree_id wt
                                     :model_type [:in ["Card" "Dashboard" "Collection"]]))))))
      (testing "the pull's version counts as the worktree's last synced version"
        (is (= "mock-version" (remote-sync.task/last-version wt))))
      (testing "a second pull with an unchanged branch is skipped and leaves the content in place"
        (let [task-id (create-import-task! wt)
              result  (binding [serdes/*worktree-id* wt]
                        (impl/import! (source.p/snapshot (test-helpers/create-mock-source)) task-id))]
          (is (= :success (:status result)))
          (is (= {:kind "pull-skipped"} (:outcome result)))
          (is (t2/exists? :model/Card :entity_id (local-eid wt branch-card-eid))))))))

(deftest worktree-pull-leaves-main-app-untouched-test
  (with-worktree [wt {:branch "main"}]
    (mt/with-temp [:model/Collection {main-coll :id} {:name "Main Synced" :is_remote_synced true :location "/"}
                   :model/Card {main-card :id} {:name "Main Card" :collection_id main-coll}
                   :model/TransformTag {main-tag :id} {:name "Main Tag"}
                   :model/RemoteSyncObject {main-rso :id} {:model_type "Card" :model_id main-card
                                                           :model_name "Main Card"
                                                           :status "synced" :status_changed_at :%now}]
      (mt/with-temporary-setting-values [remote-sync-transforms false]
        (is (= :success (:status (pull-into-worktree! wt))))
        (testing "main-app content in synced collections survives a worktree pull"
          (is (t2/exists? :model/Collection :id main-coll))
          (is (t2/exists? :model/Card :id main-card)))
        (testing "main-app global (non-worktree-scoped) models survive a worktree pull"
          (is (t2/exists? :model/TransformTag :id main-tag)))
        (testing "the main app's sync ledger survives a worktree pull"
          (is (t2/exists? :model/RemoteSyncObject :id main-rso)))
        (testing "a worktree pull does not flip the global transforms setting"
          (is (false? (remote-sync.settings/remote-sync-transforms))))))))

(deftest main-app-pull-leaves-worktree-untouched-test
  (with-worktree [wt {:branch "feature-x"}]
    (mt/with-temp [:model/Collection {wt-coll :id} {:name "Worktree Coll" :is_remote_synced true
                                                    :location "/" :worktree_id wt}
                   :model/Card {wt-card :id} {:name "Worktree Card" :collection_id wt-coll}
                   :model/RemoteSyncObject {wt-rso :id} {:model_type "Card" :model_id wt-card
                                                         :model_name "Worktree Card"
                                                         :status "synced" :status_changed_at :%now
                                                         :worktree_id wt}
                   ;; a main-app synced collection absent from the import: the reconcile must still remove it
                   :model/Collection {stale-main :id} {:name "Stale Main" :is_remote_synced true
                                                       :entity_id "stale-main-collection" :location "/"}]
      (let [task-id (create-import-task! nil)
            result  (impl/import! (source.p/snapshot (test-helpers/create-mock-source)) task-id)]
        (is (= :success (:status result)))
        (testing "the worktree's content and ledger survive a main-app pull"
          (is (t2/exists? :model/Collection :id wt-coll))
          (is (t2/exists? :model/Card :id wt-card))
          (is (t2/exists? :model/RemoteSyncObject :id wt-rso)))
        (testing "the main-app reconcile still removes main-app synced content absent from the import"
          (is (not (t2/exists? :model/Collection :id stale-main))))
        (testing "the branch's content lands in the main app"
          (is (=? {:worktree_id nil}
                  (t2/select-one :model/Collection :entity_id branch-collection-eid))))))))

(deftest worktree-ledger-points-at-worktree-rows-test
  (with-worktree [wt {:branch "main"}]
    (let [main-task (create-import-task! nil)
          result    (impl/import! (source.p/snapshot (test-helpers/create-mock-source)) main-task)]
      (is (= :success (:status result)))
      (impl/handle-task-result! result main-task :branch "main")
      (is (= :success (:status (pull-into-worktree! wt))))
      (let [main-card    (t2/select-one :model/Card :entity_id branch-card-eid)
            wt-card      (t2/select-one :model/Card :entity_id (local-eid wt branch-card-eid))
            rso-model-id (fn [worktree-id]
                           (t2/select-one-fn :model_id :model/RemoteSyncObject
                                             :model_type "Card" :worktree_id worktree-id))]
        (testing "the main app and the worktree hold separate copies"
          (is (some? main-card))
          (is (some? wt-card))
          (is (not= (:id main-card) (:id wt-card))))
        (testing "each scope's ledger points at its own copy"
          (is (= (:id main-card) (rso-model-id nil)))
          (is (= (:id wt-card) (rso-model-id wt))))))))

(deftest conflicted-pull-does-not-count-as-synced-test
  (with-worktree [wt {:branch "main"}]
    (let [task-id (create-import-task! wt)]
      (impl/handle-task-result! {:status    :conflict
                                 :version   "conflicted-sha"
                                 :conflicts ["some conflict"]}
                                task-id
                                :branch "main" :worktree-id wt)
      (testing "a conflicted pull records the version it collided with, not one that was applied"
        (is (nil? (remote-sync.task/last-version wt)))
        (is (= "conflicted-sha" (remote-sync.task/last-attempted-version wt))))
      (testing "the worktree still reports remote changes to pull"
        (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                           remote-sync-token "test-token"
                                           remote-sync-branch "main"]
          (mt/with-dynamic-fn-redefs [source/source-from-settings
                                      (constantly (test-helpers/create-mock-source))]
            (impl/invalidate-remote-changes-cache!)
            (is (=? {:has-changes? true}
                    (binding [serdes/*worktree-id* wt]
                      (impl/has-remote-changes? {:branch "main"}))))))))))

(deftest worktree-first-pull-never-spuriously-conflicts-test
  (with-worktree [wt {:branch "main"}]
    ;; unsynced main-app content in a synced collection: absent from the branch, it would trip
    ;; content-deletion conflicts if the check were not scoped to the worktree
    (mt/with-temp [:model/Collection {main-coll :id} {:name "Main Synced" :is_remote_synced true :location "/"}
                   :model/Card _ {:name "Unsaved Main Work" :collection_id main-coll}]
      (let [result (pull-into-worktree! wt)]
        (is (= :success (:status result)))))))

(deftest has-remote-changes-cache-is-scope-keyed-test
  (with-worktree [wt {:branch "main"}]
    (mt/with-temp [:model/RemoteSyncTask _ {:sync_task_type "import"
                                            :ended_at :%now
                                            :version "mock-version"}]
      (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                         remote-sync-token "test-token"
                                         remote-sync-branch "main"
                                         remote-sync-check-changes-cache-ttl-seconds 60]
        (mt/with-dynamic-fn-redefs [source/source-from-settings
                                    (constantly (test-helpers/create-mock-source))]
          (impl/invalidate-remote-changes-cache!)
          (testing "the main app is up to date with the branch, and its answer is cached"
            (is (=? {:has-changes? false :cached? false} (impl/has-remote-changes?)))
            (is (=? {:has-changes? false :cached? true} (impl/has-remote-changes?))))
          (testing "a worktree check for the same branch does not reuse the main app's cached answer"
            (is (=? {:has-changes? true :cached? false}
                    (binding [serdes/*worktree-id* wt]
                      (impl/has-remote-changes? {:branch "main"})))))
          (testing "a main-app check after the worktree's does not reuse the worktree's cached answer"
            (is (=? {:has-changes? false :cached? false} (impl/has-remote-changes?)))))))))
