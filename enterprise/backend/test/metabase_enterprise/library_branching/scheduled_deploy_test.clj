(ns metabase-enterprise.library-branching.scheduled-deploy-test
  "The scheduled deploy of a consumption instance: the job, and each tick against a remote on disk and the app DB
  instance. The ticks start deploy tasks that commit their rows and change the one base row and the task rows of the
  app DB, so these tests are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   ;; loads the settings of remote sync, which library branching reuses
   [metabase-enterprise.core.init]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.repository-test-util :as rtu :refer [with-remote with-settings]]
   [metabase-enterprise.library-branching.scheduled-deploy :as scheduled-deploy]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.app-db.core :as mdb]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (org.quartz SimpleTrigger TriggerKey)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------------ Reports -----------------------------------------------------

(deftest report-key-test
  (testing "a red head is reported as the pair of the head and its findings"
    (is (= ["h" [{:rule :env-resolves :id "a"}]]
           (scheduled-deploy/report-key {:result :invalid :head "h" :findings [{:rule :env-resolves :id "a"}]}))))
  (testing "a missing branch is reported as such"
    (is (= [nil :no-branch] (scheduled-deploy/report-key {:result :no-branch}))))
  (testing "every other result is no report"
    (doseq [result [:deployed :up-to-date :drift :stale :rewritten :refused :base-moved :fenced :disabled]]
      (is (nil? (scheduled-deploy/report-key {:result result :head "h"}))))))

;;; -------------------------------------------------------- Job -------------------------------------------------------

(def ^:private trigger-key (TriggerKey. "metabase.task.library-branching.scheduled-deploy.trigger"))

(deftest job-runs-at-the-rate-of-the-setting-test
  (testing "the job runs every remote-sync-auto-import-rate minutes"
    (mt/with-temp-scheduler!
      (mt/with-temporary-setting-values [remote-sync-auto-import-rate 7]
        (task/init! ::scheduled-deploy/LibraryBranchingScheduledDeploy)
        (let [trigger (.getTrigger (task/scheduler) trigger-key)]
          (is (instance? SimpleTrigger trigger))
          (is (= (* 7 60 1000) (.getRepeatInterval ^SimpleTrigger trigger)))))))
  (testing "a rate that is not positive schedules no job"
    (mt/with-temp-scheduler!
      (mt/with-temporary-setting-values [remote-sync-auto-import-rate 0]
        (task/init! ::scheduled-deploy/LibraryBranchingScheduledDeploy)
        (is (nil? (.getTrigger (task/scheduler) trigger-key)))))))

(deftest a-failed-tick-does-not-throw-test
  (testing "the job logs a tick that throws (a repository that cannot be read), and goes on"
    (mt/with-temporary-setting-values [library-branching-enabled true]
      (with-settings {:remote-sync-url         "file:///no/such/library-branching/repository"
                      :remote-sync-branch      "main"
                      :remote-sync-type        :read-only
                      :remote-sync-auto-import true}
        (is (=? {:result :error :message string?} (scheduled-deploy/run-tick!)))))))

;;; ------------------------------------------------------- Ticks ------------------------------------------------------

(defn- task-ids []
  (set (map :id (t2/query {:select [:id] :from [:library_branching_task]}))))

(defn- newest-entry-id []
  (or (t2/select-one-fn :id :model/AuditLog {:order-by [[:id :desc]]}) 0))

(defn- entries-after
  "The audit-log entries of library branching tasks after the entry `id`, oldest first."
  [id]
  (mapv #(select-keys % [:topic :user_id :model_id :details])
        (t2/select :model/AuditLog {:where    [:and [:> :id id] [:= :model "LibraryBranchingTask"]]
                                    :order-by [[:id :asc]]})))

(defn- remote-snapshot
  [commit]
  (repository/do-with-store (fn [s]
                              (store/head s "main")
                              (ptu/commit-snapshot s commit))))

(defn- forget-report! []
  (reset! @#'scheduled-deploy/last-report nil))

(defn- tick-records-nothing!
  "Runs one tick, checks that it starts no task and writes no audit-log entry, and returns its result."
  []
  (let [ids    (task-ids)
        before (newest-entry-id)
        result (scheduled-deploy/tick!)]
    (is (= ids (task-ids)) "no task row")
    (is (= [] (entries-after before)) "no audit-log entry")
    result))

(defn- tick-starts-a-deploy!
  "Runs one tick, checks that it starts one deploy task, and returns that task as it ended."
  []
  (let [ids    (task-ids)
        result (scheduled-deploy/tick!)]
    (is (=? {:result :started :task {:task_type "deploy" :initiated_by nil}} result))
    (is (= 1 (count (remove ids (task-ids)))) "one task row")
    (tasks/task (get-in result [:task :id]))))

(deftest scheduled-deploy-ticks-test
  (testing (str "each tick deploys a new head, reports a red head once, and records nothing while a task runs; app DB "
                (mdb/db-type))
    (mt/with-premium-features #{:audit-app}
      (with-remote [repo url]
        (with-settings {:remote-sync-url url :remote-sync-branch "main"}
          (rtu/with-synchronous-tasks
            (rtu/do-with-library-metric!
             (fn [metric]
               (forget-report!)
               (let [eid       (:entity_id metric)
                     metrics   (t2/select-one-fn :entity_id :model/Collection (:collection_id metric))
                     c1        (get-in (tasks/task (:id (operations/start-push! nil "From a sandbox"))) [:outcome :commit])
                     base      (remote-snapshot c1)
                     with-gone (fn [s id table]
                                 (assoc s id (ptu/item id :metric "Gone" metrics
                                                       {:display "scalar"
                                                        :query   (ptu/count-query ["test-data" "PUBLIC" table])})))]
                 (testing "a creation instance does not deploy"
                   (is (= {:result :off} (tick-records-nothing!))))
                 (with-settings {:remote-sync-url url :remote-sync-branch "main" :remote-sync-type :read-only}
                   (testing "a consumption instance with remote-sync-auto-import off does not deploy"
                     (is (= {:result :off} (tick-records-nothing!)))))
                 (with-settings {:remote-sync-url         url
                                 :remote-sync-branch      "main"
                                 :remote-sync-type        :read-only
                                 :remote-sync-auto-import true}
                   (testing "the head is the base: the tick skips"
                     (is (= {:result :up-to-date :head c1} (tick-records-nothing!))))
                   (let [h1 (pltu/commit-snapshot! repo "main" [c1] (ptu/renamed base eid "After"))]
                     (testing "a tick while a task runs records nothing"
                       (let [running (tasks/start! "pull" nil)]
                         (is (= {:result :task-running} (tick-records-nothing!)))
                         (tasks/cancel! (:id running))))
                     (testing "a new head: the tick deploys it, and the audit log has one entry with no user, auto true
                              and the branch"
                       (let [before (newest-entry-id)
                             task   (tick-starts-a-deploy!)]
                         (is (=? {:status "successful" :outcome {:kind "deployed" :commit h1}} task))
                         (is (= [{:topic    :remote-sync-import
                                  :user_id  nil
                                  :model_id (:id task)
                                  :details  {:task_type "deploy" :branch "main" :version h1 :auto true}}]
                                (entries-after before)))
                         (is (= "After" (t2/select-one-fn :name :model/Card (:id metric))))
                         (is (= h1 (instance/base (operations/instance))))))
                     (testing "the next tick at the same head records nothing"
                       (is (= {:result :up-to-date :head h1} (tick-records-nothing!))))
                     (let [red (pltu/commit-snapshot! repo "main" [h1] (with-gone base "lbScheduledGone000001" "NO_SUCH_TABLE"))]
                       (testing "a red head is reported once: a failed deploy task, and no task at the next tick"
                         (is (=? {:status        "failed"
                                  :error_message "The head of branch main breaks the rules env-resolves, so nothing was deployed."}
                                 (tick-starts-a-deploy!)))
                         (is (=? {:result :reported :head red} (tick-records-nothing!)))
                         (is (=? {:result :reported :head red} (tick-records-nothing!))))
                       (testing "a change of the environment changes the findings, so the head is reported again"
                         (mt/with-dynamic-fn-redefs [operations/instance-env (constantly {})]
                           (is (=? {:status "failed"} (tick-starts-a-deploy!)))
                           (is (=? {:result :reported :head red} (tick-records-nothing!)))))
                       (let [red-2 (pltu/commit-snapshot! repo "main" [red] (with-gone base "lbScheduledGone000001" "NO_SUCH_TABLE"))]
                         (testing "another red head is reported"
                           (is (=? {:status "failed"} (tick-starts-a-deploy!)))
                           (is (=? {:result :reported :head red-2} (tick-records-nothing!))))
                         (testing "after a green head, the same red head is reported again"
                           (let [h2 (pltu/commit-snapshot! repo "main" [red-2] (ptu/renamed base eid "Fixed"))]
                             (is (=? {:status "successful" :outcome {:kind "deployed" :commit h2}} (tick-starts-a-deploy!)))
                             (pltu/reset-branch! repo "main" red-2)
                             (is (=? {:status "failed"} (tick-starts-a-deploy!)))
                             (is (=? {:result :reported :head red-2} (tick-records-nothing!)))
                             (is (= "Fixed" (t2/select-one-fn :name :model/Card (:id metric))))
                             (is (= h2 (instance/base (operations/instance))))))))))
                 (with-settings {:remote-sync-url         url
                                 :remote-sync-branch      "gone"
                                 :remote-sync-type        :read-only
                                 :remote-sync-auto-import true}
                   (testing "a missing branch is reported once"
                     (is (=? {:status "failed" :error_message "The repository has no branch gone."} (tick-starts-a-deploy!)))
                     (is (= {:result :reported :head nil} (tick-records-nothing!))))))))))))))
