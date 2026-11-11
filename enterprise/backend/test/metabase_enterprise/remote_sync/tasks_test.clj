(ns metabase-enterprise.remote-sync.tasks-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.tasks :as tasks]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk] (mt/with-additional-premium-features #{:remote-sync} (thunk))))

(defmacro ^:private with-no-tasks
  "Runs `body` with no RemoteSyncTask, restoring the remote sync branch setting afterwards."
  [& body]
  `(mt/with-model-cleanup [:model/RemoteSyncTask]
     (mt/with-temporary-setting-values [~'remote-sync-branch "main"]
       (t2/delete! :model/RemoteSyncTask)
       ~@body)))

(deftest successful-task-test
  (with-no-tasks
    (let [task (tasks/run-now! {:type "import" :branch "feature" :user-id (mt/user->id :crowberto)}
                               (fn [_report] {:status :success :version "abc123" :outcome {:kind "pulled" :count 2}}))]
      (testing "a successful task records the version it synced, and syncs its branch"
        (is (remote-sync.task/successful? (t2/select-one :model/RemoteSyncTask :id (:id task))))
        (is (= "abc123" (tasks/base-version)))
        (is (= "feature" (setting/get :remote-sync-branch)))
        (is (= {:kind "pulled" :count 2 :branch "feature"}
               (t2/select-one-fn :outcome :model/RemoteSyncTask :id (:id task))))))))

(deftest failed-task-test
  (with-no-tasks
    (tasks/run-now! {:type "import" :branch "main"} (fn [_report] {:status :success :version "v1"}))
    (let [task (tasks/run-now! {:type "export" :branch "main"}
                               (fn [_report] (throw (ex-info "The repository has no branch main." {}))))
          crashed (tasks/run-now! {:type "export" :branch "main"}
                                  (fn [_report] (throw (NullPointerException. "internal detail"))))]
      (testing "a failed task records why it failed for people"
        (is (remote-sync.task/failed? (t2/select-one :model/RemoteSyncTask :id (:id task))))
        (is (= "The repository has no branch main."
               (t2/select-one-fn :error_message :model/RemoteSyncTask :id (:id task)))))
      (testing "an unexpected error records a generic message, not its internals"
        (is (= "The sync failed because of an unexpected error. Check the server logs."
               (t2/select-one-fn :error_message :model/RemoteSyncTask :id (:id crashed)))))
      (testing "and does not change the version last synced"
        (is (= "v1" (tasks/base-version)))))))

(deftest conflict-task-test
  (with-no-tasks
    (let [task (tasks/run-now! {:type "import" :branch "main"}
                               (fn [_report] {:status :conflict :conflicts ["A card"]}))]
      (testing "a task a conflict stops records what collided"
        (is (remote-sync.task/conflict? (t2/select-one :model/RemoteSyncTask :id (:id task))))
        (is (= ["A card"] (t2/select-one-fn :conflicts :model/RemoteSyncTask :id (:id task))))))))

(deftest single-running-task-test
  (with-no-tasks
    (let [started (promise)
          finish  (promise)
          task    (tasks/start! {:type "export" :branch "main"}
                                (fn [_report] (deliver started true) @finish {:status :success :version "v1"}))]
      (try
        @started
        (testing "no task starts while another one runs"
          (is (some? task))
          (is (nil? (tasks/run-now! {:type "import" :branch "main"} (fn [_report] {:status :success})))))
        (finally
          (deliver finish true))))))

(deftest cancelled-task-test
  (with-no-tasks
    (tasks/run-now! {:type "import" :branch "main"} (fn [_report] {:status :success :version "v1"}))
    (testing "a task asked to stop stops at its next progress report, before it changes anything"
      (let [task (tasks/run-now! {:type "import" :branch "main"}
                                 (fn [report]
                                   (remote-sync.task/cancel-sync-task! (:id (remote-sync.task/current-task)))
                                   (report 0.5)
                                   {:status :success :version "v2"}))]
        (is (remote-sync.task/cancelled? (t2/select-one :model/RemoteSyncTask :id (:id task))))
        (is (some? (t2/select-one-fn :ended_at :model/RemoteSyncTask :id (:id task))))
        (is (= "v1" (tasks/base-version)))))
    (testing "a task asked to stop after its last progress report records what it synced"
      (let [task (tasks/run-now! {:type "import" :branch "main"}
                                 (fn [_report]
                                   (remote-sync.task/cancel-sync-task! (:id (remote-sync.task/current-task)))
                                   {:status :success :version "v3"}))]
        (is (remote-sync.task/successful? (t2/select-one :model/RemoteSyncTask :id (:id task))))
        (is (= "v3" (tasks/base-version)))))))

(deftest cleanup-keeps-last-synced-task-test
  (with-no-tasks
    (let [old-sync (tasks/run-now! {:type "import" :branch "main"} (fn [_report] {:status :success :version "v1"}))
          failed   (tasks/run-now! {:type "export" :branch "main"} (fn [_report] {:status :error :message "Failed"}))]
      (t2/update! :model/RemoteSyncTask :id [:in [(:id old-sync) (:id failed)]] {:started_at #t "2020-01-01T00:00Z"})
      (testing "cleanup deletes old tasks but the one of the last sync"
        (remote-sync.db/delete-tasks-started-before! #t "2021-01-01T00:00Z" (:id (remote-sync.db/last-synced-task)))
        (is (t2/exists? :model/RemoteSyncTask :id (:id old-sync)))
        (is (not (t2/exists? :model/RemoteSyncTask :id (:id failed))))
        (is (= "v1" (tasks/base-version)))))))
