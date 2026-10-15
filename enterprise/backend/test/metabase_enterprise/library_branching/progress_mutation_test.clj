(ns metabase-enterprise.library-branching.progress-mutation-test
  "Mutations of the progress reports of the operations. Each mutation drops or weakens one report, and a test of the
  progress must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.discard :as discard]
   [metabase-enterprise.library-branching.merge-branch :as merge-branch]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.operations-test :as operations-test]
   [metabase-enterprise.library-branching.progress-test :as progress-test]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private phases-test #'progress-test/operations-report-their-phases-test)

(def mutations
  "Each mutation drops or weakens one progress report of an operation."
  [{:name   :pull-skips-plan
    :doc    "A pull does not report the start of its plan, so a pull that waits there shows no progress."
    :target `pull/apply-merge!
    :edits  [[:replace '(on-phase :plan) nil]]
    :tests  [phases-test #'progress-test/pull-progress-shows-on-current-task-test]}
   {:name   :pull-skips-apply
    :doc    "A pull does not report the start of its apply."
    :target `pull/apply-merge!
    :edits  [[:replace '(on-phase :apply) nil]]
    :tests  [phases-test]}
   {:name   :push-skips-commit
    :doc    "A push does not report the start of its commit."
    :target `push/commit!
    :edits  [[:replace '(on-phase :commit) nil]]
    :tests  [phases-test]}
   {:name   :merge-branch-skips-apply
    :doc    "A merge-branch does not report the start of its apply."
    :target `merge-branch/merge-branch!
    :edits  [[:replace '(on-phase :apply) nil]]
    :tests  [phases-test]}
   {:name   :merge-branch-skips-the-phases-after-the-plan
    :doc    "A merge-branch reports no phase after the start of its plan, so a cancel during the plan does not stop it,
            and the branch moves under a cancelled task."
    :target `merge-branch/merge-branch!
    :edits  [[:replace '(on-phase :apply) nil]
             [:replace '(on-phase :commit) nil]]
    :tests  [#'progress-test/cancel-between-phases-stops-a-merge-branch-test]}
   {:name   :deploy-skips-apply
    :doc    "A deploy does not report the start of its apply."
    :target `deploy/apply-head!
    :edits  [[:replace '(on-phase :apply) nil]]
    :tests  [phases-test]}
   {:name   :discard-skips-plan
    :doc    "A discard does not report the start of its plan."
    :target `discard/apply-base!
    :edits  [[:replace '(on-phase :plan) nil]]
    :tests  [phases-test]}
   {:name   :checkpoints-are-throttled
    :doc    "A phase checkpoint is not forced, so the throttle drops the reports after the first one."
    :target `tasks/phase-checkpoints
    :edits  [[:replace '{:force? true} nil]]
    :tests  [phases-test]}
   {:name   :stopped-operation-throws
    :doc    "A worker whose report finds its task ended throws, and does not give the result of a fenced operation."
    :target `operations/reporting
    :edits  [[:replace '{:result :fenced :reason {:fenced (:status (ex-data e))}} '(throw e)]]
    :tests  [#'operations-test/workers-on-the-app-db-test]}])

(deftest progress-mutations-test
  (mut/check mutations {:timeout-ms 120000}))
