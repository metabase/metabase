(ns metabase-enterprise.library-branching.scheduled-deploy-mutation-test
  "Mutations of the rules of the scheduled deploy and of the audit log. Each mutation removes or weakens one rule, and
  a test must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.audit :as audit]
   [metabase-enterprise.library-branching.audit-test :as audit-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.scheduled-deploy :as scheduled-deploy]
   [metabase-enterprise.library-branching.scheduled-deploy-test :as scheduled-deploy-test]
   [metabase-enterprise.remote-sync.task.import :as remote-sync.import]
   [metabase-enterprise.remote-sync.task.import-test :as remote-sync.import-test]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes or weakens one rule of the scheduled deploy or of the audit log."
  [{:name   :tick-ignores-a-live-task
    :doc    "A tick does not check for a running task: it tries to start a deploy while a task runs."
    :target `scheduled-deploy/tick!
    :edits  [[:replace '(tasks/live-task) nil]]
    :tests  [#'scheduled-deploy-test/scheduled-deploy-ticks-test]}
   {:name   :deploy-at-the-base
    :doc    "A tick does not skip a head that is the base: each tick starts a deploy task and writes an audit-log entry."
    :target `scheduled-deploy/head-report
    :edits  [[:replace '(= h (instance/base inst)) false]]
    :tests  [#'scheduled-deploy-test/scheduled-deploy-ticks-test]}
   {:name   :report-every-tick
    :doc    "A red head is reported on every tick (the scheduled pull of remote sync before its fix)."
    :target `scheduled-deploy/tick!
    :edits  [[:replace '(and key (= key @last-report)) false]]
    :tests  [#'scheduled-deploy-test/scheduled-deploy-ticks-test]}
   {:name   :report-by-head
    :doc    "The last report is compared by its head alone: a change of the environment that changes the findings of a
            red head is not reported."
    :target `scheduled-deploy/tick!
    :edits  [[:replace '(= key @last-report) '(= (first key) (first @last-report))]]
    :tests  [#'scheduled-deploy-test/scheduled-deploy-ticks-test]}
   {:name   :report-is-never-cleared
    :doc    "A deploy that is not red keeps the last report: a red head that comes back after a green head is not
            reported."
    :target `scheduled-deploy/record-report!
    :edits  [[:replace '(reset! last-report (report-key result)) '(some->> (report-key result) (reset! last-report))]]
    :tests  [#'scheduled-deploy-test/scheduled-deploy-ticks-test]}
   {:name   :missing-branch-every-tick
    :doc    "A missing branch is not a report: each tick records one more failed deploy task."
    :target `scheduled-deploy/report-key
    :edits  [[:replace '[nil :no-branch] nil]]
    :tests  [#'scheduled-deploy-test/report-key-test
             #'scheduled-deploy-test/scheduled-deploy-ticks-test]}
   {:name   :no-auto-flag
    :doc    "The entry of a task that the schedule started has no auto flag."
    :target `audit/details
    :edits  [[:replace '(assoc :auto true) '(dissoc :auto)]]
    :tests  [#'audit-test/details-test
             #'scheduled-deploy-test/scheduled-deploy-ticks-test]}
   {:name   :entry-without-user
    :doc    "The entry does not name the user who started the task."
    :target `audit/record!
    :edits  [[:replace 'user-id nil {:nth 1}]]
    :tests  [#'audit-test/each-operation-records-one-entry-test]}
   {:name   :stash-is-an-export
    :doc    "A push to a new branch has the topic of a push."
    :target `audit/topic
    :edits  [[:replace :event/remote-sync-stash '(get topics kind)]]
    :tests  [#'audit-test/topics-test
             #'audit-test/each-operation-records-one-entry-test]}
   {:name   :both-modules-deploy
    :doc    "The auto-import of remote sync runs while library branching is on: two modules deploy one instance."
    :target `remote-sync.import/auto-import!
    :edits  [[:replace '(not (library-branching.gates/governs?)) true]]
    :tests  [#'remote-sync.import-test/auto-import-does-not-run-while-library-branching-is-on-test]}])

(deftest scheduled-deploy-mutations-test
  (mut/check mutations {:timeout-ms 180000}))
