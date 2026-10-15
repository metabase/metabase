(ns metabase-enterprise.library-branching.tasks-mutation-test
  "Mutations of the rules of the task lifecycle. Each mutation removes or weakens one rule, as the mutations of the
  TaskLease model do (nofence, nocas, nocommitpoint), and a test of the tasks must fail. Each mutation runs only the
  tests of its rule and the generative test of the model."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-property-test :as property]
   [metabase-enterprise.library-branching.tasks-test :as tasks-test]))

(set! *warn-on-reflection* true)

(defn- tests [& vars] (vec vars))

(def mutations
  "Each mutation removes or weakens one rule of the task lifecycle."
  [{:name   :nofence
    :doc    "The apply transaction does not check that its task is running (TaskLease nofence): a cancel, then the
            apply commits, and the task says cancelled."
    :target `tasks/commit!
    :edits  [[:replace '(fence id) nil]]
    :tests  (tests #'tasks-test/cancel-then-apply-is-fenced-test
                   #'tasks-test/superseded-pull-is-fenced-test
                   #'property/task-lease-properties-test)}
   {:name   :nocommitpoint
    :doc    "A push has no commit point: mark-committing! does not move the task, so a cancel before the remote
            compare-and-swap does not stop the push (TaskLease nocommitpoint)."
    :target `tasks/mark-committing!
    :edits  [[:replace '(= 1 (library-branching.db/update-task-row! id #{"running"} {:status "committing"
                                                                                     :last_heartbeat_at (now)}))
              true]]
    :tests  (tests #'tasks-test/cancel-before-the-commit-point-stops-the-push-test
                   #'property/task-lease-properties-test)}
   {:name   :cancel-committing
    :doc    "A cancel of a committing push is allowed: the push lands under a cancelled task."
    :target `tasks/cancel!
    :edits  [[:replace '#{"running"} 'open-statuses]]
    :tests  (tests #'tasks-test/cancel-after-the-commit-point-is-refused-test
                   #'property/task-lease-properties-test)}
   {:name   :nocas
    :doc    "The base moves with no compare-and-swap (TaskLease nocas): a stale pull moves the base back after a push
            that woke up recorded its commit."
    :target `library-branching.db/compare-and-set-base!
    :edits  [[:replace '(if expected
                                [:and (url-is url) [:= :commit_id [:auto/param expected]]]
                                [:or [:= :commit_id nil] (url-is-not url)]) true]]
    :tests  (tests #'tasks-test/stale-pull-cannot-move-the-base-back-test
                   #'property/task-lease-properties-test)}
   {:name   :commit-keeps-a-refused-apply
    :doc    "A commit whose apply refuses keeps the writes of the apply."
    :target `tasks/commit!
    :edits  [[:replace '(throw (ex-info "Rollback of a task commit" {::tasks/rollback result})) 'result]]
    :tests  (tests #'tasks-test/commit-ends-the-task-in-its-transaction-test)}
   {:name   :start-ignores-a-live-task
    :doc    "A task starts while another task runs."
    :target `tasks/start!
    :edits  [[:replace '(live-task) nil]]
    :tests  (tests #'tasks-test/second-task-is-refused-while-one-runs-test
                   #'property/task-lease-properties-test)}
   {:name   :supersede-fresh-tasks
    :doc    "Supersede ends every open task, also a task whose worker is alive."
    :target `tasks/supersede-stale!
    :edits  [[:replace '(cutoff) '(t/plus (now) (t/hours 1))]]
    :tests  (tests #'tasks-test/supersede-ends-only-stale-tasks-test)}
   {:name   :late-result-overwrites
    :doc    "A result changes a task that ended: a success after a cancel says successful."
    :target `tasks/succeed!
    :edits  [[:replace 'open-statuses '(into open-statuses ended-statuses)]]
    :tests  (tests #'tasks-test/worker-does-not-overwrite-a-cancel-test
                   #'tasks-test/cancel-then-apply-is-fenced-test)}
   {:name   :failed-after-the-commit-point
    :doc    "A push that fails after its commit point ends as failed, although it may have landed."
    :target `tasks/fail!
    :edits  [[:replace '#{"running"} 'open-statuses]]
    :tests  (tests #'tasks-test/failure-after-the-commit-point-is-an-interruption-test
                   #'property/task-lease-properties-test)}
   {:name   :progress-moves-back
    :doc    "The progress reporter writes a fraction below the last one."
    :target `tasks/progress-reporter
    :edits  [[:replace '(>= f last-f) true]]
    :tests  (tests #'tasks-test/progress-is-monotonic-and-throttled-test)}
   {:name   :progress-on-an-ended-task
    :doc    "A progress report on a cancelled task writes and goes on, so its worker does not stop."
    :target `tasks/report-progress!
    :edits  [[:replace 'open-statuses '(into open-statuses ended-statuses)]]
    :tests  (tests #'tasks-test/progress-on-an-ended-task-stops-the-worker-test)}
   {:name   :heartbeat-on-an-ended-task
    :doc    "A heartbeat writes an ended task."
    :target `tasks/heartbeat!
    :edits  [[:replace 'open-statuses '(into open-statuses ended-statuses)]]
    :tests  (tests #'tasks-test/heartbeat-keeps-a-task-live-test)}
   {:name   :no-end-after-the-worker
    :doc    "A task whose bookkeeping threw stays open after its worker."
    :target `tasks/run-task!
    :edits  [[:remove '(ensure-ended! id)]]
    :tests  (tests #'tasks-test/worker-ends-the-task-when-the-bookkeeping-throws-test)}])

(deftest task-mutations-test
  (mut/check mutations {:timeout-ms 120000}))
