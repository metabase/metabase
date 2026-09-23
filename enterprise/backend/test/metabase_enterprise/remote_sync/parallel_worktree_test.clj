(ns metabase-enterprise.remote-sync.parallel-worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.default :as resolve.default]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each (fn [f]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
                        (test-helpers/clean-remote-sync-state
                         #(test-helpers/commit-with-temp f)))))

(defn- await-task
  "Poll the RemoteSyncTask `task-id` inside `worktree-id` until it ends, returning it."
  [worktree-id task-id]
  (mdb.worktree/with-worktree worktree-id
    (loop [n 0]
      (let [task (t2/select-one :model/RemoteSyncTask :id task-id)]
        (if (or (:ended_at task) (> n 300))
          task
          (do (Thread/sleep 100) (recur (inc n))))))))

(defn- card-names [worktree-id]
  (mdb.worktree/with-worktree worktree-id
    (set (t2/select-fn-set :name :model/Card))))

(defn- main-app-content
  "What a pull would write in the main app: its cards, collections, dashboards and RemoteSyncObject rows."
  []
  (mdb.worktree/with-worktree nil
    {:cards       (t2/select-fn-set (juxt :id :entity_id :name :collection_id :updated_at) :model/Card)
     :collections (t2/select-fn-set (juxt :id :entity_id :name :location) :model/Collection)
     :dashboards  (t2/select-fn-set (juxt :id :entity_id :name :updated_at) :model/Dashboard)
     :rsos        (t2/select-fn-set (juxt :id :model_type :model_id :status) :model/RemoteSyncObject)}))

(deftest pulls-in-different-worktrees-run-in-parallel-test
  ;; Other tests can leave cards with the mock source's names in the main app; this test must not depend on
  ;; the main app being empty, so it starts with such leftovers itself.
  (mt/with-temp [:model/Card _ {:name "Some Question"}
                 :model/Card _ {:name "Dev Card"}]
    (mt/with-temporary-setting-values [remote-sync-enabled true
                                       remote-sync-url     "https://github.com/test/repo.git"
                                       remote-sync-token   "token"
                                       remote-sync-branch  "main"
                                       remote-sync-type    :read-write]
      (mt/id) ; the mock cards reference test-data
      (let [a       (:id (remote-sync.db/insert-worktree! {:branch "main"}))
            b       (:id (remote-sync.db/insert-worktree! {:branch "develop"}))
            release (promise)
            started (atom #{})
            orig    (dynamic-redefs/original-fn #'impl/import!)
            before  (main-app-content)]
        (try
          (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [branch] (test-helpers/create-mock-source :branch branch))
                                      impl/import!                (fn [& args]
                                                                    (swap! started conj (mdb.worktree/worktree-id))
                                                                    (deref release 20000 nil)
                                                                    (apply orig args))]
            (let [task-a (mdb.worktree/with-worktree a (impl/async-import! "main" true {}))
                  task-b (mdb.worktree/with-worktree b (impl/async-import! "develop" true {}))]
              (testing "B's pull starts while A's is still held open"
                (is (some? (:id task-a)))
                (is (some? (:id task-b)))
                (is (not= (:id task-a) (:id task-b)))
                (Thread/sleep 500)
                (is (= #{a b} @started)))
              (testing "a second pull in the same worktree is still refused"
                (is (thrown-with-msg? Exception #"in progress"
                                      (mdb.worktree/with-worktree a (impl/async-import! "main" true {})))))
              (testing "the main app is not blocked by the worktrees' pulls"
                (is (nil? (t2/select-one :model/RemoteSyncTask :ended_at nil))))
              (deliver release true)
              (testing "both finish cleanly, each with its own branch's content"
                (is (=? {:ended_at some? :error_message nil} (await-task a (:id task-a))))
                (is (=? {:ended_at some? :error_message nil} (await-task b (:id task-b))))
                (is (contains? (card-names a) "Some Question"))
                (is (not (contains? (card-names a) "Dev Card")))
                (is (contains? (card-names b) "Dev Card"))
                (is (not (contains? (card-names b) "Some Question")))
                (is (= before (main-app-content)) "neither pull wrote to the main app"))))
          (finally
            (deliver release true)
            (remote-sync.db/delete-worktree! a)
            (remote-sync.db/delete-worktree! b)))))))

(deftest import-user-finds-a-user-a-concurrent-import-created-test
  (testing "when the resolver missed a user that another import has since created, the insert conflict resolves to that user"
    (mt/with-temp [:model/User {id :id} {:email "someone-else-made-me@example.com"}]
      (let [stale-resolver (reify resolve/SerdesImportResolver
                             (import-fk-keyed [_ _ _ _] nil)
                             (import-fk [_ _ _] (throw (UnsupportedOperationException.)))
                             (import-user [_ _] (throw (UnsupportedOperationException.)))
                             (import-table-fk [_ _] (throw (UnsupportedOperationException.)))
                             (import-field-fk [_ _] (throw (UnsupportedOperationException.))))]
        (is (= id (resolve.default/import-user stale-resolver "someone-else-made-me@example.com")))))))
