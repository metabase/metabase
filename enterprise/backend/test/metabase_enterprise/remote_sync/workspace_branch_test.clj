(ns metabase-enterprise.remote-sync.workspace-branch-test
  "Tests for the workspace child-branch helpers in [[metabase-enterprise.remote-sync.core]]:
   the parent-side branch cut and the child-side blocking initial import (GHY-4121)."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.remote-sync.core :as remote-sync.core]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- stub-source
  "A Source stub that reports `existing-branches` and records create-branch calls
   in `created` (an atom of [branch base] vectors)."
  [existing-branches created]
  (reify source.p/Source
    (branches [_] existing-branches)
    (create-branch [_ branch base] (swap! created conj [branch base]))
    (default-branch [_] "main")))

(deftest create-workspace-branch-test
  (testing "cuts the branch from last-synced commit, falling back to the remote-sync-branch setting"
    (mt/with-temporary-setting-values [remote-sync-branch "main"]
      (let [created (atom [])]
        (with-redefs [source/source-from-settings   (fn [& _] (stub-source ["main"] created))
                      remote-sync.task/last-version (constantly "abc123")]
          (is (= "abc123" (remote-sync.core/create-workspace-branch! "ws-foo-1")))
          (is (= [["ws-foo-1" "abc123"]] @created)))
        (testing "no prior sync -> base is the branch name"
          (reset! created [])
          (with-redefs [source/source-from-settings   (fn [& _] (stub-source ["main"] created))
                        remote-sync.task/last-version (constantly nil)]
            (is (= "main" (remote-sync.core/create-workspace-branch! "ws-bar-2")))
            (is (= [["ws-bar-2" "main"]] @created)))))))
  (testing "no-op when the branch already exists (idempotent create / re-created workspace)"
    (let [created (atom [])]
      (with-redefs [source/source-from-settings (fn [& _] (stub-source ["main" "ws-foo-1"] created))]
        (is (nil? (remote-sync.core/create-workspace-branch! "ws-foo-1")))
        (is (= [] @created))))))

(deftest initial-import-if-needed-gates-test
  ;; remote-sync-enabled is derived: (some? remote-sync-url), so gate via the url
  (testing "no-op when remote sync is disabled"
    (mt/with-temporary-setting-values [remote-sync-url nil]
      (is (nil? (remote-sync.core/initial-import-if-needed!)))))
  (testing "no-op when something has already synced"
    (mt/with-temporary-setting-values [remote-sync-url "https://git.example.com/repo.git"]
      (with-redefs [remote-sync.task/last-version (constantly "abc123")]
        (is (nil? (remote-sync.core/initial-import-if-needed!))))))
  (testing "skips (nil) when the branch does not exist on the remote yet"
    (mt/with-temporary-setting-values [remote-sync-url    "https://git.example.com/repo.git"
                                       remote-sync-branch "ws-foo-1"]
      (with-redefs [remote-sync.task/last-version (constantly nil)
                    source/source-from-settings   (fn [& _] (stub-source ["main"] (atom [])))]
        (is (nil? (remote-sync.core/initial-import-if-needed!)))))))

(deftest initial-import-if-needed-blocks-until-task-ends-test
  (testing "kicks a forced import of the branch and returns the finished task"
    (mt/with-temporary-setting-values [remote-sync-url    "https://git.example.com/repo.git"
                                       remote-sync-branch "ws-foo-1"]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (let [import-args (atom nil)]
          (with-redefs [remote-sync.task/last-version (constantly nil)
                        source/source-from-settings   (fn [& _] (stub-source ["main" "ws-foo-1"] (atom [])))
                        impl/async-import!            (fn [branch force? args & _kvs]
                                                        (reset! import-args [branch force? args])
                                                        (let [id (t2/insert-returning-pk! :model/RemoteSyncTask
                                                                                          {:sync_task_type "import"
                                                                                           :initiated_by   (mt/user->id :crowberto)})]
                                                          ;; finish it on a delay so the poll loop actually waits
                                                          (future
                                                            (Thread/sleep 700)
                                                            (t2/update! :model/RemoteSyncTask :id id
                                                                        {:ended_at :%now}))
                                                          {:id id}))]
            (let [task (remote-sync.core/initial-import-if-needed!)]
              (is (some? (:ended_at task)) "returned only after the task ended")
              (is (= ["ws-foo-1" true {}] @import-args)))))))))
