(ns metabase-enterprise.library-branching.deploy-mutation-test
  "Mutations of the rules of the deploy. Each mutation removes or weakens one rule, as a mutation of the formal model
  does, and a test must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.deploy-test :as deploy-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.operations-test :as operations-test]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes or weakens one rule of the deploy."
  [{:name   :trustci
    :doc    "The deploy does not check the head against the environment of the instance (the TLA+ mutation trustci): a
            head that names a table that the instance does not have is applied."
    :target `deploy/check-head
    :edits  [[:replace '(semantic/validate r env) []]]
    :tests  [#'deploy-test/deploy-validates-the-head-against-its-own-environment-test]}
   {:name   :deploy-novalidate
    :doc    "The deploy does not check the head at the structural level: an ill-formed text merge is applied."
    :target `deploy/check-head
    :edits  [[:replace '(pull/check-commit store codecs h) '(pull/decode-commit store codecs h)]]
    :tests  [#'deploy-test/deploy-refuses-an-ill-formed-head-test]}
   {:name   :prodbatched
    :doc    "The deploy applies a part of the plan (the TLA+ mutation prodbatched): the instance shows a mix of two
            commits."
    :target `deploy/apply-head!
    ;; match 0 is the binding, match 1 the result of a success; match 2 is the plan that the apply gets
    :edits  [[:replace 'steps '(vec (take 1 steps)) {:nth 2}]]
    :tests  [#'deploy-test/deploy-applies-the-head-in-full-test]}
   {:name   :drift-overwrite
    :doc    "The deploy does not check for drift (the TLA+ mutation drift-overwrite): it writes over a change that no
            commit holds."
    :target `deploy/apply-head!
    :edits  [[:replace '(drift inst store codecs b l r) []]]
    :tests  [#'deploy-test/deploy-does-not-write-over-drift-test]}
   {:name   :first-deploy-replaces
    :doc    "With no base, the deploy finds no drift: the first deploy trashes or writes over local items that no commit
            holds."
    :target `deploy/drift
    :edits  [[:replace '(filter (fn [id] (not= (get l id) (get r id))) (keys l)) ()]]
    :tests  [#'deploy-test/first-deploy-with-no-base-test]}
   {:name   :digests-are-the-truth
    :doc    "A difference of digests is drift, also when the content of the base commit is equal (digests of another
            release): the deploy stops for no reason."
    :target `deploy/drift
    :edits  [[:replace '(changed-ids bs l) 'by-digest]]
    :tests  [#'deploy-test/drift-from-the-base-digests-test]}
   {:name   :unreadable-base-is-no-drift
    :doc    "When the base commit cannot be read, the deploy finds no drift: it writes over a change."
    :target `deploy/drift
    :edits  [[:replace '(or by-digest (sort snapshot/compare-identities (keys l))) []]]
    :tests  [#'deploy-test/drift-from-the-base-digests-test]}
   {:name   :no-retry
    :doc    "The deploy stops at the first stale precondition, and does not read the instance again."
    :target `deploy/apply-head!
    :edits  [[:replace '(and (:stale result) (< attempt retries)) false]]
    :tests  [#'deploy-test/save-during-the-deploy-is-not-lost-test]}
   {:name   :digests-of-local
    :doc    "The base cache gets the digests of the local snapshot before the deploy, not of the head."
    :target `deploy/apply-head!
    :edits  [[:replace '(writer/item-digests codecs r) '(writer/item-digests codecs l)]]
    :tests  [#'deploy-test/deploy-applies-the-head-in-full-test]}
   {:name   :deploy-ends-its-task-after-the-apply
    :doc    "The task of a deploy ends after the apply transaction: a cancel between the commit and the end of the task
            says cancelled, although the deploy applied."
    :target `operations/deploy-task!
    :edits  [[:replace '(end-in-apply id (partial deploy-task-result branch)) nil]]
    :tests  [#'operations-test/apply-ends-its-task-test]}])

(deftest deploy-mutations-test
  (mut/check mutations {:timeout-ms 180000}))
