(ns metabase-enterprise.library-branching.change-lists-mutation-test
  "Mutations of the rules of what the screens get: the rows of the change list, the head and the sides of the push
  preview, the conflicts and the trashed items in use of a task outcome, and the discard of the local changes. Each
  mutation removes or weakens one rule, and a test must fail."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.deploy-operations-test :as deploy-operations-test]
   [metabase-enterprise.library-branching.discard :as discard]
   [metabase-enterprise.library-branching.discard-test :as discard-test]
   [metabase-enterprise.library-branching.instance.rows :as rows]
   [metabase-enterprise.library-branching.instance.rows-test :as rows-test]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.operations-test :as operations-test]
   [metabase-enterprise.library-branching.status :as status]
   [metabase-enterprise.library-branching.status-test :as status-test]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test :as tasks-test]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def mutations
  "Each mutation removes or weakens one rule."
  [{:name   :rows-without-row-ids
    :doc    "A change names no row id."
    :target `rows/details
    :edits  [[:replace '(:id row) nil]]
    :tests  [#'rows-test/details-test #'rows-test/details-of-a-published-table-test]}
   {:name   :rows-without-collections
    :doc    "A change names no collection to group it under."
    :target `rows/details
    :edits  [[:replace '(:collection_id row) nil]]
    :tests  [#'rows-test/details-test #'rows-test/details-of-a-published-table-test]}
   {:name   :rows-without-tables
    :doc    "A change names no table."
    :target `rows/details
    :edits  [[:replace '(:table_id row) nil]]
    :tests  [#'rows-test/details-test #'rows-test/details-of-a-published-table-test]}
   {:name   :rows-with-kind-names
    :doc    "A change names its kind, not the model name of remote sync, so a question is no card."
    :target `rows/details
    :edits  [[:replace '(get model-names kind) '(some-> kind name)]]
    :tests  [#'rows-test/details-test #'rows-test/details-with-no-row-test]}
   {:name   :table-items-in-no-collection
    :doc    "A segment or a measure is not in the collection of its table."
    :target `rows/rows-of-kind
    :edits  [[:replace '(with-table-collections (entity-id-rows kind ids)) '(entity-id-rows kind ids)]]
    :tests  [#'rows-test/details-test #'rows-test/details-of-a-published-table-test]}
   {:name   :preview-without-head
    :doc    "The push preview does not name the head that it merged, so a keep-mine decision cannot name it."
    :target `status/push-preview
    :edits  [[:replace :head :no-head]]
    :tests  [#'status-test/push-preview-not-diverged-test #'status-test/push-preview-conflict-test]}
   {:name   :conflict-without-our-side
    :doc    "A conflict does not say what the instance did to the item."
    :target `status/conflict-entry
    :edits  [[:replace '(merge/side-change base ours) :updated]]
    :tests  [#'operations-test/pull-conflicts-task-result-test #'status-test/push-preview-with-a-lost-base-test]}
   {:name   :conflict-without-their-side
    :doc    "A conflict does not say what the head did to the item."
    :target `status/conflict-entry
    :edits  [[:replace '(merge/side-change base theirs) :updated]]
    :tests  [#'operations-test/pull-conflicts-task-result-test #'status-test/push-preview-with-a-lost-base-test]}
   {:name   :failed-task-without-outcome
    :doc    "A failed task keeps only its error message: the conflicts of a pull are lost."
    :target `tasks/fail!
    :edits  [[:replace '(some-> outcome json/encode) nil]]
    :tests  [#'tasks-test/worker-records-a-failure-test]}
   {:name   :pull-conflicts-as-counts
    :doc    "A pull with conflicts gives only their numbers."
    :target `operations/pull-task-result
    :edits  [[:replace '(conflicts-outcome branch head conflicts violations) nil]]
    :tests  [#'operations-test/pull-conflicts-task-result-test]}
   {:name   :switch-renames-a-failure
    :doc    "A switch gives every outcome the kind switched, also the conflicts of a failure."
    :target `operations/switch-task-result
    :edits  [[:replace '(not (:error task-result)) '(:outcome task-result)]]
    :tests  [#'operations-test/pull-conflicts-task-result-test]}
   {:name   :pull-trashed-in-use-as-count
    :doc    "A pull gives only the number of the trashed items that outside content uses."
    :target `operations/pull-task-result
    :edits  [[:replace '(trashed-in-use-entries steps trashed-in-use) []]]
    :tests  [#'operations-test/pull-task-result-test]}
   {:name   :deploy-trashed-in-use-as-count
    :doc    "A deploy gives only the number of the trashed items that outside content uses."
    :target `operations/deploy-task-result
    :edits  [[:replace '(trashed-in-use-entries steps trashed-in-use) []]]
    :tests  [#'deploy-operations-test/deploy-task-result-test]}
   {:name   :trashed-in-use-without-users
    :doc    "A trashed item in use does not name its users."
    :target `operations/trashed-in-use-entries
    :edits  [[:replace '(mapv (fn [user] (update user :kind name)) users) []]]
    :tests  [#'operations-test/pull-task-result-test]}
   {:name   :discard-keeps-the-local-content
    :doc    "The discard plans toward the local snapshot, so it writes nothing over the local changes."
    :target `discard/apply-base!
    :edits  [[:replace '(plan/plan l bs l) '(plan/plan l l l)]]
    :tests  [#'discard-test/discard-writes-the-base-over-the-local-changes-test]}
   {:name   :discard-without-the-fence
    :doc    "The discard commits also when its task may not commit."
    :target `discard/apply-base!
    :edits  [[:replace '(or fence (constantly nil)) '(constantly nil)]]
    :tests  [#'discard-test/discard-refusals-test]}
   {:name   :discard-over-a-lost-base
    :doc    "The discard does not check before it starts that a branch holds the base."
    :target `discard/discard!
    :edits  [[:replace '(not (pull/held? store b branch (store/head store branch))) false]]
    :tests  [#'discard-test/discard-refusals-test]}
   {:name   :discard-trusts-the-head-read-before-the-apply
    :doc    "The apply of a discard does not check again that a branch holds the base."
    :target `discard/apply-base!
    :edits  [[:replace '(pull/held? store b branch (store/head store branch)) true]]
    :tests  [#'discard-test/discard-refusals-test]}
   {:name   :discard-of-nothing
    :doc    "A discard with no local change applies an empty plan and reports a discard."
    :target `discard/apply-base!
    :edits  [[:replace '(empty? ids) false]]
    :tests  [#'discard-test/discard-writes-the-base-over-the-local-changes-test]}])

(deftest change-lists-mutations-test
  (mut/check mutations {:timeout-ms 120000}))
