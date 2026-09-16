(ns metabase-enterprise.remote-sync.init-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.init :as init]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase.collections.models.collection :as collection]
   [metabase.startup.core :as startup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each th/clean-remote-sync-state)

(defn- capture-async-import! []
  (let [calls (atom [])]
    [calls (fn [branch force? args & _opts] (swap! calls conj [branch force? args]) nil)]))

(deftest remote-sync-init-disabled-with-remote-synced-collection-clears-test
  (testing "When remote sync is disabled, existing remote-synced collections are cleared"
    (mt/with-temporary-setting-values [:remote-sync-url nil
                                       :remote-sync-type nil
                                       :remote-sync-branch nil]
      (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true}]
        (is (true? (collection/has-remote-synced-collection?)))
        (#'init/remote-sync-init)
        (is (false? (collection/has-remote-synced-collection?)))))))

(deftest remote-sync-init-disabled-without-remote-synced-collection-is-noop-test
  (testing "When remote sync is disabled and no remote-synced collection exists, nothing happens"
    (mt/with-temporary-setting-values [:remote-sync-url nil]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [impl/async-import! capture]
          (#'init/remote-sync-init)
          (is (empty? @calls)))))))

(deftest remote-sync-init-read-only-without-branch-throws-test
  (testing "Read-only with enabled sync but no branch throws"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch nil]
      (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly false)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"no branch is set"
                              (#'init/remote-sync-init)))))))

(deftest remote-sync-init-read-only-dirty-without-allow-throws-test
  (testing "Read-only with dirty unpublished changes throws unless override is set"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch "main"
                                       :remote-sync-allow nil]
      (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly true)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"unpublished changes"
                              (#'init/remote-sync-init)))))))

(deftest remote-sync-init-read-only-dirty-with-allow-imports-test
  (testing "Read-only with dirty unpublished changes plus overwrite-unpublished override triggers import"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch "main"
                                       :remote-sync-allow "overwrite-unpublished"]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly true)
                                    impl/async-import! capture]
          (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true}]
            (#'init/remote-sync-init)
            (is (= [["main" true {}]] @calls))))))))

(deftest remote-sync-init-no-remote-synced-collection-imports-test
  (testing "When remote sync is enabled but no remote-synced collection exists, import is triggered"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-only
                                       :remote-sync-branch "develop"
                                       :remote-sync-allow nil]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly false)
                                    impl/async-import! capture]
          ;; Make sure no remote-synced collection exists for the test
          (collection/clear-remote-synced-collection!)
          (#'init/remote-sync-init)
          (is (= [["develop" true {}]] @calls)))))))

(deftest remote-sync-init-no-branch-warns-but-does-not-throw-test
  (testing "When remote sync is enabled (read-write) but no branch, no import happens, no throw"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-write
                                       :remote-sync-branch nil]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly false)
                                    impl/async-import! capture]
          (collection/clear-remote-synced-collection!)
          (#'init/remote-sync-init)
          (is (empty? @calls)))))))

(deftest remote-sync-init-enabled-with-remote-synced-collection-no-import-test
  (testing "When a remote-synced collection already exists, no automatic import is triggered"
    (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"
                                       :remote-sync-type :read-write
                                       :remote-sync-branch "main"]
      (let [[calls capture] (capture-async-import!)]
        (mt/with-dynamic-fn-redefs [remote-sync.object/dirty? (constantly false)
                                    impl/async-import! capture]
          (mt/with-temp [:model/Collection _ {:name "Synced" :is_remote_synced true}]
            (#'init/remote-sync-init)
            (is (empty? @calls))))))))

(defn- wait-until
  "True once `pred` returns truthy, polling every 10 ms for up to `timeout-ms`; false otherwise."
  [pred timeout-ms]
  (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (cond
        (pred)                                    true
        (> (System/currentTimeMillis) deadline)   false
        :else                                     (do (Thread/sleep 10) (recur))))))

(defn- new-task-id []
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import" :initiated_by (mt/user->id :rasta)}))

(deftest remote-sync-shutdown-fails-this-jvms-running-tasks-test
  (testing "shutdown fails every task whose worker runs in this JVM and leaves a stale open row from elsewhere untouched"
    (let [other-id (new-task-id)
          _        (t2/update! :model/RemoteSyncTask other-id
                               {:last_progress_report_at (t/minus (t/offset-date-time) (t/hours 2))})
          own-id   (new-task-id)
          release  (promise)
          worker   (future (impl/run-task-body! own-id nil
                                                (fn [_] @release {:status :success :outcome {:kind "pull-skipped"}})))]
      (try
        (is (true? (wait-until #(contains? (impl/running-task-ids) own-id) 5000)))
        (startup/def-shutdown-logic! ::init/remote-sync-shutdown)
        (is (=? {:ended_at some? :cancelled false :error_message "Interrupted by server shutdown"}
                (t2/select-one :model/RemoteSyncTask :id own-id)))
        (is (=? {:ended_at nil :error_message nil}
                (t2/select-one :model/RemoteSyncTask :id other-id)))
        (finally
          (deliver release nil)
          (is (not= ::timeout (deref worker 10000 ::timeout)))))
      (testing "the worker's late result does not overwrite the shutdown bookkeeping"
        (is (=? {:error_message "Interrupted by server shutdown" :outcome nil}
                (t2/select-one :model/RemoteSyncTask :id own-id)))))))
