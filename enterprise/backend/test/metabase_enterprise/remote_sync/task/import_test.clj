(ns metabase-enterprise.remote-sync.task.import-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.task.import :as task.import]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (dev.failsafe TimeoutExceededException)
   (org.eclipse.jgit.api Git)))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db)
  ;; the mock source's card yaml references the test-data database, so it must exist for import to succeed
  (fn [f] (mt/dataset test-data
            (mt/id)
            (f))))

(use-fixtures :each
  test-helpers/clean-remote-sync-state
  (fn [f]
    ;; :audit-app is needed for events to actually be recorded to the audit log
    (mt/with-premium-features #{:remote-sync :audit-app}
      (f))))

(deftest auto-import-writes-audit-log-entry-test
  (testing "GHY-3819: the background auto-import job publishes :event/remote-sync-import so the activity log records the pull"
    (mt/with-temporary-setting-values [remote-sync-url "https://github.com/test/repo.git"
                                       remote-sync-token "test-token"
                                       remote-sync-branch "main"
                                       remote-sync-type :read-only
                                       remote-sync-auto-import true]
      (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] (test-helpers/create-mock-source))]
        (let [before (t2/count :model/AuditLog :topic "remote-sync-import")]
          (#'task.import/auto-import!)
          (is (= (inc before) (t2/count :model/AuditLog :topic "remote-sync-import")))
          (let [entry (t2/select-one :model/AuditLog :topic "remote-sync-import" {:order-by [[:id :desc]]})]
            (testing "system-triggered, so no user"
              (is (nil? (:user_id entry))))
            (testing "marked as automatic so it can be distinguished from manual imports"
              (is (true? (get-in entry [:details :auto]))))
            (testing "branch recorded in details"
              (is (= "main" (get-in entry [:details :branch])))))
          (testing "a no-op run (source version unchanged) does not log another entry"
            (#'task.import/auto-import!)
            (is (= (inc before) (t2/count :model/AuditLog :topic "remote-sync-import")))))))))

(deftest auto-import-releases-its-lease-test
  (testing "the auto-import job releases the lease of its source when it imports, skips, fails, refuses and times out"
    (mt/with-temp-dir [remote-dir nil]
      (let [url     (test-helpers/init-local-git-remote! remote-dir)
            version (with-open [git (Git/open (io/file remote-dir))]
                      (.name (.resolve (.getRepository git) "refs/heads/master")))
            import! (fn [branch]
                      (mt/with-temporary-setting-values [remote-sync-branch branch]
                        (#'task.import/auto-import!)))]
        (mt/with-temporary-setting-values [remote-sync-url         url
                                           remote-sync-token       nil
                                           remote-sync-type        :read-only
                                           remote-sync-auto-import true]
          (try
            (mt/with-dynamic-fn-redefs [impl/import! (fn [& _] {:status :success})]
              (testing "an import"
                (import! "master")
                (is (t2/exists? :model/RemoteSyncTask :sync_task_type "import") "precondition: the job ran an import task")
                (is (empty? (test-helpers/leases url)) "no lease holds a clone after the job"))
              (testing "a skip, because the version is the same"
                (let [tasks (t2/count :model/RemoteSyncTask)]
                  (mt/with-dynamic-fn-redefs [remote-sync.task/last-version (constantly version)]
                    (import! "master"))
                  (is (= tasks (t2/count :model/RemoteSyncTask)) "precondition: the job skipped"))
                (is (empty? (test-helpers/leases url)) "no lease holds a clone after the job"))
              (testing "a failure, because the branch is missing"
                (is (thrown-with-msg? Exception #"Invalid branch" (import! "no-such-branch"))
                    "precondition: the job fails")
                (is (empty? (test-helpers/leases url)) "no lease holds a clone after the job"))
              (testing "a refusal, because a task runs"
                (let [tasks (t2/count :model/RemoteSyncTask)]
                  (mt/with-dynamic-fn-redefs [impl/create-task-with-lock! (constantly {:id 0 :existing? true})]
                    (import! "master"))
                  (is (= tasks (t2/count :model/RemoteSyncTask)) "precondition: the job made no task"))
                (is (empty? (test-helpers/leases url)) "no lease holds a clone after the job")))
            (testing "a timeout"
              (mt/with-temporary-setting-values [remote-sync-task-time-limit-ms 10]
                (let [interrupted (promise)]
                  (mt/with-dynamic-fn-redefs [impl/import! (fn [& _]
                                                             (try
                                                               (Thread/sleep 5000)
                                                               {:status :success}
                                                               (catch InterruptedException e
                                                                 (deliver interrupted true)
                                                                 (throw e))))]
                    (is (thrown? TimeoutExceededException (import! "master")) "precondition: the job times out")
                    (is (true? (deref interrupted 5000 false)) "precondition: the timeout interrupts the import")
                    (is (empty? (test-helpers/leases url)) "no lease holds a clone after the job")))))
            (finally (test-helpers/forget-clones! url))))))))
