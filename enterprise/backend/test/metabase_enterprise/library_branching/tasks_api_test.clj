(ns metabase-enterprise.library-branching.tasks-api-test
  "The current-task routes. The task functions commit their rows, so these tests are not parallel."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test-util :as tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(defn- current-task [user status]
  (mt/user-http-request user :get status "ee/library-branching/current-task"))

(defn- cancel [user status]
  (mt/user-http-request user :post status "ee/library-branching/current-task/cancel"))

(defmacro ^:private with-tasks [& body]
  `(mt/with-additional-premium-features #{:remote-sync}
     (tu/with-no-tasks ~@body)))

(deftest current-task-is-for-superusers-test
  (with-tasks
    (tasks/start! "pull" nil)
    (is (= "You don't have permissions to do that." (current-task :rasta 403)))
    (is (= "You don't have permissions to do that." (cancel :rasta 403)))
    (testing "a refused cancel leaves the task running"
      (is (= "running" (:status (tasks/newest-task)))))))

(deftest current-task-needs-the-feature-test
  (mt/with-premium-features #{}
    (current-task :crowberto 402)))

(deftest current-task-with-no-task-test
  (with-tasks
    (testing "no task: no content"
      (is (nil? (current-task :crowberto 204))))))

(deftest current-task-of-a-running-task-test
  (with-tasks
    (let [task (tasks/start! "push" (mt/user->id :crowberto))]
      (is (=? {:id                (:id task)
               :task_type         "push"
               :status            "running"
               :started_at        some?
               :ended_at          nil
               :initiated_by_user {:id (mt/user->id :crowberto) :first_name "Crowberto" :last_name "Corv"
                                   :email "crowberto@metabase.com"}}
              (current-task :crowberto 200)))
      (testing "the user has only the four keys"
        (is (= #{:id :first_name :last_name :email}
               (set (keys (:initiated_by_user (current-task :crowberto 200)))))))
      (tasks/cancel! (:id task)))))

(deftest current-task-of-ended-tasks-test
  (with-tasks
    (testing "a successful pull, with its outcome"
      (let [task (tasks/start! "pull" nil)]
        (tasks/run-task! (:id task) (fn [_] {:outcome {:kind "pulled" :count 3 :branch "feature"}}))
        (is (=? {:status            "successful"
                 :ended_at          string?
                 :outcome           {:kind "pulled" :count 3 :branch "feature"}
                 :initiated_by_user nil}
                (current-task :crowberto 200)))
        (is (contains? (current-task :crowberto 200) :initiated_by_user))))
    (testing "a failed task, with its error"
      (let [task (tasks/start! "push" nil)]
        (tasks/run-task! (:id task) (fn [_] {:error "The remote moved"}))
        (is (=? {:status "failed" :error_message "The remote moved" :ended_at string?}
                (current-task :crowberto 200)))))
    (testing "a cancelled task"
      (let [task (tasks/start! "push" nil)]
        (tasks/cancel! (:id task))
        (is (=? {:status "cancelled" :error_message "Task cancelled"}
                (current-task :crowberto 200)))))))

(deftest current-task-closes-a-stale-task-test
  (with-tasks
    (testing "an open task whose worker stopped is ended as interrupted; a second request gives the same task"
      (let [task (tasks/start! "pull" nil)]
        (tu/pause! (:id task))
        (let [first-answer (current-task :crowberto 200)]
          (is (=? {:id            (:id task)
                   :status        "interrupted"
                   :ended_at      string?
                   :error_message "Sync was interrupted: the server stopped responding for 5 minutes (it may have restarted)"}
                  first-answer))
          (is (= first-answer (current-task :crowberto 200))))))
    (testing "an open task with a fresh heartbeat stays running"
      (let [task (tasks/start! "pull" nil)]
        (is (= "running" (:status (current-task :crowberto 200))))
        (tasks/cancel! (:id task))))))

(deftest cancel-a-running-task-test
  (with-tasks
    (let [task (tasks/start! "pull" (mt/user->id :rasta))]
      (is (=? {:id                (:id task)
               :status            "cancelled"
               :error_message     "Task cancelled"
               :ended_at          string?
               :initiated_by_user {:id (mt/user->id :rasta) :first_name "Rasta" :last_name "Toucan"
                                   :email "rasta@metabase.com"}}
              (cancel :crowberto 200)))
      (is (= "cancelled" (:status (tasks/task (:id task))))))))

(deftest cancel-with-no-running-task-test
  (with-tasks
    (testing "no task"
      (is (= "No active task to cancel" (cancel :crowberto 400))))
    (testing "the newest task is successful"
      (let [task (tasks/start! "pull" nil)]
        (tasks/run-task! (:id task) (fn [_] {:outcome {:kind "pulled" :count 0 :branch "main"}}))
        (is (= "No active task to cancel" (cancel :crowberto 400)))
        (is (= "successful" (:status (tasks/task (:id task)))))))
    (testing "the newest task failed"
      (let [task (tasks/start! "pull" nil)]
        (tasks/run-task! (:id task) (fn [_] {:error "no"}))
        (is (= "No active task to cancel" (cancel :crowberto 400)))))))

(deftest cancel-a-committing-push-test
  (with-tasks
    (testing "a push past its commit point cannot be cancelled"
      (let [task (tasks/start! "push" nil)]
        (tasks/mark-committing! (:id task))
        (is (= "The task is past its commit point, so it can no longer be cancelled." (cancel :crowberto 400)))
        (is (= "committing" (:status (tasks/task (:id task)))))
        (tasks/fail! (:id task) "end of the test")))))
