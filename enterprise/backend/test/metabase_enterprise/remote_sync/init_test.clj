(ns ^:synchronized metabase-enterprise.remote-sync.init-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.init :as init]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase-enterprise.remote-sync.stats :as stats]
   [metabase-enterprise.remote-sync.sync :as sync]
   [metabase-enterprise.remote-sync.task.auto-import :as auto-import]
   [metabase-enterprise.remote-sync.task.table-cleanup :as table-cleanup]
   [metabase-enterprise.remote-sync.tasks :as tasks]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk] (mt/with-additional-premium-features #{:remote-sync} (thunk))))

(defmacro ^:private with-no-tasks
  "Runs `body` with no RemoteSyncTask."
  [& body]
  `(mt/with-model-cleanup [:model/RemoteSyncTask]
     (t2/delete! :model/RemoteSyncTask)
     ~@body))

(def ^:private pulled-branches
  "The branches [[pull-to-tip]] pulled."
  (atom []))

(defn- pull-to-tip
  "A stand-in for [[sync/pull!]] that changes nothing, records `branch` and syncs with its tip."
  [repo branch _base-version _opts]
  (swap! pulled-branches conj branch)
  {:status :success :version (protocol/version repo branch) :outcome {:kind "pull-skipped"}})

(defn- wait-for-end!
  "Waits until the RemoteSyncTask with `task-id` ends, returning it."
  [task-id]
  (loop [attempts 300]
    (let [task (t2/select-one :model/RemoteSyncTask :id task-id)]
      (cond
        (:ended_at task) task
        (pos? attempts)  (do (Thread/sleep 100) (recur (dec attempts)))
        :else            (throw (ex-info "The remote sync task did not end" {:task task}))))))

(deftest startup-stops-syncing-collections-when-remote-sync-is-off-test
  (with-no-tasks
    (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}]
      (let [synced? #(t2/select-one-fn :is_remote_synced :model/Collection :id (:id synced))]
        (testing "with a repository URL, startup keeps the collection synced"
          (remote-sync.tu/with-repository [url]
            (remote-sync.tu/with-remote-sync [url :read-write]
              (#'init/remote-sync-init!)
              (is (true? (synced?))))))
        (testing "without one, startup stops syncing it"
          (mt/with-temporary-setting-values [remote-sync-url nil]
            (#'init/remote-sync-init!)
            (is (false? (synced?)))))))))

(deftest startup-ends-stale-tasks-test
  (with-no-tasks
    (mt/with-temporary-setting-values [remote-sync-url nil]
      (let [task (t2/insert-returning-instance! :model/RemoteSyncTask
                                                {:sync_task_type          "import"
                                                 :progress                0.5
                                                 :started_at              #t "2020-01-01T00:00Z"
                                                 :last_progress_report_at #t "2020-01-01T00:00Z"})]
        (testing "startup ends the tasks that stopped showing signs of life"
          (#'init/remote-sync-init!)
          (is (=? {:ended_at  some?
                   :cancelled true}
                  (t2/select-one :model/RemoteSyncTask :id (:id task)))))))))

(deftest startup-pulls-into-read-only-instance-test
  (with-no-tasks
    (remote-sync.tu/with-repository [url]
      (remote-sync.tu/with-remote-sync [url :read-only]
        (mt/with-dynamic-fn-redefs [sync/pull! pull-to-tip]
          (testing "startup on a read-only instance pulls the synced branch"
            (reset! pulled-branches [])
            (let [task (#'init/remote-sync-init!)]
              (is (=? {:sync_task_type "import"
                       :error_message  nil}
                      (wait-for-end! (:id task))))
              (is (= ["main"] @pulled-branches))
              (is (= (remote-sync.tu/tip! url "main") (tasks/base-version))))))))))

(deftest auto-import-test
  (with-no-tasks
    (remote-sync.tu/with-repository [url]
      (remote-sync.tu/with-remote-sync [url :read-only]
        (mt/with-temporary-setting-values [remote-sync-auto-import true]
          (mt/with-dynamic-fn-redefs [sync/pull! pull-to-tip]
            (testing "auto-import pulls the branch when it moved on since the last sync"
              (reset! pulled-branches [])
              (#'auto-import/auto-import!)
              (is (= ["main"] @pulled-branches))
              (is (= 1 (t2/count :model/RemoteSyncTask :sync_task_type "import")))
              (is (= (remote-sync.tu/tip! url "main") (tasks/base-version))))
            (testing "and skips it when it didn't"
              (#'auto-import/auto-import!)
              (is (= ["main"] @pulled-branches))
              (is (= 1 (t2/count :model/RemoteSyncTask :sync_task_type "import"))))))))))

(deftest table-cleanup-test
  (with-no-tasks
    (let [old-sync (tasks/run-now! {:type "import" :branch "main"} (fn [_report] {:status :success :version "v1"}))
          failed   (tasks/run-now! {:type "export" :branch "main"} (fn [_report] {:status :error :message "Failed"}))
          recent   (tasks/run-now! {:type "export" :branch "main"} (fn [_report] {:status :error :message "Failed"}))]
      (t2/update! :model/RemoteSyncTask :id [:in [(:id old-sync) (:id failed)]] {:started_at #t "2020-01-01T00:00Z"})
      (testing "the cleanup job deletes the tasks older than its retention, but the one of the last sync"
        (#'table-cleanup/trim-tables!)
        (is (t2/exists? :model/RemoteSyncTask :id (:id old-sync)))
        (is (not (t2/exists? :model/RemoteSyncTask :id (:id failed))))
        (is (t2/exists? :model/RemoteSyncTask :id (:id recent)))))))

(deftest stats-test
  (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                 :model/Card       _      {:name "Synced question" :type :question :collection_id (:id synced)}
                 :model/Card       _      {:name "Synced model" :type :model :collection_id (:id synced)}]
    (testing "with remote sync on, the stats count the synced content"
      (remote-sync.tu/with-remote-sync ["file:///tmp/remote-sync-stats-test" :read-write]
        (is (=? {:remote-sync-question-count pos-int?
                 :remote-sync-model-count    pos-int?
                 :remote-sync-content-count  pos-int?}
                (stats/remote-sync-stats)))))
    (testing "with remote sync off, they're empty"
      (mt/with-temporary-setting-values [remote-sync-url nil]
        (is (= {} (stats/remote-sync-stats)))))))
