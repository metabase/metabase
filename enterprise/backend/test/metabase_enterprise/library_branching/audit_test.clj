(ns metabase-enterprise.library-branching.audit-test
  "The audit log of the operations: one entry for each push, pull, merge-branch, deploy, branch create and branch
  switch whose task succeeded, after its task, with the user and the branch. The operations commit their rows and
  change the one base row and the task rows of the app DB, so these tests are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   ;; loads the settings of remote sync, which library branching reuses
   [metabase-enterprise.core.init]
   [metabase-enterprise.library-branching.audit :as audit]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.push-test-util :as ptu]
   [metabase-enterprise.library-branching.repository-test-util :as rtu :refer [with-remote with-settings]]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(deftest details-test
  (testing "the branch, the commit as the version, and the kind of task; no auto flag for a task that a person started"
    (is (= {:task_type "pull" :branch "main" :version "h"}
           (audit/details "pull" {:kind "pulled" :branch "main" :commit "h" :count 1 :trashed 0} false))))
  (testing "the branch that a merge or a new branch came from"
    (is (= {:task_type "merge-branch" :branch "main" :from "dev" :version "c"}
           (audit/details "merge-branch" {:kind "merged" :branch "main" :from "dev" :commit "c"} false))))
  (testing "auto for a task that the schedule started"
    (is (= {:task_type "deploy" :branch "main" :version "h" :auto true}
           (audit/details "deploy" {:kind "deployed" :branch "main" :commit "h"} true)))))

(deftest topics-test
  (testing "each operation has the topic of the matching operation of remote sync"
    (is (= {"push"          :event/remote-sync-export
            "pull"          :event/remote-sync-import
            "branch-switch" :event/remote-sync-import
            "deploy"        :event/remote-sync-import
            "branch-create" :event/remote-sync-create-branch
            "merge-branch"  :event/remote-sync-merge-branch}
           audit/topics)))
  (testing "a push to a new branch is the stash of remote sync"
    (is (= :event/remote-sync-stash (audit/topic "push" {:new-branch? true}))))
  (testing "a save of the settings has no entry"
    (is (nil? (audit/topic "settings" {})))))

(defn- newest-entry-id []
  (or (t2/select-one-fn :id :model/AuditLog {:order-by [[:id :desc]]}) 0))

(defn- entries-after
  "The audit-log entries of library branching tasks after the entry `id`, oldest first."
  [id]
  (mapv #(select-keys % [:topic :user_id :model :model_id :details])
        (t2/select :model/AuditLog {:where    [:and [:> :id id] [:= :model "LibraryBranchingTask"]]
                                    :order-by [[:id :asc]]})))

(defn- entry [topic user-id task-id details]
  {:topic topic :user_id user-id :model "LibraryBranchingTask" :model_id task-id :details details})

(defn- commit-of [task]
  (get-in (tasks/task (:id task)) [:outcome :commit]))

(deftest each-operation-records-one-entry-test
  (testing (str "each operation whose task succeeds records one entry, after its task; app DB " (mdb/db-type))
    (mt/with-additional-premium-features #{:audit-app}
      (with-remote [repo url]
        (with-settings {:remote-sync-url url :remote-sync-branch "main"}
          (rtu/with-synchronous-tasks
            (rtu/do-with-library-metric!
             (fn [metric]
               (let [user (mt/user->id :crowberto)
                     step (fn [start! topic details-of]
                            (let [before (newest-entry-id)
                                  task   (start!)]
                              (is (= "successful" (:status (tasks/task (:id task)))))
                              (is (= [(entry topic user (:id task) (details-of task))] (entries-after before)))
                              task))
                     c1   (commit-of
                           (testing "a push: the export topic, with the user and the branch, and no auto flag"
                             (step #(operations/start-push! user "First push") :remote-sync-export
                                   (fn [t] {:task_type "push" :branch "main" :version (commit-of t)}))))]
                 (testing "a pull: the import topic"
                   (step #(operations/start-pull! user) :remote-sync-import
                         (constantly {:task_type "pull" :branch "main" :version c1})))
                 (testing "a branch create: the create-branch topic, with the branch that it came from"
                   (step #(operations/start-create-branch! user "feature" "main") :remote-sync-create-branch
                         (constantly {:task_type "branch-create" :branch "feature" :from "main" :version c1})))
                 (t2/update! :model/Card (:id metric) {:name "Stashed"})
                 (let [s1 (commit-of
                           (testing "a push to a new branch: the stash topic"
                             (step #(operations/start-push! user nil "stash") :remote-sync-stash
                                   (fn [t] {:task_type "push" :branch "stash" :version (commit-of t)}))))]
                   (testing "a switch: the import topic, with the new branch"
                     (step #(operations/start-switch! user "main") :remote-sync-import
                           (constantly {:task_type "branch-switch" :branch "main" :version c1})))
                   (testing "a merge-branch: the merge-branch topic, with the branch that it came from"
                     (let [merged (step #(operations/start-merge-branch! user nil "stash") :remote-sync-merge-branch
                                        (fn [t] {:task_type "merge-branch" :branch "main" :from "stash"
                                                 :version (commit-of t)}))]
                       (is (= [c1 s1] (ptu/commit-parents repo (commit-of merged))))))
                   (testing "a deploy that a person starts: the import topic, with no auto flag"
                     (mt/with-temporary-setting-values [remote-sync-type :read-only]
                       (step #(operations/start-deploy! user) :remote-sync-import
                             (fn [t] {:task_type "deploy" :branch "main" :version (commit-of t)}))))
                   (testing "a task that fails records no entry"
                     (let [before (newest-entry-id)
                           task   (operations/start-switch! user "nope")]
                       (is (= "failed" (:status (tasks/task (:id task)))))
                       (is (= [] (entries-after before)))))))))))))))

(deftest a-failure-of-the-audit-log-leaves-the-task-successful-test
  (testing "the audit log is down: the task that it records stays successful"
    (mt/with-additional-premium-features #{:audit-app}
      (with-remote [_repo url]
        (with-settings {:remote-sync-url url :remote-sync-branch "main"}
          (rtu/with-synchronous-tasks
            (rtu/do-with-library-metric!
             (fn [_metric]
               (let [before (newest-entry-id)
                     task   (mt/with-dynamic-fn-redefs [audit/record! (fn [& _] (throw (ex-info "The audit log is down" {})))]
                              (operations/start-push! (mt/user->id :crowberto) "First push"))]
                 (is (=? {:status "successful" :outcome {:kind "pushed"}} (tasks/task (:id task))))
                 (is (= [] (entries-after before))))))))))))
